// Поиск и установка контента через публичный API Modrinth (https://docs.modrinth.com).
const path = require('path');
const fs = require('fs');
const { fetchJson, downloadFile } = require('./net');
const instances = require('./instances');

const API = 'https://api.modrinth.com/v2';

async function search({ query = '', type = 'mod', gameVersion = '', loader = '', versions = [], loaders = [], categories = [], client = false, server = false, openSource = false, sort = 'relevance', offset = 0, limit = 20 }) {
  const facets = [[`project_type:${type}`]];
  const vers = versions.length ? versions : gameVersion ? [gameVersion] : [];
  if (vers.length) facets.push(vers.map((v) => `versions:${v}`));
  const ldr = loaders.length ? loaders : loader && (type === 'mod' || type === 'modpack') ? [loader] : [];
  if (ldr.length) facets.push(ldr.length === 1 && ldr[0] === 'quilt' && !loaders.length ? ['categories:quilt', 'categories:fabric'] : ldr.map((l) => `categories:${l}`));
  for (const c of categories) facets.push([`categories:${c}`]); // категории складываются по И
  if (client) facets.push(['client_side:required', 'client_side:optional']);
  if (server) facets.push(['server_side:required', 'server_side:optional']);
  if (openSource) facets.push(['open_source:true']);
  const url = new URL(`${API}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('facets', JSON.stringify(facets));
  url.searchParams.set('index', sort);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  return fetchJson(url.toString());
}

// Справочники для фильтров: категории и загрузчики с иконками. Кэшируются на час.
let tagCache = null;
async function tags() {
  if (tagCache && Date.now() - tagCache.at < 3600e3) return tagCache.data;
  const [categories, loaders] = await Promise.all([fetchJson(`${API}/tag/category`), fetchJson(`${API}/tag/loader`)]);
  const data = {
    categories: categories.map((c) => ({ name: c.name, icon: c.icon, type: c.project_type, header: c.header })),
    loaders: loaders.map((l) => ({ name: l.name, icon: l.icon, types: l.supported_project_types })),
  };
  tagCache = { at: Date.now(), data };
  return data;
}

async function project(idOrSlug) {
  return fetchJson(`${API}/project/${encodeURIComponent(idOrSlug)}`);
}

function loadersFor(instance, projectType) {
  if (projectType === 'mod') return instance.loader === 'quilt' ? ['quilt', 'fabric'] : [instance.loader];
  if (projectType === 'resourcepack') return ['minecraft'];
  return null; // шейдеры: iris / optifine / canvas — не фильтруем
}

async function compatibleVersions(projectId, instance, projectType) {
  const url = new URL(`${API}/project/${encodeURIComponent(projectId)}/version`);
  url.searchParams.set('game_versions', JSON.stringify([instance.version]));
  const loaders = loadersFor(instance, projectType);
  if (loaders) url.searchParams.set('loaders', JSON.stringify(loaders));
  return fetchJson(url.toString());
}

/**
 * Устанавливает проект в сборку вместе с обязательными зависимостями.
 * Возвращает список установленных названий.
 */
async function install(instanceId, projectId, onProgress, versionId) {
  const instance = instances.get(instanceId);
  const installed = [];
  const visited = new Set();

  async function installOne(pid, depth) {
    if (visited.has(pid) || depth > 4) return;
    visited.add(pid);
    if (depth > 0) {
      const have = Object.values(instances.get(instanceId).content || {});
      if (have.some((c) => c.projectId === pid)) return; // зависимость уже стоит
    }
    const proj = await project(pid);
    const type = proj.project_type;
    if (!instances.CONTENT_DIRS[type]) throw new Error(`Тип «${type}» пока не поддерживается`);
    if (type === 'mod' && (!instance.loader || instance.loader === 'vanilla')) {
      throw new Error('Для модов нужна сборка с Fabric или Quilt');
    }
    const versions = versionId && depth === 0 ? [{}] : await compatibleVersions(pid, instance, type);
    if (!versions.length) {
      throw new Error(`«${proj.title}» не поддерживает ${instance.loader} ${instance.version}`);
    }
    const version = versionId && depth === 0 ? await fetchJson(`${API}/version/${encodeURIComponent(versionId)}`) : versions.find((v) => v.version_type === 'release') || versions[0];
    const file = version.files.find((f) => f.primary) || version.files[0];
    const dir = path.join(instances.dirOf(instanceId), instances.CONTENT_DIRS[type]);

    // Удаляем старую версию этого же проекта.
    const meta = instances.get(instanceId);
    const content = { ...(meta.content || {}) };
    for (const [fname, info] of Object.entries(content)) {
      if (info.projectId === proj.id && fname !== file.filename) {
        fs.rmSync(path.join(dir, fname), { force: true });
        fs.rmSync(path.join(dir, fname + '.disabled'), { force: true });
        delete content[fname];
      }
    }

    if (onProgress) onProgress(`Загрузка ${proj.title}`);
    await downloadFile(file.url, path.join(dir, file.filename), { sha1: file.hashes && file.hashes.sha1 });
    content[file.filename] = {
      projectId: proj.id,
      slug: proj.slug,
      title: proj.title,
      iconUrl: proj.icon_url,
      versionNumber: version.version_number,
      versionId: version.id,
      author: proj.team,
    };
    instances.update(instanceId, { content });
    installed.push(proj.title);

    for (const dep of version.dependencies || []) {
      if (dep.dependency_type === 'required' && dep.project_id) await installOne(dep.project_id, depth + 1);
    }
  }

  await installOne(projectId, 0);
  return installed;
}

// Страница проекта: описание, версии, галерея, авторы.
async function detail(idOrSlug, instanceId) {
  const proj = await project(idOrSlug);
  const q = new URLSearchParams();
  let inst = null;
  if (instanceId) {
    try {
      inst = instances.get(instanceId);
    } catch {
      inst = null;
    }
  }
  if (inst) {
    q.set('game_versions', JSON.stringify([inst.version]));
    const l = loadersFor(inst, proj.project_type);
    if (l) q.set('loaders', JSON.stringify(l));
  }
  const [versions, members] = await Promise.all([
    fetchJson(`${API}/project/${encodeURIComponent(proj.id)}/version?${q}`).catch(() => []),
    fetchJson(`${API}/project/${encodeURIComponent(proj.id)}/members`).catch(() => []),
  ]);
  return {
    source: 'modrinth',
    id: proj.id,
    slug: proj.slug,
    type: proj.project_type,
    title: proj.title,
    summary: proj.description,
    body: proj.body || '',
    bodyFormat: 'markdown',
    icon: proj.icon_url,
    downloads: proj.downloads,
    follows: proj.followers,
    categories: proj.categories || [],
    gameVersions: (proj.game_versions || []).slice(-8),
    loaders: proj.loaders || [],
    updated: proj.updated,
    authors: members.map((m) => m.user && m.user.username).filter(Boolean),
    gallery: (proj.gallery || []).map((g) => ({ url: g.url, title: g.title || '' })),
    links: { site: `https://modrinth.com/${proj.project_type}/${proj.slug}`, source: proj.source_url, issues: proj.issues_url, wiki: proj.wiki_url, discord: proj.discord_url },
    filtered: !!inst,
    versions: versions.map((v) => ({ id: v.id, name: v.version_number, title: v.name, type: v.version_type, date: v.date_published, downloads: v.downloads, gameVersions: v.game_versions, loaders: v.loaders })),
  };
}

