// Сетевые помощники: JSON-запросы, загрузка файлов с проверкой sha1, пул параллельных задач.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const USER_AGENT = 'OnyxLauncher/0.2.0';

async function fetchWithRetry(url, opts = {}, retries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
      });
      if (res.status >= 500 || res.status === 429) {
        throw Object.assign(new Error(`HTTP ${res.status} для ${url}`), { status: res.status });
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  if (lastErr && !lastErr.status) {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* ignore */
    }
    throw new Error(`Нет связи с ${host}. Проверьте подключение к интернету.`);
  }
  throw lastErr;
}

async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} для ${url}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function sha1Buffer(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    fs.createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

// Проверяет, что файл уже скачан. Быстрый режим сверяет размер, полный — ещё и sha1.
async function isFileValid(file, { sha1, size } = {}, full = false) {
  try {
    const st = await fsp.stat(file);
    if (size != null && st.size !== size) return false;
    if (full && sha1) return (await sha1File(file)) === sha1;
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, dest, { sha1, size } = {}) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithRetry(url);
    if (!res.ok) throw new Error(`Не удалось скачать ${url} (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha1 && sha1Buffer(buf) !== sha1) {
      if (attempt === 2) throw new Error(`Контрольная сумма не совпала: ${url}`);
      continue;
    }
    const tmp = dest + '.part';
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, dest);
    return buf.length;
  }
}

// Выполняет задачи с ограничением параллелизма и сообщает прогресс.
async function runPool(tasks, concurrency, onProgress) {
  let done = 0;
  let index = 0;
  const total = tasks.length;
  if (onProgress) onProgress(0, total);
  async function worker() {
    while (index < tasks.length) {
      const task = tasks[index++];
      await task();
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
}

module.exports = { USER_AGENT, fetchWithRetry, fetchJson, downloadFile, isFileValid, sha1File, runPool };
