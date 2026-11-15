// Установка и запуск Minecraft по официальным манифестам Mojang (+ Fabric и Quilt).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { paths, readJson } = require('./store');
const { fetchJson, fetchWithRetry, downloadFile, isFileValid, runPool } = require('./net');
const crypto = require('crypto');

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const JAVA_RUNTIMES = 'https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const RESOURCES = 'https://resources.download.minecraft.net';
const LIBRARIES = 'https://libraries.minecraft.net/';

const LOADER_META = {
  fabric: {
    versions: (mc) => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`,
    profile: (mc, l) => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(l)}/profile/json`,
    games: 'https://meta.fabricmc.net/v2/versions/game',
  },
  quilt: {
    versions: (mc) => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`,
    profile: (mc, l) => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(l)}/profile/json`,
    games: 'https://meta.quiltmc.org/v3/versions/game',
  },
};

const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_META = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const NEOFORGE_VERSIONS = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const INSTALLER_LOADERS = ['forge', 'neoforge'];

const OS_NAME = { win32: 'windows', darwin: 'osx', linux: 'linux' }[process.platform] || 'linux';
const CONCURRENCY = 16;

// ---------- Манифест версий ----------
let manifestCache = null;
async function getManifest() {
  if (manifestCache && Date.now() - manifestCache.at < 10 * 60 * 1000) return manifestCache.data;
  const cacheFile = path.join(paths.cache, 'version_manifest_v2.json');
  try {
    const data = await fetchJson(VERSION_MANIFEST);
    await fsp.writeFile(cacheFile, JSON.stringify(data));
    manifestCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    const cached = readJson(cacheFile, null);
    if (cached) return cached;
    throw err;
  }
}

async function listVersions() {
  const m = await getManifest();
  return {
    latest: m.latest,
    versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })),
  };
}

const neoMc = (v) => {
  const [minor, patch] = v.split('.');
  return patch === '0' ? `1.${minor}` : `1.${minor}.${patch}`;
};
const textCache = {};
async function cachedText(url) {
  if (!textCache[url] || Date.now() - textCache[url].at > 10 * 60 * 1000) {
    const res = await fetchWithRetry(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
    textCache[url] = { at: Date.now(), text: await res.text() };
  }
  return textCache[url].text;
}

async function installerLoaderVersions(loader, mcVersion) {
  if (loader === 'forge') {
    const xml = await cachedText(FORGE_META);
    let promos = {};
    try {
      promos = (await fetchJson(FORGE_PROMOS)).promos || {};
    } catch {
      /* без рекомендаций */
    }
    const prefix = `${mcVersion}-`;
    const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]).filter((v) => v.startsWith(prefix)).map((v) => v.slice(prefix.length));
    const rec = promos[`${mcVersion}-recommended`];
    return all.reverse().map((v) => ({ version: v, stable: rec ? v === rec : true, recommended: v === rec })).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  }
  const data = await fetchJson(NEOFORGE_VERSIONS);
  return data.versions
    .filter((v) => neoMc(v) === mcVersion)
    .reverse()
    .map((v) => ({ version: v, stable: !/beta|alpha/i.test(v) }));
}

async function listLoaderVersions(loader, mcVersion) {
  if (INSTALLER_LOADERS.includes(loader)) return installerLoaderVersions(loader, mcVersion);
  const meta = LOADER_META[loader];
  if (!meta) return [];
  const list = await fetchJson(meta.versions(mcVersion));
  return list.map((e) => ({ version: e.loader.version, stable: e.loader.stable !== false && !/beta|alpha|pre|rc/i.test(e.loader.version) }));
}

async function loaderGameVersions(loader) {
  if (loader === 'forge') {
    const promos = (await fetchJson(FORGE_PROMOS)).promos || {};
    return [...new Set(Object.keys(promos).map((k) => k.replace(/-(latest|recommended)$/, '')))];
  }
  if (loader === 'neoforge') {
    const data = await fetchJson(NEOFORGE_VERSIONS);
    return [...new Set(data.versions.map(neoMc))];
  }
  const meta = LOADER_META[loader];
  if (!meta) return [];
  return (await fetchJson(meta.games)).map((g) => g.version);
}

