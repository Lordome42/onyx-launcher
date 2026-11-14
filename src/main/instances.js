// Сборки (инстансы): каждая хранится в своей папке со своим instance.json, модами и мирами.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { paths, readJson, writeJson } = require('./store');
const local = require('./local');

const CONTENT_DIRS = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

function dirOf(id) {
  const dir = path.join(paths.instances, id);
  if (path.dirname(dir) !== paths.instances) throw new Error('Некорректный id сборки');
  return dir;
}

function metaFile(id) {
  return path.join(dirOf(id), 'instance.json');
}

function slugify(name) {
  const translit = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  const s = name
    .toLowerCase()
    .split('')
    .map((c) => translit[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return s || 'instance';
}

function list() {
  const out = [];
  for (const id of fs.readdirSync(paths.instances)) {
    const meta = readJson(path.join(paths.instances, id, 'instance.json'), null);
    if (meta) out.push({ ...meta, id });
  }
  return out.sort((a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0));
}

function get(id) {
  const meta = readJson(metaFile(id), null);
  if (!meta) throw new Error('Сборка не найдена');
  return { ...meta, id };
}

function create({ name, version, loader = 'vanilla', loaderVersion = '', hue }) {
  name = String(name || '').trim() || `Minecraft ${version}`;
  let id = slugify(name);
  while (fs.existsSync(path.join(paths.instances, id))) id = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
  const meta = {
    name,
    version,
    loader,
    loaderVersion,
    hue: Number.isFinite(hue) ? hue : Math.floor(Math.random() * 360),
    created: Date.now(),
    lastPlayed: 0,
    playTime: 0,
    content: {},
  };
  fs.mkdirSync(dirOf(id), { recursive: true });
  writeJson(metaFile(id), meta);
  return { ...meta, id };
}

function update(id, patch) {
  const current = get(id);
  const { id: _ignored, ...rest } = { ...current, ...patch };
  writeJson(metaFile(id), rest);
  return { ...rest, id };
}

async function remove(id) {
  await fsp.rm(dirOf(id), { recursive: true, force: true });
  return true;
}

function recordPlay(id, playedMs) {
  const meta = get(id);
  return update(id, { lastPlayed: Date.now(), playTime: (meta.playTime || 0) + Math.max(0, playedMs || 0) });
}

// Список установленного контента (моды, ресурспаки, шейдеры): иконки и названия берутся из самих файлов.
async function listContent(id) {
  const meta = get(id);
  const files = [];
  for (const [type, sub] of Object.entries(CONTENT_DIRS)) {
    const dir = path.join(dirOf(id), sub);
    let names = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const file of names) {
      if (/\.(jar|zip)(\.disabled)?$/i.test(file)) files.push({ type, file, full: path.join(dir, file) });
    }
  }
  const out = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const idx = next++;
      const { type, file, full } = files[idx];
      const enabled = !file.endsWith('.disabled');
      const baseName = file.replace(/\.disabled$/, '');
      const known = (meta.content || {})[baseName] || {};
      let st;
      let info = { title: null, version: null, icon: null };
      try {
        st = await fsp.stat(full);
        info = await local.archiveInfo(full, type);
      } catch {
        st = { size: 0 };
      }
      out[idx] = {
        ...known,
        file,
        baseName,
        type,
        enabled,
        size: st.size,
        title: known.title || info.title || baseName.replace(/\.(jar|zip)$/i, ''),
        versionNumber: known.versionNumber || info.version || null,
        iconUrl: info.icon || known.iconUrl || null,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

const listWorlds = (id) => local.listWorlds(dirOf(id));

async function listServers(id) {
  const own = ((get(id).servers || []).map((s) => ({ ...s, fromGame: false })));
  const game = await local.readGameServers(dirOf(id));
  const seen = new Set(own.map((s) => s.address.toLowerCase()));
  return [...own, ...game.filter((s) => !seen.has(s.address.toLowerCase()))];
}

async function addServer(id, name, address) {
  address = String(address || '').trim();
  if (!/^[\w.-]+(:\d{1,5})?$/.test(address)) throw new Error('Введите адрес сервера, например play.example.com или 1.2.3.4:25565');
  const servers = [...(get(id).servers || [])].filter((s) => s.address.toLowerCase() !== address.toLowerCase());
  servers.push({ name: String(name || '').trim() || address, address });
  update(id, { servers });
  return listServers(id);
}

async function removeServer(id, address) {
  update(id, { servers: (get(id).servers || []).filter((s) => s.address !== address) });
  return listServers(id);
}

async function toggleContent(id, type, file) {
  const dir = path.join(dirOf(id), CONTENT_DIRS[type]);
  const src = path.join(dir, path.basename(file));
  const dest = src.endsWith('.disabled') ? src.slice(0, -'.disabled'.length) : src + '.disabled';
  await fsp.rename(src, dest);
  return listContent(id);
}

async function removeContent(id, type, file) {
  const dir = path.join(dirOf(id), CONTENT_DIRS[type]);
  await fsp.rm(path.join(dir, path.basename(file)), { force: true });
  const meta = get(id);
  const content = { ...(meta.content || {}) };
  delete content[path.basename(file).replace(/\.disabled$/, '')];
  update(id, { content });
  return listContent(id);
}

module.exports = { listWorlds, listServers, addServer, removeServer, CONTENT_DIRS, dirOf, list, get, create, update, remove, recordPlay, listContent, toggleContent, removeContent };

// Распаковывает папки overrides из сборки в папку игры (с защитой от выхода за её пределы).
function extractOverrides(zip, prefixes, gameDir) {
  const root = path.resolve(gameDir);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const prefix = prefixes.find((p) => entry.entryName.startsWith(p + '/'));
    if (!prefix) continue;
    const dest = path.resolve(root, entry.entryName.slice(prefix.length + 1));
    if (!dest.startsWith(root + path.sep)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
  }
}

function folderFor(classId) {
  return { 12: 'resourcepacks', 6552: 'shaderpacks' }[classId] || 'mods';
}

module.exports.extractOverrides = extractOverrides;
module.exports.folderFor = folderFor;
