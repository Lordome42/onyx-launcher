// Проверка и установка обновлений контента сборки (Modrinth по контрольным суммам, CurseForge по проектам).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { fetchJson } = require('./net');
const store = require('./store');
const instances = require('./instances');
const modrinth = require('./modrinth');
const curseforge = require('./curseforge');

async function scan(id) {
  const out = [];
  for (const [type, sub] of Object.entries(instances.CONTENT_DIRS)) {
    const dir = path.join(instances.dirOf(id), sub);
    let names = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const file of names) {
      if (!/\.(jar|zip)(\.disabled)?$/i.test(file)) continue;
      const full = path.join(dir, file);
      const sha1 = crypto.createHash('sha1').update(await fsp.readFile(full)).digest('hex');
      out.push({ type, file, full, sha1, baseName: file.replace(/\.disabled$/, '') });
    }
  }
  return out;
}

const loadersOf = (inst, type) => (type === 'mod' ? (inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader]) : type === 'resourcepack' ? ['minecraft'] : null);

async function check(id) {
  const inst = instances.get(id);
  const meta = inst.content || {};
  const files = await scan(id);
  const updates = [];
  let checked = 0;

  // Modrinth: один запрос на каждый тип контента
  for (const type of Object.keys(instances.CONTENT_DIRS)) {
    const group = files.filter((f) => f.type === type);
    if (!group.length || (type === 'mod' && (!inst.loader || inst.loader === 'vanilla'))) continue;
    const body = { hashes: group.map((f) => f.sha1), algorithm: 'sha1', game_versions: [inst.version] };
    const loaders = loadersOf(inst, type);
    if (loaders) body.loaders = loaders;
    let latest = {};
    try {
      latest = await fetchJson('https://api.modrinth.com/v2/version_files/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      continue; // Modrinth недоступен — пропускаем
    }
    for (const f of group) {
      const v = latest[f.sha1];
      if (!v) continue;
      checked++;
      const nf = v.files.find((x) => x.primary) || v.files[0];
      if (nf && nf.hashes.sha1 !== f.sha1) {
        const k = meta[f.baseName] || {};
        updates.push({ key: `m:${f.file}`, source: 'modrinth', type, file: f.file, title: k.title || f.baseName.replace(/\.(jar|zip)$/i, ''), current: k.versionNumber || f.baseName, latest: v.version_number, projectId: v.project_id, versionId: v.id, enabled: !f.file.endsWith('.disabled') });
      }
    }
  }

  // CurseForge: только то, что ставилось оттуда
  const haveKey = !!store.getSettings().curseforgeKey.trim();
  if (haveKey) {
    for (const f of files) {
      const k = meta[f.baseName];
      if (!k || k.source !== 'curseforge' || !/^cf:/.test(k.projectId || '')) continue;
      try {
        const nf = await curseforge.latestFile(inst, k.projectId.slice(3), f.type);
        checked++;
        if (nf && nf.fileName !== f.baseName && (!k.fileId || nf.id > k.fileId)) {
          updates.push({ key: `c:${f.file}`, source: 'curseforge', type: f.type, file: f.file, title: k.title || f.baseName, current: k.versionNumber || f.baseName, latest: nf.displayName, projectId: k.projectId.slice(3), versionId: String(nf.id), enabled: !f.file.endsWith('.disabled'), blocked: !nf.downloadUrl });
        }
      } catch {
        /* пропускаем проект */
      }
    }
  }
  return { updates, checked, total: files.length };
}

async function apply(id, items, onProgress = () => {}) {
  const updated = [];
  const failed = [];
  let n = 0;
  for (const it of items) {
    onProgress(`Обновление ${it.title}`, n++, items.length);
    const dir = path.join(instances.dirOf(id), instances.CONTENT_DIRS[it.type]);
    const before = new Set(fs.readdirSync(dir));
    try {
      if (it.source === 'modrinth') await modrinth.install(id, it.projectId, () => {}, it.versionId);
      else await curseforge.install(id, it.projectId, () => {}, it.versionId);
      const after = fs.readdirSync(dir);
      // Старый файл мог быть добавлен вручную и не числиться в метаданных — убираем его сами.
      const fresh = after.filter((x) => !before.has(x) && !x.endsWith('.disabled'));
      if (fs.existsSync(path.join(dir, it.file)) && !fresh.includes(it.file.replace(/\.disabled$/, ''))) fs.rmSync(path.join(dir, it.file), { force: true });
      if (!it.enabled) for (const x of fresh) fs.renameSync(path.join(dir, x), path.join(dir, x + '.disabled'));
      updated.push(it.title);
    } catch (err) {
      failed.push({ title: it.title, error: err.message });
    }
  }
  onProgress('Готово', items.length, items.length);
  return { updated, failed };
}

module.exports = { check, apply };