// Сборка .mrpack: создаём новую сборку, качаем файлы с проверкой sha1 и распаковываем overrides.
async function installModpack(projectId, onProgress) {
  const proj = await project(projectId);
  const versions = await fetchJson(`${API}/project/${encodeURIComponent(projectId)}/version`);
  const version = versions.find((v) => v.version_type === 'release') || versions[0];
  if (!version) throw new Error('У этой сборки нет доступных версий');
  const file = version.files.find((f) => f.primary) || version.files[0];
  onProgress('Загрузка сборки', 0, 0);
  const store = require('./store');
  const AdmZip = require('adm-zip');
  const { runPool } = require('./net');
  const zipPath = path.join(store.paths.cache, `mr-${projectId}.mrpack`);
  await downloadFile(file.url, zipPath, { sha1: file.hashes && file.hashes.sha1 });
  try {
    return await importMrpack(zipPath, onProgress, { name: proj.title, iconUrl: proj.icon_url });
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}

// Импорт готового .mrpack (скачанного или выбранного пользователем): создаёт новую сборку.
async function importMrpack(zipPath, onProgress, meta = {}) {
  const AdmZip = require('adm-zip');
  const { runPool } = require('./net');
  const zip = new AdmZip(zipPath);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('В архиве нет modrinth.index.json');
  const index = JSON.parse(indexEntry.getData().toString('utf8'));
  const dep = index.dependencies || {};
  const loaders = [['fabric-loader', 'fabric'], ['quilt-loader', 'quilt'], ['neoforge', 'neoforge'], ['forge', 'forge']];
  const found = loaders.find(([k]) => dep[k]);
  const instance = instances.create({ name: index.name || meta.name || 'Импортированная сборка', version: dep.minecraft, loader: found ? found[1] : 'vanilla', loaderVersion: found ? dep[found[0]] : '' });
  const gameDir = instances.dirOf(instance.id);
  const root = path.resolve(gameDir);
  const content = {};
  const tasks = (index.files || [])
    .filter((f) => !(f.env && f.env.client === 'unsupported'))
    .map((f) => async () => {
      const dest = path.resolve(root, f.path);
      if (!dest.startsWith(root + path.sep)) return;
      await downloadFile(f.downloads[0], dest, { sha1: f.hashes && f.hashes.sha1 });
      if (/^mods\//.test(f.path)) content[path.basename(f.path)] = { title: path.basename(f.path).replace(/\.jar$/i, '') };
    });
  await runPool(tasks, 6, (d, t) => onProgress('Загрузка файлов', d, t));
  instances.extractOverrides(zip, ['overrides', 'client-overrides'], gameDir);
  return { instance: instances.update(instance.id, { content, name: index.name || meta.name || 'Импортированная сборка', iconUrl: meta.iconUrl }), manual: [], loader: found ? found[1] : 'vanilla' };
}

module.exports = { tags, detail, search, project, install, installModpack, importMrpack };
