// Хранилище, кеш, резервные копии и экспорт отладочной информации.
const { app, dialog, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const store = require('./store');
const instances = require('./instances');

const { paths } = store;
const backupsDir = () => path.join(paths.root, 'backups');

async function dirSize(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else if (e.isFile()) total += (await fsp.stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

// Что в кеше можно удалять без вреда: загруженные установщики и временные архивы сборок.
const KEEP_IN_CACHE = new Set(['icons', 'version_manifest_v2.json']);
async function extraEntries() {
  let names = [];
  try {
    names = await fsp.readdir(paths.cache);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (KEEP_IN_CACHE.has(n)) continue;
    const full = path.join(paths.cache, n);
    const st = await fsp.stat(full).catch(() => null);
    if (!st) continue;
    out.push({ full, mtime: st.mtimeMs, size: st.isDirectory() ? await dirSize(full) : st.size });
  }
  return out;
}

async function storageInfo() {
  const [own, shared, cacheAll, extra] = await Promise.all([
    dirSize(paths.instances),
    Promise.all([paths.versions, paths.libraries, paths.assets, paths.runtimes].map(dirSize)).then((a) => a.reduce((x, y) => x + y, 0)),
    dirSize(paths.cache),
    extraEntries().then((l) => l.reduce((s, e) => s + e.size, 0)),
  ]);
  return { own, shared, extra, cache: cacheAll, total: own + shared + cacheAll, dir: paths.root };
}

async function cleanExtra() {
  const list = await extraEntries();
  let freed = 0;
  for (const e of list) {
    await fsp.rm(e.full, { recursive: true, force: true }).catch(() => {});
    freed += e.size;
  }
  await fsp.mkdir(paths.installers, { recursive: true });
  return { freed };
}

async function clearCache() {
  const before = await dirSize(paths.cache);
  const names = await fsp.readdir(paths.cache).catch(() => []);
  for (const n of names) await fsp.rm(path.join(paths.cache, n), { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(paths.icons, { recursive: true });
  await fsp.mkdir(paths.installers, { recursive: true });
  return { freed: before };
}

// Держит лишний кеш в пределах заданного объёма: самое старое удаляется первым.
async function pruneCache() {
  const limit = Math.max(0, Number(store.getSettings().cacheLimitGB)) * 1024 ** 3;
  const list = (await extraEntries()).sort((a, b) => a.mtime - b.mtime);
  let total = list.reduce((s, e) => s + e.size, 0);
  for (const e of list) {
    if (total <= limit) break;
    await fsp.rm(e.full, { recursive: true, force: true }).catch(() => {});
    total -= e.size;
  }
  await fsp.mkdir(paths.installers, { recursive: true });
}

// ---------- Резервные копии важных данных ----------
async function backupNow() {
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(backupsDir(), stamp);
  await fsp.mkdir(dir, { recursive: true });
  for (const f of [paths.settingsFile, paths.accountsFile]) {
    if (fs.existsSync(f)) await fsp.copyFile(f, path.join(dir, path.basename(f)));
  }
  const metaDir = path.join(dir, 'instances');
  for (const id of fs.existsSync(paths.instances) ? fs.readdirSync(paths.instances) : []) {
    const src = path.join(paths.instances, id, 'instance.json');
    if (!fs.existsSync(src)) continue;
    await fsp.mkdir(path.join(metaDir, id), { recursive: true });
    await fsp.copyFile(src, path.join(metaDir, id, 'instance.json'));
  }
  // хранится не больше недели ежедневных копий
  const all = (await fsp.readdir(backupsDir())).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 7))) await fsp.rm(path.join(backupsDir(), old), { recursive: true, force: true });
  return { dir };
}

async function backupDaily() {
  const stamp = new Date().toISOString().slice(0, 10);
  if (fs.existsSync(path.join(backupsDir(), stamp))) return;
  await backupNow();
}

async function openBackups() {
  await fsp.mkdir(backupsDir(), { recursive: true });
  return shell.openPath(backupsDir());
}

// ---------- Отладочная информация ----------
async function exportDebug(win) {
  const r = await dialog.showSaveDialog(win, { title: 'Сохранить отладочную информацию', defaultPath: `onyx-debug-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
  if (r.canceled || !r.filePath) return null;
  const zip = new AdmZip();
  const settings = { ...store.getSettings() };
  for (const k of ['curseforgeKey', 'msClientId']) if (settings[k]) settings[k] = '***скрыто***';
  const accounts = store.loadAccounts().list.map((a) => ({ type: a.type, name: a.name }));
  const info = [
    `Оникс ${app.getVersion()}`,
    `Electron ${process.versions.electron}, Node ${process.versions.node}, Chromium ${process.versions.chrome}`,
    `${os.type()} ${os.release()} (${process.arch}), ОЗУ ${(os.totalmem() / 1024 ** 3).toFixed(1)} ГБ, процессоров ${os.cpus().length}`,
    `Папка данных: ${paths.root}`,
    `Дата: ${new Date().toISOString()}`,
  ].join('\n');
  zip.addFile('info.txt', Buffer.from(info));
  zip.addFile('settings.json', Buffer.from(JSON.stringify(settings, null, 2)));
  zip.addFile('accounts.json', Buffer.from(JSON.stringify(accounts, null, 2)));
  const list = instances.list();
  zip.addFile('instances.json', Buffer.from(JSON.stringify(list.map((i) => ({ id: i.id, name: i.name, version: i.version, loader: i.loader, loaderVersion: i.loaderVersion, memoryMax: i.memoryMax, mods: Object.keys(i.content || {}).length })), null, 2)));
  const addLog = (id, rel, file) => {
    try {
      const buf = fs.readFileSync(file);
      zip.addFile(`logs/${id}/${rel}`, buf.subarray(Math.max(0, buf.length - 500 * 1024)));
    } catch {
      /* файла нет */
    }
  };
  for (const inst of list.slice(0, 10)) {
    const root = instances.dirOf(inst.id);
    addLog(inst.id, 'latest.log', path.join(root, 'logs', 'latest.log'));
    const crashDir = path.join(root, 'crash-reports');
    if (fs.existsSync(crashDir)) {
      const crashes = fs.readdirSync(crashDir).filter((n) => /\.txt$/.test(n)).sort().slice(-3);
      for (const c of crashes) addLog(inst.id, `crash-reports/${c}`, path.join(crashDir, c));
    }
  }
  zip.writeZip(r.filePath);
  shell.showItemInFolder(r.filePath);
  return { path: r.filePath };
}

module.exports = { storageInfo, cleanExtra, clearCache, pruneCache, backupNow, backupDaily, openBackups, exportDebug };