// ---------- Описание версий ----------
function versionJsonPath(id) {
  return path.join(paths.versions, id, `${id}.json`);
}

async function ensureVanillaJson(id) {
  const file = versionJsonPath(id);
  if (fs.existsSync(file)) return readJson(file);
  const m = await getManifest();
  const entry = m.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Версия ${id} не найдена в манифесте Mojang`);
  await downloadFile(entry.url, file, { sha1: entry.sha1 });
  return readJson(file);
}

// Запускает официальный установщик Forge/NeoForge прямо в папку лаунчера (структура совпадает с .minecraft).
async function runInstaller(instance, loaderVersion, java, progress, log) {
  const mc = instance.version;
  const forge = instance.loader === 'forge';
  const id = forge ? `${mc}-forge-${loaderVersion}` : `neoforge-${loaderVersion}`;
  if (fs.existsSync(versionJsonPath(id))) return id;
  const url = forge
    ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${loaderVersion}/forge-${mc}-${loaderVersion}-installer.jar`
    : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  const jar = path.join(paths.installers, `${instance.loader}-${mc}-${loaderVersion}-installer.jar`);
  progress(`Загрузка установщика ${forge ? 'Forge' : 'NeoForge'}`);
  if (!fs.existsSync(jar)) await downloadFile(url, jar);
  const profiles = path.join(paths.root, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, version: 3 }));
  progress(`Установка ${forge ? 'Forge' : 'NeoForge'} (это может занять несколько минут)`);
  const cli = java.replace(/javaw\.exe$/i, 'java.exe');
  const tail = [];
  await new Promise((resolve, reject) => {
    const child = spawn(cli, ['-jar', jar, '--installClient', paths.root], { cwd: paths.root });
    const onData = (d) => {
      for (const line of String(d).split(/\r?\n/).filter(Boolean)) {
        tail.push(line);
        if (tail.length > 12) tail.shift();
        log(line);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Установщик завершился с ошибкой ${code}: ${tail.slice(-3).join(' | ')}`))));
  });
  if (!fs.existsSync(versionJsonPath(id))) throw new Error('Установщик отработал, но профиль версии не появился');
  return id;
}

// Возвращает id профиля, который нужно запускать (ванильный или профиль загрузчика).
async function ensureProfile(instance, ctx = {}) {
  await ensureVanillaJson(instance.version);
  if (!instance.loader || instance.loader === 'vanilla') return instance.version;
  let loaderVersion = instance.loaderVersion;
  if (!loaderVersion) {
    const list = await listLoaderVersions(instance.loader, instance.version);
    if (!list.length) throw new Error(`${instance.loader} не поддерживает Minecraft ${instance.version}`);
    loaderVersion = (list.find((l) => l.stable) || list[0]).version;
  }
  if (INSTALLER_LOADERS.includes(instance.loader)) {
    return runInstaller(instance, loaderVersion, ctx.java, ctx.progress, ctx.log);
  }
  const meta = LOADER_META[instance.loader];
  if (!meta) throw new Error(`Загрузчик ${instance.loader} пока не поддерживается`);
  const id = `${instance.version}-${instance.loader}-${loaderVersion}`;
  const file = versionJsonPath(id);
  if (!fs.existsSync(file)) {
    const profile = await fetchJson(meta.profile(instance.version, loaderVersion));
    profile.id = id;
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify(profile, null, 2));
  }
  return id;
}

function libKey(lib) {
  const parts = lib.name.split(':');
  // group:artifact[:classifier] — без версии, чтобы дубли с разными версиями схлопывались.
  return [parts[0], parts[1], parts[3] || ''].join(':');
}

// Объединяет профиль с родительским (inheritsFrom), как это делает официальный лаунчер.
function resolveVersion(id) {
  const v = readJson(versionJsonPath(id));
  if (!v) throw new Error(`Не найдено описание версии ${id}`);
  if (!v.inheritsFrom) return { ...v, jarId: v.jar || v.id };
  const parent = resolveVersion(v.inheritsFrom);
  const seen = new Set();
  const libraries = [];
  for (const lib of [...(v.libraries || []), ...(parent.libraries || [])]) {
    const key = libKey(lib) + (lib.natives ? ':natives' : '');
    if (seen.has(key)) continue;
    seen.add(key);
    libraries.push(lib);
  }
  const args = (a, b, k) => [...((a.arguments && a.arguments[k]) || []), ...((b.arguments && b.arguments[k]) || [])];
  return {
    ...parent,
    ...v,
    id: v.id,
    jarId: parent.jarId,
    libraries,
    downloads: parent.downloads,
    assetIndex: parent.assetIndex,
    assets: parent.assets,
    javaVersion: v.javaVersion || parent.javaVersion,
    mainClass: v.mainClass || parent.mainClass,
    minecraftArguments: v.minecraftArguments || parent.minecraftArguments,
    arguments: parent.arguments || v.arguments ? { game: args(parent, v, 'game'), jvm: args(parent, v, 'jvm') } : undefined,
  };
}

// ---------- Правила ----------
function archMatches(arch) {
  if (arch === 'x86') return process.arch === 'ia32';
  if (arch === 'x64' || arch === 'x86_64') return process.arch === 'x64';
  if (arch === 'arm64' || arch === 'aarch64') return process.arch === 'arm64';
  return true;
}

function rulesAllow(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const rule of rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== OS_NAME) match = false;
      if (rule.os.arch && !archMatches(rule.os.arch)) match = false;
      if (rule.os.version) {
        try {
          if (!new RegExp(rule.os.version).test(os.release())) match = false;
        } catch {
          /* некорректное регулярное выражение — игнорируем */
        }
      }
    }
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) {
        if (!!features[k] !== v) match = false;
      }
    }
    if (match) allowed = rule.action === 'allow';
  }
  return allowed;
}

function mavenPath(name) {
  let [coords, ext = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coords.split(':');
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
  return [...group.split('.'), artifact, version, file].join('/');
}

// Превращает список библиотек в задачи загрузки, classpath и список нативных архивов.
function collectLibraries(version) {
  const classpath = [];
  const natives = [];
  const downloads = [];
  for (const lib of version.libraries || []) {
    if (!rulesAllow(lib.rules)) continue;
    const art = lib.downloads && lib.downloads.artifact;
    if (art || !lib.downloads) {
      const rel = (art && art.path) || mavenPath(lib.name);
      const url = (art && art.url) || (lib.url || LIBRARIES).replace(/\/?$/, '/') + rel;
      const file = path.join(paths.libraries, rel);
      const generated = art && !art.url; // файл создаёт установщик Forge
      if (url && !generated) downloads.push({ url, file, sha1: art && art.sha1, size: art && art.size });
      // Нативные библиотеки нового формата (1.19+) лежат в classpath и дополнительно распаковываются.
      if (/:natives-/.test(lib.name)) natives.push(file);
      classpath.push(file);
    }
    if (lib.natives && lib.natives[OS_NAME]) {
      const classifier = lib.natives[OS_NAME].replace('${arch}', process.arch === 'ia32' ? '32' : '64');
      const nat = lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[classifier];
      if (nat) {
        const file = path.join(paths.libraries, nat.path);
        downloads.push({ url: nat.url, file, sha1: nat.sha1, size: nat.size });
        natives.push(file);
      }
    }
  }
  return { classpath, natives, downloads };
}

// ---------- Java ----------
function runtimePlatform() {
  if (process.platform === 'win32') return { x64: 'windows-x64', ia32: 'windows-x86', arm64: 'windows-arm64' }[process.arch] || 'windows-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return process.arch === 'ia32' ? 'linux-i386' : 'linux';
}

function javaBinary(dir) {
  if (process.platform === 'win32') return path.join(dir, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(dir, 'bin', 'java');
}

async function ensureJava(component, onProgress) {
  const dir = path.join(paths.runtimes, component);
  const marker = path.join(dir, '.onyx-complete');
  if (fs.existsSync(marker) && fs.existsSync(javaBinary(dir))) return javaBinary(dir);

  const all = await fetchJson(JAVA_RUNTIMES);
  let platform = runtimePlatform();
  let entries = all[platform] && all[platform][component];
  if ((!entries || !entries.length) && platform === 'mac-os-arm64') entries = all['mac-os'][component]; // через Rosetta
  if (!entries || !entries.length) throw new Error(`Mojang не предоставляет Java «${component}» для этой системы. Укажите путь к Java в настройках.`);
  const manifest = await fetchJson(entries[0].manifest.url);

  const files = Object.entries(manifest.files);
  const tasks = [];
  const links = [];
  for (const [rel, f] of files) {
    const target = path.join(dir, rel);
    if (f.type === 'directory') await fsp.mkdir(target, { recursive: true });
    else if (f.type === 'link') links.push([target, f.target]);
    else if (f.type === 'file') {
      const raw = f.downloads.raw;
      tasks.push(async () => {
        if (!(await isFileValid(target, raw))) await downloadFile(raw.url, target, raw);
        if (f.executable && process.platform !== 'win32') await fsp.chmod(target, 0o755);
      });
    }
  }
  await runPool(tasks, CONCURRENCY, onProgress);
  if (process.platform !== 'win32') {
    for (const [target, linkTo] of links) {
      try {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.rm(target, { force: true });
        await fsp.symlink(linkTo, target);
      } catch {
        /* необязательные ссылки */
      }
    }
  }
  await fsp.writeFile(marker, new Date().toISOString());
  return javaBinary(dir);
}

// ---------- Ресурсы ----------
async function ensureAssets(version, gameDir, full, onProgress) {
  const idx = version.assetIndex;
  if (!idx) return { assetsRoot: paths.assets, virtualDir: paths.assets };
  const idxFile = path.join(paths.assets, 'indexes', `${idx.id}.json`);
  if (!(await isFileValid(idxFile, idx, true))) await downloadFile(idx.url, idxFile, { sha1: idx.sha1 });
  const index = readJson(idxFile);
  const virtualDir = path.join(paths.assets, 'virtual', idx.id);
  const tasks = Object.entries(index.objects).map(([name, obj]) => async () => {
    const sub = obj.hash.slice(0, 2);
    const file = path.join(paths.assets, 'objects', sub, obj.hash);
    if (!(await isFileValid(file, { sha1: obj.hash, size: obj.size }, full))) {
      await downloadFile(`${RESOURCES}/${sub}/${obj.hash}`, file, { sha1: obj.hash, size: obj.size });
    }
    // Старые версии (до 1.7) читают ресурсы из «виртуальной» папки или из resources/.
    const copyTo = index.map_to_resources ? path.join(gameDir, 'resources', name) : index.virtual ? path.join(virtualDir, name) : null;
    if (copyTo && !fs.existsSync(copyTo)) {
      await fsp.mkdir(path.dirname(copyTo), { recursive: true });
      await fsp.copyFile(file, copyTo);
    }
  });
  await runPool(tasks, CONCURRENCY * 2, onProgress);
  return { assetsRoot: paths.assets, virtualDir };
}

function extractNatives(archives, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of archives) {
    if (!fs.existsSync(file)) continue;
    const zip = new AdmZip(file);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || entry.entryName.startsWith('META-INF')) continue;
      if (!/\.(dll|so|dylib|jnilib)$/i.test(entry.entryName)) continue;
      fs.writeFileSync(path.join(dir, path.basename(entry.entryName)), entry.getData());
    }
  }
}

// ---------- Запуск ----------
function fillArgs(list, vars, features) {
  const out = [];
  for (const arg of list) {
    if (typeof arg === 'string') out.push(arg);
    else if (rulesAllow(arg.rules, features)) out.push(...[].concat(arg.value));
  }
  return out.map((a) => a.replace(/\$\{([a-zA-Z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m)));
}

const running = new Map();

// authlib-injector нужен, чтобы игра брала профиль и скин с Ely.by.
async function ensureAuthlib() {
  const file = path.join(paths.libraries, 'authlib-injector.jar');
  if (fs.existsSync(file)) return file;
  const meta = await fetchJson('https://authlib-injector.yushi.moe/artifact/latest.json');
  const tmp = file + '.dl';
  await downloadFile(meta.download_url, tmp);
  const want = meta.checksums && meta.checksums.sha256;
  if (want && crypto.createHash('sha256').update(fs.readFileSync(tmp)).digest('hex') !== want) {
    fs.rmSync(tmp, { force: true });
    throw new Error('Контрольная сумма authlib-injector не совпала');
  }
  fs.renameSync(tmp, file);
  return file;
}

/**
 * Готовит файлы и запускает игру.
 * emit(type, payload) отправляет события в интерфейс: progress, log, exit.
 */
async function launch({ instance, account, settings, repair = false, quickPlay = null, emit }) {
  const progress = (stage, done = 0, total = 0) => emit('progress', { id: instance.id, stage, done, total });
  if (running.has(instance.id)) throw new Error('Эта сборка уже запущена');

  const gameDir = path.join(paths.instances, instance.id);
  await fsp.mkdir(gameDir, { recursive: true });

  progress('Получение описания версии');
  const vanilla = await ensureVanillaJson(instance.version);

  // Java
  let java = (instance.javaPath || '').trim();
  if (!java) {
    // профиль Java: сборки, иначе общий; «авто» берёт нужную Mojang-среду
    const profiles = require('./javaprofiles');
    const prof = profiles.resolve(instance.javaProfile && instance.javaProfile !== 'default' ? instance.javaProfile : settings.javaProfile);
    if (prof && prof.path) java = prof.path;
    else if (prof && prof.component) {
      progress('Загрузка Java', 0, 0);
      java = await ensureJava(prof.component, (d, t) => progress(`Загрузка Java (${prof.component})`, d, t));
    }
  }
  if (!java) java = (settings.javaPath || '').trim();
  if (!java) {
    const component = (vanilla.javaVersion && vanilla.javaVersion.component) || 'jre-legacy';
    progress('Загрузка Java', 0, 0);
    java = await ensureJava(component, (d, t) => progress(`Загрузка Java (${component})`, d, t));
  }

  const profileId = await ensureProfile(instance, { java, progress, log: (line) => emit('log', { id: instance.id, line: `[Оникс] ${line}` }) });
  const version = resolveVersion(profileId);

  // Клиент и библиотеки
  const jarId = version.jarId;
  const clientJar = path.join(paths.versions, jarId, `${jarId}.jar`);
  const libs = collectLibraries(version);
  const tasks = libs.downloads.map((d) => async () => {
    if (!(await isFileValid(d.file, d, repair))) await downloadFile(d.url, d.file, d);
  });
  const client = version.downloads && version.downloads.client;
  if (client) {
    tasks.push(async () => {
      if (!(await isFileValid(clientJar, client, repair))) await downloadFile(client.url, clientJar, client);
    });
  }
  await runPool(tasks, CONCURRENCY, (d, t) => progress('Загрузка библиотек', d, t));

  // Ресурсы
  const { assetsRoot, virtualDir } = await ensureAssets(version, gameDir, repair, (d, t) => progress('Загрузка ресурсов', d, t));

  progress('Подготовка к запуску');
  const nativesDir = path.join(paths.versions, profileId, 'natives');
  extractNatives(libs.natives, nativesDir);

  const classpath = [...new Set([...libs.classpath, clientJar])].join(path.delimiter);
  const fullscreen = instance.fullscreen ?? settings.fullscreen;
  const width = String(instance.gameWidth || settings.gameWidth || 854);
  const height = String(instance.gameHeight || settings.gameHeight || 480);
  const vars = {
    auth_player_name: account.name,
    version_name: profileId,
    game_directory: gameDir,
    assets_root: assetsRoot,
    game_assets: virtualDir,
    assets_index_name: (version.assetIndex && version.assetIndex.id) || version.assets || 'legacy',
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken,
    auth_session: account.accessToken,
    auth_xuid: account.xuid || '0',
    clientid: '',
    user_type: account.userType,
    user_properties: '{}',
    version_type: version.type || 'release',
    natives_directory: nativesDir,
    launcher_name: 'onyx-launcher',
    launcher_version: '0.2.0',
    classpath,
    classpath_separator: path.delimiter,
    library_directory: paths.libraries,
    resolution_width: width,
    resolution_height: height,
  };
  const hasQuickPlay = JSON.stringify((version.arguments && version.arguments.game) || []).includes('is_quick_play');
  const features = { has_custom_resolution: !fullscreen };
  let serverArgs = [];
  if (quickPlay) {
    if (quickPlay.type === 'world') {
      if (!hasQuickPlay) throw new Error('Вход сразу в мир работает с Minecraft 1.20 и новее');
      Object.assign(features, { has_quick_plays_support: true, is_quick_play_singleplayer: true });
      vars.quickPlaySingleplayer = quickPlay.name;
    } else if (quickPlay.type === 'server') {
      if (hasQuickPlay) {
        Object.assign(features, { has_quick_plays_support: true, is_quick_play_multiplayer: true });
        vars.quickPlayMultiplayer = quickPlay.address;
      } else {
        const [host, port] = String(quickPlay.address).split(':');
        serverArgs = ['--server', host, '--port', port || '25565'];
      }
    }
    vars.quickPlayPath = 'quickPlay/log.json';
    fs.mkdirSync(path.join(gameDir, 'quickPlay'), { recursive: true });
  }

  const memMax = instance.memoryMax || settings.memoryMax;
  const memMin = Math.min(instance.memoryMin || settings.memoryMin, memMax);
  const jvm = [`-Xms${memMin}M`, `-Xmx${memMax}M`, '-Dlog4j2.formatMsgNoLookups=true'];
  const extra = `${settings.jvmArgs || ''} ${instance.jvmArgs || ''}`.trim();
  if (extra) jvm.push(...extra.split(/\s+/));

  let game;
  const extraJvm = (version.arguments && version.arguments.jvm) || [];
  const extraGame = (version.arguments && version.arguments.game) || [];
  if (version.minecraftArguments) {
    // Старый формат (до 1.13): аргументы строкой, JVM-аргументы задаёт лаунчер.
    if (process.platform === 'darwin') jvm.push('-XstartOnFirstThread');
    jvm.push(`-Djava.library.path=${nativesDir}`, '-cp', classpath, ...fillArgs(extraJvm, vars, features));
    game = [...fillArgs(version.minecraftArguments.split(' ').filter(Boolean), vars, features), ...fillArgs(extraGame, vars, features)];
    if (!fullscreen) game.push('--width', width, '--height', height);
  } else {
    jvm.push(...fillArgs(extraJvm, vars, features));
    game = fillArgs(extraGame, vars, features);
  }
  if (fullscreen) game.push('--fullscreen');
  game.push(...serverArgs);

  if (account.ely) {
    const agent = await ensureAuthlib();
    jvm.unshift(`-javaagent:${agent}=ely.by`);
  }
  const args = [...jvm, version.mainClass, ...game];
  emit('log', { id: instance.id, line: `[Оникс] Запуск ${profileId} с Java: ${java}` });

  const child = spawn(java, args, { cwd: gameDir, env: { ...process.env }, windowsHide: false });
  const started = Date.now();
  running.set(instance.id, child);
  progress('Игра запущена');
  emit('started', { id: instance.id });

  const pipe = (stream) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) emit('log', { id: instance.id, line });
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  return new Promise((resolve) => {
    let resolved = false;
    child.on('error', (err) => {
      running.delete(instance.id);
      emit('log', { id: instance.id, line: `[Оникс] Не удалось запустить Java: ${err.message}` });
      emit('exit', { id: instance.id, code: -1, playedMs: 0 });
      if (!resolved) resolve({ started: false, error: err.message });
      resolved = true;
    });
    child.on('exit', (code) => {
      running.delete(instance.id);
      emit('exit', { id: instance.id, code, playedMs: Date.now() - started });
    });
    setTimeout(() => {
      if (!resolved) resolve({ started: true });
      resolved = true;
    }, 300);
  });
}

function stop(id) {
  const child = running.get(id);
  if (child) child.kill();
  return !!child;
}

function runningIds() {
  return [...running.keys()];
}

module.exports = {
  listVersions,
  listLoaderVersions,
  loaderGameVersions,
  launch,
  ensureJava,
  stop,
  runningIds,
  // для тестов
  rulesAllow,
  mavenPath,
  fillArgs,
};
