// Загрузка текстур скинов и плащей через основной процесс с кешем на диске.
// Mojang отдаёт ссылки http://textures.minecraft.net, которые окно приложения (CSP только https) не открывает,
// поэтому текстуры скачиваются здесь и передаются в интерфейс как data-URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const dir = () => {
  const d = path.join(store.paths.cache, 'textures');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const memo = new Map(); // url -> {at, data}

function normalize(url) {
  return String(url).replace(/^http:\/\/(textures\.minecraft\.net|skinsystem\.ely\.by)/i, 'https://$1');
}

// Возвращает data-URL PNG или null, если скачать не удалось и в кеше ничего нет.
async function toDataUrl(url, { fresh = false } = {}) {
  if (!url) return null;
  if (String(url).startsWith('data:')) return url;
  const norm = normalize(url);
  const keyUrl = norm.split('?')[0];
  const file = path.join(dir(), crypto.createHash('sha1').update(keyUrl).digest('hex') + '.png');
  const hit = memo.get(norm);
  if (hit && !fresh && Date.now() - hit.at < 60000) return hit.data;
  const fromDisk = () => {
    try {
      return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    } catch {
      return null;
    }
  };
  // Текстуры Mojang неизменяемы (адрес содержит хеш): если файл в кеше, сеть не нужна.
  if (!fresh && /textures\.minecraft\.net/i.test(norm)) {
    const cached = fromDisk();
    if (cached) return cached;
  }
  try {
    const res = await fetch(norm, { headers: { 'User-Agent': 'OnyxLauncher' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG');
    fs.writeFileSync(file, buf);
    const data = 'data:image/png;base64,' + buf.toString('base64');
    memo.set(norm, { at: Date.now(), data });
    return data;
  } catch {
    return fromDisk(); // нет сети: показываем сохранённую копию
  }
}

// Заменяет skinUrl у аккаунтов в ответе IPC.
async function withAccountTextures(result) {
  if (!result || !Array.isArray(result.list)) return result;
  const list = await Promise.all(result.list.map(async (a) => ({ ...a, skinUrl: a.skinUrl ? await toDataUrl(a.skinUrl) : null })));
  return { ...result, list };
}

module.exports = { toDataUrl, withAccountTextures };
