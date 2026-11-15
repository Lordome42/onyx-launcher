// Автообновление самого лаунчера через electron-updater и GitHub Releases.
// Единственный источник — релизы GitHub; репозиторий указан в package.json (поле onyxUpdateRepo).
const { app } = require('electron');
const store = require('./store');
const TEST = !!process.env.ONYX_UPDATER_TEST;

const DEFAULT_REPO = 'Lordome42/onyx-launcher';

let autoUpdater = null;
let emit = () => {};
let state = { status: 'idle', version: '', percent: 0, error: '', notes: '' };

function set(patch) {
  state = { ...state, ...patch };
  emit(state);
}

// Обновления берутся из релизов GitHub. Репозиторий по умолчанию задан в package.json (onyxUpdateRepo).
function repoSetting() {
  let fromPkg = '';
  try {
    fromPkg = String(require('../../package.json').onyxUpdateRepo || '').trim();
  } catch {
    /* поля нет */
  }
  const repo = fromPkg || DEFAULT_REPO;
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? { owner: repo.split('/')[0], repo: repo.split('/')[1] } : null;
}

const friendly = (err) => {
  const m = String((err && err.message) || err);
  if (/404|Cannot find latest|No published versions/i.test(m)) return 'В репозитории пока нет опубликованных версий.';
  if (/ENOTFOUND|ECONN|ETIMEDOUT|net::|network/i.test(m)) return 'Нет связи с GitHub. Проверьте подключение к интернету.';
  if (/rate limit|403/i.test(m)) return 'GitHub временно ограничил запросы. Повторите позже.';
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
  const src = repoSetting();
  if (!src) {
    set({ status: 'disabled', error: 'Не указан репозиторий обновлений.' });
    return state;
  }
  if (!autoUpdater) return state;
  autoUpdater.setFeedURL({ provider: 'github', owner: src.owner, repo: src.repo });
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    set({ status: 'error', error: friendly(e) });
  }
  return state;
}

async function download(restart = false) {
  if (!autoUpdater || state.status !== 'available') return state;
  set({ status: 'downloading', percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
    if (restart) setTimeout(() => install(), 1200);
  } catch (e) {
    set({ status: 'error', error: friendly(e) });
  }
  return state;
}

function install() {
  if (autoUpdater && state.status === 'ready') autoUpdater.quitAndInstall(true, true);
  return true;
}

// Тихая проверка при запуске: ничего не показываем, пока не найдена новая версия.
function checkOnStart() {
  if ((!app.isPackaged && !TEST) || store.getSettings().autoUpdate === false || !repoSetting()) return;
  setTimeout(() => check().catch(() => {}), 6000);
}

module.exports = { init, check, download, install, checkOnStart, getState: () => state };
