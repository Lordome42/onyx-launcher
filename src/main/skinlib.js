// Библиотека скинов: PNG-файлы в папке данных, чтобы переключаться между скинами одним нажатием.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const dir = () => {
  const d = path.join(store.paths.root, 'skins');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const indexFile = () => path.join(dir(), 'library.json');
const load = () => {
  const data = store.readJson(indexFile(), { items: [] });
  return Array.isArray(data.items) ? data.items : [];
};
const save = (items) => store.writeJson(indexFile(), { items });

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Это не PNG-файл');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function list() {
  return load().map((it) => {
    const file = path.join(dir(), it.file);
    let dataUrl = null;
    try {
      dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    } catch {
      /* файл удалён вручную */
    }
    return { id: it.id, name: it.name, variant: it.variant, addedAt: it.addedAt, dataUrl };
  }).filter((it) => it.dataUrl);
}

function addBuffer(buf, name, variant) {
  const { w, h } = pngSize(buf);
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(`Размер скина должен быть 64×64 (у файла ${w}×${h})`);
  const id = crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(path.join(dir(), `${id}.png`), buf);
  const items = load();
  items.unshift({ id, name: String(name || 'Скин').slice(0, 40), variant: variant === 'slim' ? 'slim' : 'classic', file: `${id}.png`, addedAt: Date.now() });
  save(items);
  return list();
}

function addFile(file, name, variant) {
  return addBuffer(fs.readFileSync(file), name || path.basename(file, path.extname(file)), variant);
}

async function addUrl(url, name, variant) {
  // принимает и data-URL, который интерфейс получил от основного процесса
  if (String(url).startsWith('data:')) return addBuffer(Buffer.from(url.split(',')[1], 'base64'), name, variant);
  const data = await require('./textures').toDataUrl(url);
  if (!data) throw new Error('Не удалось скачать скин: проверьте интернет.');
  return addBuffer(Buffer.from(data.split(',')[1], 'base64'), name, variant);
}

function remove(id) {
  const items = load();
  const it = items.find((x) => x.id === id);
  if (it) fs.rmSync(path.join(dir(), it.file), { force: true });
  save(items.filter((x) => x.id !== id));
  return list();
}

function rename(id, name) {
  save(load().map((x) => (x.id === id ? { ...x, name: String(name || x.name).slice(0, 40) } : x)));
  return list();
}

function update(id, patch) {
  save(load().map((x) => (x.id === id ? { ...x, variant: patch.variant === 'slim' ? 'slim' : 'classic' } : x)));
  return list();
}

function filePath(id) {
  const it = load().find((x) => x.id === id);
  if (!it) throw new Error('Скин не найден в библиотеке');
  return { file: path.join(dir(), it.file), variant: it.variant };
}

module.exports = { list, addFile, addUrl, remove, rename, update, filePath };
