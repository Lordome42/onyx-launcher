// CurseForge API: поиск и установка модов, ресурспаков, шейдеров и сборок. Нужен личный ключ API (console.curseforge.com).
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { fetchJson, downloadFile, runPool } = require('./net');
const store = require('./store');
const instances = require('./instances');

const API = 'https://api.curseforge.com/v1';
const GAME = 432;
const CLASS = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552 };
const LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const SORT = { relevance: 1, downloads: 6, follows: 2, newest: 11, updated: 3 };

async function cf(route, opts = {}) {
  const key = store.getSettings().curseforgeKey.trim();
  if (!key) throw new Error('Для CurseForge нужен ключ API: Настройки → CurseForge.');
  try {
    return await fetchJson(API + route, { ...opts, headers: { 'x-api-key': key, Accept: 'application/json', ...(opts.headers || {}) } });
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw new Error('CurseForge не принял ключ API. Проверьте его в настройках.');
    throw err;
  }
}

const post = (route, body) => cf(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function toHit(m, type) {
  return {
    source: 'curseforge',
    project_id: String(m.id),
    slug: m.slug,
    project_type: type,
    title: m.name,
    description: m.summary,
    icon_url: m.logo ? m.logo.thumbnailUrl || m.logo.url : null,
    downloads: m.downloadCount || 0,
    follows: m.thumbsUpCount || 0,
    author: (m.authors && m.authors[0] && m.authors[0].name) || '',
    display_categories: (m.categories || []).slice(0, 4).map((c) => c.name),
    date_modified: m.dateModified,
    url: m.links && m.links.websiteUrl,
    allowed: m.allowModDistribution !== false,
  };
}

async function search({ query = '', type = 'mod', gameVersion = '', loader = '', versions = [], loaders = [], sort = 'relevance', offset = 0, limit = 20 }) {
  const q = new URLSearchParams({ gameId: GAME, classId: CLASS[type], pageSize: limit, index: offset, sortField: SORT[sort] || 2, sortOrder: 'desc' });
  if (query) q.set('searchFilter', query);
  gameVersion = versions[0] || gameVersion;
  loader = loaders[0] || loader;
  if (gameVersion) q.set('gameVersion', gameVersion);
  if (loader && LOADER[loader] && (type === 'mod' || type === 'modpack')) q.set('modLoaderType', LOADER[loader]);
  const res = await cf(`/mods/search?${q}`);
  return { hits: res.data.map((m) => toHit(m, type)), total_hits: res.pagination ? res.pagination.totalCount : res.data.length };
}

function pickFile(files) {
  return files.find((f) => f.releaseType === 1) || files[0];
}

async function filesFor(modId, version, loader) {
  const loaders = loader === 'quilt' ? [LOADER.quilt, LOADER.fabric] : loader ? [LOADER[loader]] : [null];
  for (const l of loaders) {
    const q = new URLSearchParams({ pageSize: 50 });
    if (version) q.set('gameVersion', version);
    if (l) q.set('modLoaderType', l);
    const res = await cf(`/mods/${modId}/files?${q}`);
    if (res.data.length) return res.data;
  }
  return [];
}

const manual = (mod) => `«${mod.name}»: автор запретил скачивание вне сайта CurseForge`;

async function install(instanceId, modId, onProgress, fileId) {
  const instance = instances.get(instanceId);
  const installed = [];
  const skipped = [];
  const visited = new Set();

  async function one(id, depth) {
    if (visited.has(id) || depth > 4) return;
    visited.add(id);
    if (depth > 0 && Object.values(instances.get(instanceId).content || {}).some((c) => c.projectId === `cf:${id}`)) return;
    const mod = (await cf(`/mods/${id}`)).data;
    const type = Object.keys(CLASS).find((k) => CLASS[k] === mod.classId);
    if (!type || type === 'modpack') throw new Error('Сборки CurseForge устанавливаются как новая сборка, а не в существующую');
    if (type === 'mod' && (!instance.loader || instance.loader === 'vanilla')) throw new Error('Для модов нужна сборка с загрузчиком (Fabric, Quilt, Forge или NeoForge)');
    let file;
    if (fileId && depth === 0) file = (await cf(`/mods/${id}/files/${fileId}`)).data;
    else {
      const files = await filesFor(id, instance.version, type === 'mod' ? instance.loader : '');
      if (!files.length) throw new Error(`«${mod.name}» не поддерживает ${instance.loader} ${instance.version}`);
      file = pickFile(files);
    }
    if (!file.downloadUrl) {
      if (depth === 0) throw new Error(`${manual(mod)}. Откройте страницу мода на CurseForge и скачайте файл вручную.`);
      skipped.push(manual(mod));
      return;
    }
    const dir = path.join(instances.dirOf(instanceId), instances.CONTENT_DIRS[type]);
    if (onProgress) onProgress(`Загрузка ${mod.name}`);
    const sha1 = (file.hashes || []).find((h) => h.algo === 1);
    await downloadFile(file.downloadUrl, path.join(dir, file.fileName), { sha1: sha1 && sha1.value });
    const content = { ...(instances.get(instanceId).content || {}) };
    for (const [fname, info] of Object.entries(content)) {
      if (info.projectId === `cf:${mod.id}` && fname !== file.fileName) {
        fs.rmSync(path.join(dir, fname), { force: true });
        fs.rmSync(path.join(dir, fname + '.disabled'), { force: true });
        delete content[fname];
      }
    }
    content[file.fileName] = { projectId: `cf:${mod.id}`, source: 'curseforge', title: mod.name, iconUrl: mod.logo && mod.logo.thumbnailUrl, versionNumber: file.displayName, fileId: file.id };
    instances.update(instanceId, { content });
    installed.push(mod.name);
    for (const dep of file.dependencies || []) if (dep.relationType === 3) await one(dep.modId, depth + 1);
  }

  await one(modId, 0);
  return { installed, skipped };
}

function parseLoader(id) {
  const m = /^(forge|neoforge|fabric|quilt)-(.+)$/.exec(id || '');
  return m ? { loader: m[1], loaderVersion: m[2] } : { loader: 'vanilla', loaderVersion: '' };
}

async function installModpack(modId, onProgress) {
  const mod = (await cf(`/mods/${modId}`)).data;
  const files = (await cf(`/mods/${modId}/files?pageSize=20`)).data;
  const file = pickFile(files);
  if (!file) throw new Error('У этой сборки нет файлов для скачивания');
  if (!file.downloadUrl) throw new Error(`${manual(mod)}. Откройте страницу сборки на CurseForge.`);

  onProgress('Загрузка сборки', 0, 0);
  const zipPath = path.join(store.paths.cache, `cf-${modId}-${file.id}.zip`);
  await downloadFile(file.downloadUrl, zipPath);
  try {
    return await importCfPack(zipPath, onProgress, mod);
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}

// Импорт сборки CurseForge из zip с manifest.json (скачанного или выбранного пользователем).
async function importCfPack(zipPath, onProgress, mod = {}) {
  const zip = new AdmZip(zipPath);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('В архиве нет manifest.json: это не сборка CurseForge');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  const primary = (manifest.minecraft.modLoaders || []).find((l) => l.primary) || (manifest.minecraft.modLoaders || [])[0];
  const { loader, loaderVersion } = parseLoader(primary && primary.id);

  const instance = instances.create({ name: manifest.name || mod.name, version: manifest.minecraft.version, loader, loaderVersion });
  const gameDir = instances.dirOf(instance.id);
  const ids = manifest.files.map((f) => f.fileID);
  const modIds = [...new Set(manifest.files.map((f) => f.projectID))];

  onProgress('Получение списка файлов', 0, 0);
  const fileInfo = {};
  const modInfo = {};
  for (let i = 0; i < ids.length; i += 100) for (const f of (await post('/mods/files', { fileIds: ids.slice(i, i + 100) })).data) fileInfo[f.id] = f;
  for (let i = 0; i < modIds.length; i += 100) for (const m of (await post('/mods', { modIds: modIds.slice(i, i + 100) })).data) modInfo[m.id] = m;

  const content = {};
  const manualList = [];
  const tasks = manifest.files.map((entry) => async () => {
    const f = fileInfo[entry.fileID];
    const m = modInfo[entry.projectID];
    if (!f || !f.downloadUrl) {
      manualList.push({ name: (m && m.name) || `проект ${entry.projectID}`, url: m && m.links && m.links.websiteUrl });
      return;
    }
    const folder = instances.folderFor(m && m.classId);
    const sha1 = (f.hashes || []).find((h) => h.algo === 1);
    await downloadFile(f.downloadUrl, path.join(gameDir, folder, f.fileName), { sha1: sha1 && sha1.value });
    if (folder === 'mods') content[f.fileName] = { projectId: `cf:${entry.projectID}`, source: 'curseforge', title: m && m.name, iconUrl: m && m.logo && m.logo.thumbnailUrl, versionNumber: f.displayName };
  });
  await runPool(tasks, 6, (d, t) => onProgress('Загрузка модов', d, t));

  instances.extractOverrides(zip, [manifest.overrides || 'overrides'], gameDir);
  const saved = instances.update(instance.id, { content, name: manifest.name || mod.name || 'Импортированная сборка' });
  return { instance: saved, manual: manualList, loader };
}

// Страница мода на CurseForge: описание (HTML) и файлы.
async function detail(modId, instanceId) {
  const mod = (await cf(`/mods/${modId}`)).data;
  const description = (await cf(`/mods/${modId}/description`).catch(() => ({ data: '' }))).data;
  let inst = null;
  if (instanceId) {
    try {
      inst = instances.get(instanceId);
    } catch {
      inst = null;
    }
  }
  const type = Object.keys(CLASS).find((k) => CLASS[k] === mod.classId) || 'mod';
  const q = new URLSearchParams({ pageSize: 40 });
  if (inst) {
    q.set('gameVersion', inst.version);
    if (type === 'mod' && LOADER[inst.loader]) q.set('modLoaderType', LOADER[inst.loader]);
  }
  const files = (await cf(`/mods/${modId}/files?${q}`).catch(() => ({ data: [] }))).data;
  return {
    source: 'curseforge',
    id: String(mod.id),
    slug: mod.slug,
    type,
    title: mod.name,
    summary: mod.summary,
    body: description,
    bodyFormat: 'html',
    icon: mod.logo && (mod.logo.thumbnailUrl || mod.logo.url),
    downloads: mod.downloadCount,
    follows: mod.thumbsUpCount || 0,
    categories: (mod.categories || []).map((c) => c.name),
    gameVersions: [...new Set((mod.latestFilesIndexes || []).map((f) => f.gameVersion))].slice(0, 8),
    loaders: [],
    updated: mod.dateModified,
    authors: (mod.authors || []).map((a) => a.name),
    gallery: (mod.screenshots || []).map((s) => ({ url: s.url, title: s.title || '' })),
    links: { site: mod.links && mod.links.websiteUrl, source: mod.links && mod.links.sourceUrl, issues: mod.links && mod.links.issuesUrl, wiki: mod.links && mod.links.wikiUrl },
    allowed: mod.allowModDistribution !== false,
    filtered: !!inst,
    versions: files.map((f) => ({ id: String(f.id), name: f.displayName, title: f.fileName, type: ['', 'release', 'beta', 'alpha'][f.releaseType] || 'release', date: f.fileDate, downloads: f.downloadCount, gameVersions: f.gameVersions.filter((g) => /^\d/.test(g)), loaders: f.gameVersions.filter((g) => !/^\d/.test(g)).map((g) => g.toLowerCase()), downloadable: !!f.downloadUrl })),
  };
}

// Самый свежий подходящий файл для проверки обновлений.
async function latestFile(instance, modId, type) {
  const files = await filesFor(modId, instance.version, type === 'mod' ? instance.loader : '');
  return files.length ? pickFile(files) : null;
}

module.exports = { detail, latestFile, search, install, installModpack, importCfPack };
