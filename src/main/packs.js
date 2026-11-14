// Экспорт сборки в .mrpack, импорт сборок из файлов и добавление модов из jar/zip.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { nativeImage } = require('electron');
const { fetchJson } = require('./net');
const instances = require('./instances');
const modrinth = require('./modrinth');
const curseforge = require('./curseforge');
const minecraft = require('./minecraft');

const hashOf = (buf, algo) => crypto.createHash(algo).update(buf).digest('hex');

// ---------- Иконка сборки ----------
// Квадратная миниатюра 128×128 из любой картинки.
function makeIcon(file) {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) throw new Error('Не удалось прочитать картинку. Подойдут PNG, JPG и WebP.');
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  const square = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  return 'data:image/png;base64,' + square.resize({ width: 128, height: 128, quality: 'best' }).toPNG().toString('base64');
}

// ---------- Экспорт .mrpack ----------
const LOADER_KEY = { fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge' };

async function exportMrpack(id, dest, opts = {}, onProgress = () => {}) {
  const inst = instances.get(id);
  const root = instances.dirOf(id);
  const zip = new AdmZip();
  const files = [];
  const local = []; // файлы, которых нет на Modrinth: пойдут в overrides

  // Все файлы контента, кроме выключенных.
  const groups = [['mods', true], ['resourcepacks', opts.resourcepacks !== false], ['shaderpacks', opts.shaderpacks !== false]];
  const entries = [];
  for (const [sub, enabled] of groups) {
    if (!enabled) continue;
    let names = [];
    try {
      names = await fsp.readdir(path.join(root, sub));
    } catch {
      continue;
    }
    for (const n of names) {
      if (/\.(jar|zip)$/i.test(n)) entries.push({ rel: `${sub}/${n}`, full: path.join(root, sub, n) });
    }
  }

  onProgress('Подсчёт контрольных сумм', 0, entries.length);
  const sums = entries.map((e) => {
    const buf = fs.readFileSync(e.full);
    return { ...e, size: buf.length, sha1: hashOf(buf, 'sha1'), sha512: hashOf(buf, 'sha512') };
  });

  // Какие файлы знает Modrinth: для них вместо самого файла записывается ссылка на CDN.
  let known = {};
  let lookupFailed = false;
  if (sums.length && opts.useModrinthLinks !== false) {
    onProgress('Поиск файлов на Modrinth', 0, 0);
    try {
      known = await fetchJson('https://api.modrinth.com/v2/version_files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: sums.map((s) => s.sha1), algorithm: 'sha1' }),
      });
    } catch {
      lookupFailed = true;
    }
  }
  for (const s of sums) {
    const v = known[s.sha1];
    const f = v && v.files.find((x) => x.hashes && x.hashes.sha1 === s.sha1);
    if (f && /^https:\/\/cdn\.modrinth\.com\//.test(f.url)) {
      files.push({ path: s.rel, hashes: { sha1: s.sha1, sha512: s.sha512 }, env: { client: 'required', server: 'required' }, downloads: [f.url], fileSize: s.size });
    } else {
      local.push(s);
    }
  }

  onProgress('Упаковка файлов', 0, 0);
  for (const s of local) zip.addLocalFile(s.full, `overrides/${path.dirname(s.rel)}`);
  const addDir = (sub) => {
    const full = path.join(root, sub);
    if (fs.existsSync(full)) zip.addLocalFolder(full, `overrides/${sub}`);
  };
  const addFile = (name) => {
    const full = path.join(root, name);
    if (fs.existsSync(full)) zip.addLocalFile(full, 'overrides');
  };
  if (opts.config !== false) addDir('config');
  if (opts.options) addFile('options.txt');
  if (opts.servers) addFile('servers.dat');
  if (opts.worlds) addDir('saves');

  const dependencies = { minecraft: inst.version };
  if (inst.loader && inst.loader !== 'vanilla') {
    let lv = inst.loaderVersion;
    if (!lv) {
      try {
        const list = await minecraft.listLoaderVersions(inst.loader, inst.version);
        lv = ((list.find((l) => l.stable) || list[0]) || {}).version;
      } catch {
        /* версия загрузчика останется пустой */
      }
    }
    if (lv) dependencies[LOADER_KEY[inst.loader]] = lv;
  }
  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: opts.version || '1.0.0',
    name: opts.name || inst.name,
    summary: opts.summary || '',
    files,
    dependencies,
  };
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)));
  zip.writeZip(dest);
  return { path: dest, linked: files.length, bundled: local.length, lookupFailed };
}

