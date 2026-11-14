// Скриншоты, журналы игры и отчёт для сообщений об ошибках.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const crypto = require('crypto');
const { nativeImage, clipboard, shell, app } = require('electron');
const { paths } = require('./store');
const instances = require('./instances');

const inDir = (root, name) => {
  const full = path.join(root, path.basename(name));
  if (path.dirname(full) !== root) throw new Error('Некорректное имя файла');
  return full;
};

// ---------- Скриншоты ----------
async function screenshots(id) {
  const dir = path.join(instances.dirOf(id), 'screenshots');
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const file of names) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const st = await fsp.stat(path.join(dir, file));
    out.push({ file, size: st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

async function thumb(id, file) {
  const full = inDir(path.join(instances.dirOf(id), 'screenshots'), file);
  const st = await fsp.stat(full);
  const cache = path.join(paths.icons, crypto.createHash('sha1').update(`${full}|${st.mtimeMs}|t`).digest('hex') + '.jpg');
  try {
    return 'data:image/jpeg;base64,' + (await fsp.readFile(cache)).toString('base64');
  } catch {
    const img = nativeImage.createFromPath(full);
    if (img.isEmpty()) return null;
    const jpg = img.resize({ width: 360, quality: 'good' }).toJPEG(78);
    fsp.writeFile(cache, jpg).catch(() => {});
    return 'data:image/jpeg;base64,' + jpg.toString('base64');
  }
}

async function fullShot(id, file) {
  const full = inDir(path.join(instances.dirOf(id), 'screenshots'), file);
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,` + (await fsp.readFile(full)).toString('base64');
}

function copyShot(id, file) {
  const img = nativeImage.createFromPath(inDir(path.join(instances.dirOf(id), 'screenshots'), file));
  if (img.isEmpty()) throw new Error('Не удалось прочитать скриншот');
  clipboard.writeImage(img);
  return true;
}

async function deleteShot(id, file) {
  await shell.trashItem(inDir(path.join(instances.dirOf(id), 'screenshots'), file));
  return screenshots(id);
}

function revealShot(id, file) {
  shell.showItemInFolder(inDir(path.join(instances.dirOf(id), 'screenshots'), file));
  return true;
}

// ---------- Журналы ----------
async function listLogs(id) {
  const root = instances.dirOf(id);
  const out = [];
  const add = async (sub, filter, kind) => {
    let names = [];
    try {
      names = await fsp.readdir(path.join(root, sub));
    } catch {
      return;
    }
    for (const n of names.filter(filter)) {
      const st = await fsp.stat(path.join(root, sub, n));
      out.push({ path: sub ? `${sub}/${n}` : n, name: n, kind, size: st.size, mtime: st.mtimeMs });
    }
  };
  await add('logs', (n) => /\.(log|log\.gz)$/i.test(n), 'log');
  await add('crash-reports', (n) => /\.txt$/i.test(n), 'crash');
  await add('', (n) => /^hs_err_pid.*\.log$/i.test(n), 'crash');
  return out.sort((a, b) => (a.name === 'latest.log' ? -1 : b.name === 'latest.log' ? 1 : b.mtime - a.mtime)).slice(0, 40);
}

async function readLog(id, rel) {
  const root = instances.dirOf(id);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep) || !/^(logs|crash-reports)[\\/]|^hs_err_pid/.test(path.relative(root, full))) throw new Error('Недопустимый путь');
  let buf = await fsp.readFile(full);
  if (/\.gz$/i.test(full)) buf = zlib.gunzipSync(buf);
  const LIMIT = 2 * 1024 * 1024;
  const cut = buf.length > LIMIT;
  const text = buf.subarray(Math.max(0, buf.length - LIMIT)).toString('utf8');
  return { text: cut ? '… файл обрезан, показан конец …\n' + text : text, truncated: cut };
}

async function report(id) {
  const inst = instances.get(id);
  const settings = require('./store').getSettings();
  const content = await instances.listContent(id);
  const logs = await listLogs(id);
  const crash = logs.find((l) => l.kind === 'crash');
  const latest = logs.find((l) => l.name === 'latest.log');
  let tail = '';
  try {
    const src = crash || latest;
    if (src) tail = (await readLog(id, src.path)).text.split(/\r?\n/).slice(-200).join('\n');
  } catch {
    /* журналов нет */
  }
  const mods = content.filter((c) => c.type === 'mod' && c.enabled).map((c) => `- ${c.title}${c.versionNumber ? ' ' + c.versionNumber : ''}`);
  return [
    `Оникс ${app.getVersion()} · ${os.type()} ${os.release()} (${process.arch})`,
    `Сборка: ${inst.name}`,
    `Minecraft ${inst.version}, загрузчик ${inst.loader}${inst.loaderVersion ? ' ' + inst.loaderVersion : ''}`,
    `Память: до ${inst.memoryMax || settings.memoryMax} МБ`,
    `Модов включено: ${mods.length}`,
    ...mods.slice(0, 150),
    '',
    `=== ${crash ? crash.name : latest ? 'latest.log (последние 200 строк)' : 'журналов нет'} ===`,
    tail,
  ].join('\n');
}

module.exports = { screenshots, thumb, fullShot, copyShot, deleteShot, revealShot, listLogs, readLog, report };
