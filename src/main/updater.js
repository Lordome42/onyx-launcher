// Автообновление самого лаунчера через electron-updater и GitHub Releases.
// Адрес репозитория берётся из настроек («владелец/репозиторий») или из поля onyxUpdateRepo в package.json.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const store = require('./store');
const TEST = !!process.env.ONYX_UPDATER_TEST;

let autoUpdater = null;
let emit = () => {};
let state = { status: 'idle', version: '', percent: 0, error: '', notes: '' };

function set(patch) {
  state = { ...state, ...patch };
  emit(state);
}

// Ссылки Dropbox вида ...?dl=0 превращаем в прямое скачивание.
function dropbox(u) {
  if (!/dropbox\.com/i.test(u)) return u;
  return /[?&]dl=\d/.test(u) ? u.replace(/([?&])dl=\d/, '$1dl=1') : u + (u.includes('?') ? '&' : '?') + 'dl=1';
}

const cmp = (a, b) => {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
};

// Простой запрос с переходами по редиректам (Dropbox отвечает редиректом).
function request(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error('Слишком много переадресаций'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Onyx-Launcher' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(request(new URL(res.headers.location, url).toString(), hops + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Сервер ответил ${res.statusCode}`));
      }
      resolve(res);
    }).on('error', reject);
  });
}

async function fetchManifest(url) {
  const res = await request(url);
  const chunks = [];
  let size = 0;
  for await (const c of res) {
    size += c.length;
    if (size > 200000) throw new Error('Файл обновлений слишком большой');
    chunks.push(c);
  }
  let m;
  try {
    m = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Файл обновлений повреждён: это не JSON. Для Dropbox нужна ссылка именно на onyx-update.json.');
  }
  if (!m.version || !m.url) throw new Error('В файле обновлений нет версии или ссылки на установщик.');
  return m;
}

let manifest = null;
let installerFile = '';

async function downloadManifestUpdate() {
  set({ status: 'downloading', percent: 0 });
  const res = await request(dropbox(manifest.url));
  const total = Number(res.headers['content-length']) || manifest.size || 0;
  installerFile = path.join(os.tmpdir(), `Onyx-Setup-${manifest.version}.exe`);
  const hash = crypto.createHash('sha512');
  const out = fs.createWriteStream(installerFile);
  let got = 0;
  let last = 0;
  await new Promise((resolve, reject) => {
    res.on('data', (c) => {
      hash.update(c);
      got += c.length;
      const pct = total ? Math.round((got / total) * 100) : 0;
      if (pct !== last) { last = pct; set({ status: 'downloading', percent: pct }); }
    });
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.pipe(out);
  });
  if (manifest.sha512) {
    const want = String(manifest.sha512);
    const b64 = hash.copy().digest('base64');
    const hex = hash.digest('hex');
    if (want !== b64 && want.toLowerCase() !== hex) {
      fs.rmSync(installerFile, { force: true });
      throw new Error('Скачанный файл не совпал с контрольной суммой. Обновление отменено.');
    }
  }
  set({ status: 'ready', percent: 100 });
}

// Источник обновлений: адрес статического хостинга (https://…) или «владелец/репозиторий» GitHub.
function sourceSetting() {
  const fromSettings = String(store.getSettings().updateRepo || '').trim();
  let fromPkg = '';
  try {
    const pkg = require('../../package.json');
    fromPkg = String(pkg.onyxUpdateSource || pkg.onyxUpdateRepo || '').trim();
  } catch {
    /* поля нет */
  }
  const src = fromSettings || fromPkg;
  if (/^https?:\/\/[^\s?#]+\.json(\?[^\s]*)?$/i.test(src) || /^https?:\/\/[^\s]*dropbox\.com[^\s]*$/i.test(src)) return { kind: 'manifest', url: dropbox(src) };
  if (/^https?:\/\/[^\s]+$/i.test(src)) return { kind: 'generic', url: src.endsWith('/') ? src : src + '/' };
  if (/^[\w.-]+\/[\w.-]+$/.test(src)) return { kind: 'github', owner: src.split('/')[0], repo: src.split('/')[1] };
  return null;
}

const friendly = (err) => {
  const m = String((err && err.message) || err);
  if (/404|Cannot find latest|No published versions/i.test(m)) return 'По этому адресу не найден файл обновлений. Проверьте ссылку и что файл выгружен.';
  if (/ENOTFOUND|ECONN|ETIMEDOUT|net::|network/i.test(m)) return 'Нет связи с сервером обновлений. Проверьте подключение к интернету.';
  if (/rate limit|403/i.test(m)) return 'Сервер временно ограничил запросы. Повторите позже.';
  return m.split('\n')[0].slice(0, 200);
};

function init(send) {
  emit = (s) => send('update:state', s);
  if (!app.isPackaged && !TEST) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
  autoUpdater.on('update-available', (i) => set({ status: 'available', version: i.version, percent: 0, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 600) : '' }));
  autoUpdater.on('update-not-available', () => set({ status: 'none' }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (i) => set({ status: 'ready', version: i.version, percent: 100 }));
  autoUpdater.on('error', (e) => set({ status: 'error', error: friendly(e) }));
}

async function check() {
  if (!app.isPackaged && !TEST) {
    set({ status: 'dev', error: 'Обновления работают только в установленной версии.' });
    return state;
  }
  const src = sourceSetting();
  if (!src) {
    set({ status: 'disabled', error: 'Не указан источник обновлений.' });
    return state;
  }
  if (src.kind === 'manifest') {
    set({ status: 'checking', error: '' });
    try {
      const m = await fetchManifest(src.url);
      if (cmp(m.version, app.getVersion()) > 0) {
        manifest = m;
        set({ status: 'available', version: m.version, percent: 0, notes: String(m.notes || '').slice(0, 600) });
      } else {
        set({ status: 'none' });
      }
    } catch (e) {
      set({ status: 'error', error: friendly(e) });
    }
    return state;
  }
  if (!autoUpdater) return state;
  autoUpdater.setFeedURL(src.kind === 'generic' ? { provider: 'generic', url: src.url } : { provider: 'github', owner: src.owner, repo: src.repo });
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    set({ status: 'error', error: friendly(e) });
  }
  return state;
}

async function download() {
  if (manifest && state.status === 'available') {
    try {
      await downloadManifestUpdate();
    } catch (e) {
      set({ status: 'error', error: friendly(e) });
    }
    return state;
  }
  if (!autoUpdater || state.status !== 'available') return state;
  set({ status: 'downloading', percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    set({ status: 'error', error: friendly(e) });
  }
  return state;
}

function install() {
  if (manifest && state.status === 'ready' && installerFile) {
    if (TEST) return true;
    // Тихая установка поверх текущей и запуск новой версии.
    spawn(installerFile, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return true;
  }
  if (autoUpdater && state.status === 'ready') autoUpdater.quitAndInstall(false, true);
  return true;
}

// Тихая проверка при запуске: ничего не показываем, пока не найдена новая версия.
function checkOnStart() {
  if ((!app.isPackaged && !TEST) || store.getSettings().autoUpdate === false || !sourceSetting()) return;
  setTimeout(() => check().catch(() => {}), 6000);
}

module.exports = { _test: { cmp, dropbox, sourceSetting }, init, check, download, install, checkOnStart, getState: () => state };
