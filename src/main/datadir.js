// Выбор и перенос папки данных лаунчера (версии, библиотеки, Java, сборки).
const { app, dialog } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const store = require('./store');
const minecraft = require('./minecraft');

const gb = (n) => (n / 1024 ** 3).toFixed(1).replace('.0', '');

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

async function freeSpace(dir) {
  let probe = dir;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  try {
    const s = await fsp.statfs(probe);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

async function info() {
  const root = store.paths.root;
  return { dir: root, isDefault: root === store.defaultRoot, defaultDir: store.defaultRoot, size: await dirSize(root), free: await freeSpace(root) };
}

async function choose(win) {
  const r = await dialog.showOpenDialog(win, { title: 'Папка для данных Оникса', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
}

// Переносит все данные в новую папку и перезапускает лаунчер.
async function move(target, onProgress = () => {}) {
  if (minecraft.runningIds().length) throw new Error('Закройте игру перед переносом данных.');
  const from = store.paths.root;
  let to = path.resolve(String(target || ''));
  if (!target) throw new Error('Не выбрана папка');
  // Если выбрана не пустая чужая папка, кладём данные в подпапку.
  if (fs.existsSync(to) && fs.readdirSync(to).length && !fs.existsSync(path.join(to, 'settings.json'))) to = path.join(to, 'Onyx');
  if (to === from) throw new Error('Данные уже лежат в этой папке.');
  const rel = path.relative(from, to);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('Нельзя выбрать папку внутри текущей папки данных.');
  const rel2 = path.relative(to, from);
  if (rel2 && !rel2.startsWith('..') && !path.isAbsolute(rel2)) throw new Error('Нельзя выбрать папку, внутри которой лежат текущие данные.');

  await fsp.mkdir(to, { recursive: true });
  const need = await dirSize(from);
  const free = await freeSpace(to);
  if (free !== null && free < need * 1.05 + 50 * 1024 * 1024) {
    throw new Error(`В новой папке мало места: нужно около ${gb(need)} ГБ, свободно ${gb(free)} ГБ.`);
  }
  const names = await fsp.readdir(from);
  let done = 0;
  for (const name of names) {
    onProgress('Копирование данных', done, names.length);
    await fsp.cp(path.join(from, name), path.join(to, name), { recursive: true, force: true, errorOnExist: false });
    done++;
  }
  onProgress('Копирование данных', names.length, names.length);
  store.setDataRoot(to);
  // Старую папку чистим уже после того, как указатель на новую записан.
  for (const name of names) await fsp.rm(path.join(from, name), { recursive: true, force: true }).catch(() => {});
  await fsp.rmdir(from).catch(() => {});
  app.relaunch();
  setTimeout(() => app.exit(0), 600);
  return { dir: to };
}

// Возврат к папке по умолчанию без переноса (для случая, когда данных ещё нет).
module.exports = { info, choose, move };
