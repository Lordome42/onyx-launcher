// Onyx Visual — наш визуальный мод. Берём свежий релиз с GitHub и кладём в сборку вместе с Fabric API.
const path = require('path');
const fs = require('fs');
const { fetchJson, downloadFile } = require('./net');
const instances = require('./instances');
const modrinth = require('./modrinth');

const REPO = 'Lordome42/onyx-visual';
const FABRIC_API = 'P7dR8mSH'; // Fabric API на Modrinth
const KEY = 'github:' + REPO;
let cache = null;

async function latest(force = false) {
  if (!force && cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.info;
  let rel;
  try {
    rel = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  } catch (err) {
    if (err.status === 404) throw new Error('Релиз Onyx Visual ещё не опубликован. Загляните позже.');
    throw err;
  }
  const asset = (rel.assets || []).find((a) => /\.jar$/i.test(a.name) && !/(sources|dev)/i.test(a.name));
  if (!asset) throw new Error('В релизе Onyx Visual нет .jar файла');
  const m = asset.name.match(/\+(\d+(?:\.\d+)*)\.jar$/i);
  const info = { tag: rel.tag_name, name: rel.name || rel.tag_name, file: asset.name, url: asset.browser_download_url, size: asset.size, minecraft: m ? m[1] : '', notes: rel.body || '', page: rel.html_url };
  cache = { at: Date.now(), info };
  return info;
}

function compatible(info, inst) {
  if (!info.minecraft) return true;
  return inst.version === info.minecraft || inst.version.startsWith(info.minecraft + '.');
}

// Состояние для сборки: подходит ли, установлен ли, есть ли обновление.
async function status(instanceId) {
  const inst = instances.get(instanceId);
  const info = await latest();
  const entry = Object.entries(inst.content || {}).find(([, c]) => c.projectId === KEY);
  const hasFile = entry && fs.existsSync(path.join(instances.dirOf(instanceId), 'mods', entry[0]));
  return {
    latest: info.tag,
    minecraft: info.minecraft,
    compatible: compatible(info, inst) && (inst.loader === 'fabric' || inst.loader === 'quilt'),
    reason: !['fabric', 'quilt'].includes(inst.loader) ? 'Нужна сборка с Fabric или Quilt' : !compatible(info, inst) ? `Мод рассчитан на Minecraft ${info.minecraft}, а в сборке ${inst.version}` : '',
    installed: hasFile ? entry[1].versionNumber : null,
    outdated: !!hasFile && entry[1].versionNumber !== info.tag,
  };
}

async function install(instanceId, onProgress = () => {}) {
  const inst = instances.get(instanceId);
  if (!['fabric', 'quilt'].includes(inst.loader)) throw new Error('Onyx Visual работает на Fabric. Создайте сборку с Fabric.');
  onProgress('Проверка релиза');
  const info = await latest(true);
  if (!compatible(info, inst)) throw new Error(`Onyx Visual рассчитан на Minecraft ${info.minecraft}, а в сборке «${inst.name}» ${inst.version}.`);

  // Fabric API нужен моду: ставим, если его ещё нет.
  const have = Object.values(instances.get(instanceId).content || {});
  const result = { installed: ['Onyx Visual'], fabricApi: false };
  if (!have.some((c) => c.projectId === FABRIC_API || c.slug === 'fabric-api')) {
    onProgress('Установка Fabric API');
    await modrinth.install(instanceId, FABRIC_API, onProgress);
    result.fabricApi = true;
  }

  const dir = path.join(instances.dirOf(instanceId), 'mods');
  fs.mkdirSync(dir, { recursive: true });
  const content = { ...(instances.get(instanceId).content || {}) };
  for (const [fname, c] of Object.entries(content)) {
    if (c.projectId === KEY) {
      fs.rmSync(path.join(dir, fname), { force: true });
      fs.rmSync(path.join(dir, fname + '.disabled'), { force: true });
      delete content[fname];
    }
  }
  onProgress('Загрузка Onyx Visual');
  await downloadFile(info.url, path.join(dir, info.file));
  content[info.file] = { projectId: KEY, slug: 'onyx-visual', title: 'Onyx Visual', versionNumber: info.tag, author: 'Lordome42' };
  instances.update(instanceId, { content });
  return { ...result, version: info.tag };
}

module.exports = { latest, status, install };
