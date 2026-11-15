// Профили Java: встроенные среды Mojang (скачиваются по требованию) и свои установки пользователя.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { dialog } = require('electron');
const store = require('./store');

const { paths } = store;

// Компоненты Mojang и версия Java, которую они содержат.
const COMPONENTS = [
  { id: 'jre-legacy', major: 8, label: 'Java 8', hint: 'Minecraft до 1.16' },
  { id: 'java-runtime-alpha', major: 16, label: 'Java 16', hint: 'Minecraft 1.17' },
  { id: 'java-runtime-beta', major: 17, label: 'Java 17 (beta)', hint: 'Minecraft 1.18 – 1.20.4' },
  { id: 'java-runtime-gamma', major: 17, label: 'Java 17 (gamma)', hint: 'Minecraft 1.18 – 1.21' },
  { id: 'java-runtime-delta', major: 21, label: 'Java 21', hint: 'Minecraft 1.20.5 и новее' },
];

// Какая Java нужна версии игры (для подсказки; при запуске берётся значение из описания версии Mojang).
function requiredMajor(version) {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(String(version || ''));
  if (!m) return 21; // снапшоты и новые версии
  const minor = Number(m[1]);
  const patch = Number(m[2] || 0);
  if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

function binaryIn(dir) {
  if (process.platform === 'win32') return path.join(dir, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(dir, 'bin', 'java');
}

function installed(component) {
  const dir = path.join(paths.runtimes, component);
  return fs.existsSync(path.join(dir, '.onyx-complete')) && fs.existsSync(binaryIn(dir));
}

function customProfiles() {
  const list = store.getSettings().javaProfiles;
  return Array.isArray(list) ? list : [];
}

function list() {
  return {
    mojang: COMPONENTS.map((c) => ({ ...c, installed: installed(c.id) })),
    custom: customProfiles(),
  };
}

// Ссылка на профиль: «mojang:<компонент>» или «custom:<id>». Возвращает путь к Java или null (авто).
function resolve(ref) {
  if (!ref || ref === 'auto') return null;
  const [kind, id] = String(ref).split(':');
  if (kind === 'mojang') {
    const comp = COMPONENTS.find((c) => c.id === id);
    return comp ? { component: comp.id } : null;
  }
  if (kind === 'custom') {
    const prof = customProfiles().find((p) => p.id === id);
    return prof && fs.existsSync(prof.path) ? { path: prof.path } : null;
  }
  return null;
}

function probe(file) {
  return new Promise((resolve_) => {
    execFile(file, ['-version'], { timeout: 6000, windowsHide: true }, (err, stdout, stderr) => {
      const text = `${stderr || ''}${stdout || ''}`;
      const m = /version "(\d+)(?:\.(\d+))?[^"]*"/.exec(text);
      if (!m) return resolve_(null);
      const major = m[1] === '1' ? Number(m[2]) : Number(m[1]);
      const vendor = /(Temurin|Zulu|OpenJDK|Oracle|GraalVM|Corretto|Microsoft|Liberica)/i.exec(text);
      resolve_({ major, vendor: vendor ? vendor[1] : 'Java' });
    });
  });
}

const javaExe = () => (process.platform === 'win32' ? 'java.exe' : 'java');

// Ищет установленные в системе Java: JAVA_HOME, PATH и типичные папки.
async function detect() {
  const candidates = new Set();
  if (process.env.JAVA_HOME) candidates.add(path.join(process.env.JAVA_HOME, 'bin', javaExe()));
  for (const dir of (process.env.PATH || '').split(path.delimiter)) if (dir) candidates.add(path.join(dir, javaExe()));
  const roots = process.platform === 'win32'
    ? ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft', 'C:\\Program Files\\Zulu', 'C:\\Program Files\\Amazon Corretto', 'C:\\Program Files (x86)\\Java']
    : process.platform === 'darwin'
      ? ['/Library/Java/JavaVirtualMachines']
      : ['/usr/lib/jvm', path.join(os.homedir(), '.sdkman/candidates/java')];
  for (const root of roots) {
    let names = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const n of names) {
      candidates.add(path.join(root, n, 'bin', javaExe()));
      candidates.add(path.join(root, n, 'Contents', 'Home', 'bin', javaExe()));
    }
  }
  const out = [];
  const seen = new Set();
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    let real = file;
    try {
      real = fs.realpathSync(file);
    } catch {
      /* ссылка недоступна */
    }
    if (seen.has(real)) continue;
    seen.add(real);
    const info = await probe(file);
    if (info) out.push({ path: file, major: info.major, vendor: info.vendor });
  }
  return out;
}

function addCustom({ name, path: file }) {
  if (!file || !fs.existsSync(file)) throw new Error('Файл Java не найден');
  const profiles = customProfiles();
  const id = Math.random().toString(36).slice(2, 8);
  profiles.push({ id, name: String(name || path.basename(path.dirname(path.dirname(file)))).slice(0, 60), path: file });
  store.setSettings({ javaProfiles: profiles });
  return profiles;
}

function removeCustom(id) {
  const profiles = customProfiles().filter((p) => p.id !== id);
  store.setSettings({ javaProfiles: profiles });
  return profiles;
}

async function pick(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Выберите java / javaw',
    properties: ['openFile'],
    filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const info = await probe(r.filePaths[0]);
  if (!info) throw new Error('Этот файл не похож на Java: он не вернул версию.');
  return { path: r.filePaths[0], major: info.major, vendor: info.vendor };
}

module.exports = { COMPONENTS, requiredMajor, list, resolve, detect, addCustom, removeCustom, pick, installed };