// ---------- Импорт сборки из файла ----------
function detectPack(file) {
  const zip = new AdmZip(file);
  if (zip.getEntry('modrinth.index.json')) return 'mrpack';
  if (zip.getEntry('manifest.json')) return 'curseforge';
  return null;
}

async function importPack(file, onProgress) {
  const kind = detectPack(file);
  if (kind === 'mrpack') return modrinth.importMrpack(file, onProgress, { name: path.basename(file).replace(/\.(mrpack|zip)$/i, '') });
  if (kind === 'curseforge') return curseforge.importCfPack(file, onProgress, { name: path.basename(file).replace(/\.zip$/i, '') });
  throw new Error('Это не сборка: в архиве нет modrinth.index.json или manifest.json');
}

// ---------- Добавление файлов в сборку ----------
const MOD_MARKERS = ['fabric.mod.json', 'quilt.mod.json', 'META-INF/mods.toml', 'META-INF/neoforge.mods.toml', 'mcmod.info'];

function classifyZip(zip) {
  const names = zip.getEntries().map((e) => e.entryName);
  if (names.includes('modrinth.index.json') || names.includes('manifest.json')) return { kind: 'pack' };
  if (MOD_MARKERS.some((m) => names.includes(m))) return { kind: 'mod' };
  if (names.includes('pack.mcmeta')) return { kind: 'resourcepack' };
  if (names.some((n) => /^shaders\//.test(n))) return { kind: 'shader' };
  const jars = names.filter((n) => /\.jar$/i.test(n) && !/^META-INF\//.test(n));
  if (jars.length) return { kind: 'archive', jars };
  return { kind: 'unknown' };
}

async function addFiles(id, files) {
  const root = instances.dirOf(id);
  const added = [];
  const skipped = [];
  const put = async (sub, name, data) => {
    const dir = path.join(root, sub);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, path.basename(name)), data);
    added.push({ name: path.basename(name), folder: sub });
  };
  for (const file of files) {
    const name = path.basename(file);
    try {
      if (/\.jar$/i.test(name)) {
        await put('mods', name, await fsp.readFile(file));
      } else if (/\.mrpack$/i.test(name)) {
        skipped.push({ name, reason: 'это сборка: используйте «Импорт сборки» в библиотеке' });
      } else if (/\.zip$/i.test(name)) {
        const zip = new AdmZip(file);
        const c = classifyZip(zip);
        if (c.kind === 'mod') await put('mods', name.replace(/\.zip$/i, '.jar'), await fsp.readFile(file));
        else if (c.kind === 'resourcepack') await put('resourcepacks', name, await fsp.readFile(file));
        else if (c.kind === 'shader') await put('shaderpacks', name, await fsp.readFile(file));
        else if (c.kind === 'archive') {
          for (const jar of c.jars) await put('mods', jar, zip.getEntry(jar).getData());
        } else if (c.kind === 'pack') skipped.push({ name, reason: 'это сборка: используйте «Импорт сборки» в библиотеке' });
        else skipped.push({ name, reason: 'не похоже на мод, ресурспак или шейдер' });
      } else {
        skipped.push({ name, reason: 'поддерживаются файлы .jar и .zip' });
      }
    } catch (err) {
      skipped.push({ name, reason: err.message });
    }
  }
  return { added, skipped };
}

module.exports = { makeIcon, exportMrpack, importPack, addFiles };
