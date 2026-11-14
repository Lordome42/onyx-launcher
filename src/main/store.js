// Хранение настроек, аккаунтов и путей лаунчера.
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_ROOT = path.join(app.getPath('appData'), '.onyx-launcher');
// Маленький файл-указатель всегда лежит в стандартном месте и говорит, где находятся данные.
const POINTER = path.join(app.getPath('appData'), 'onyx-launcher-location.json');

function resolveRoot() {
  if (process.env.ONYX_DATA_DIR) return path.resolve(process.env.ONYX_DATA_DIR);
  try {
    const dir = JSON.parse(fs.readFileSync(POINTER, 'utf8')).dataDir;
    if (dir && path.isAbsolute(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {
    /* указателя нет или папка недоступна: берём стандартную */
  }
  return DEFAULT_ROOT;
}
const ROOT = resolveRoot();

function setDataRoot(dir) {
  fs.writeFileSync(POINTER, JSON.stringify({ dataDir: dir }));
}

const paths = {
  root: ROOT,
  instances: path.join(ROOT, 'instances'),
  versions: path.join(ROOT, 'versions'),
  libraries: path.join(ROOT, 'libraries'),
  assets: path.join(ROOT, 'assets'),
  runtimes: path.join(ROOT, 'runtimes'),
  cache: path.join(ROOT, 'cache'),
  icons: path.join(ROOT, 'cache', 'icons'),
  installers: path.join(ROOT, 'cache', 'installers'),
  settingsFile: path.join(ROOT, 'settings.json'),
  accountsFile: path.join(ROOT, 'accounts.json'),
};

for (const key of ['root', 'instances', 'versions', 'libraries', 'assets', 'runtimes', 'cache', 'icons', 'installers']) {
  fs.mkdirSync(paths[key], { recursive: true });
}

const DEFAULT_SETTINGS = {
  theme: 'samurai',
  memoryMin: 1024,
  memoryMax: 4096,
  javaPath: '',
  jvmArgs: '',
  gameWidth: 1280,
  gameHeight: 720,
  fullscreen: false,
  closeOnLaunch: false,
  showSnapshots: false,
  msClientId: '',
  curseforgeKey: '',
  lowPower: false,
  autoUpdate: true,
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// ---------- Настройки ----------
function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(paths.settingsFile, {}) };
}

function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJson(paths.settingsFile, next);
  return next;
}

// ---------- Аккаунты ----------
// Токены шифруются системным хранилищем (DPAPI / Keychain / libsecret), если оно доступно.
function seal(value) {
  if (!value) return value;
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64');
  }
  return value;
}

function unseal(value) {
  if (!value || !value.startsWith('enc:')) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  } catch {
    return '';
  }
}

function loadAccounts() {
  const data = readJson(paths.accountsFile, { selected: null, list: [] });
  data.list = data.list.map((a) => ({
    ...a,
    accessToken: unseal(a.accessToken),
    refreshToken: unseal(a.refreshToken),
  }));
  return data;
}

function saveAccounts(data) {
  writeJson(paths.accountsFile, {
    selected: data.selected,
    list: data.list.map((a) => ({
      ...a,
      accessToken: seal(a.accessToken),
      refreshToken: seal(a.refreshToken),
    })),
  });
}

// Публичное представление аккаунта (без токенов) для интерфейса.
function publicAccount(a) {
  return { id: a.id, type: a.type, name: a.name, uuid: a.uuid, skinUrl: a.skinUrl || null };
}

module.exports = { defaultRoot: DEFAULT_ROOT, setDataRoot, paths, readJson, writeJson, getSettings, setSettings, loadAccounts, saveAccounts, publicAccount };
