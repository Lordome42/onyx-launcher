const { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const store = require('./store');
const auth = require('./auth');
const instances = require('./instances');
const minecraft = require('./minecraft');
const modrinth = require('./modrinth');
const curseforge = require('./curseforge');
const local = require('./local');
const packs = require('./packs');
const updates = require('./updates');
const analyze = require('./analyze');
const gamefiles = require('./gamefiles');
const updater = require('./updater');
const datadir = require('./datadir');
const maintenance = require('./maintenance');
const javaProfiles = require('./javaprofiles');
const skinlib = require('./skinlib');
const rpc = require('./rpc');
const textures = require('./textures');
app.on('will-quit', () => rpc.shutdown());

// Лёгкий запуск: меньше памяти у интерфейса, без лишних фоновых служб Chromium.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=160');
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,MediaRouter,Translate');
app.commandLine.appendSwitch('disable-background-networking');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 960,
    minHeight: 620,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    backgroundColor: '#0f1115',
    show: false,
    title: 'Оникс',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Внешние ссылки открываем в браузере, а не внутри лаунчера.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Когда окно свёрнуто или скрыто, интерфейс прекращает любые анимации.
  const vis = (hidden) => () => send('window:visibility', { hidden });
  win.on('minimize', vis(true));
  win.on('hide', vis(true));
  win.on('restore', vis(false));
  win.on('show', vis(false));
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Оборачивает обработчик, чтобы ошибки доходили до интерфейса понятным текстом.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(`[${channel}]`, err);
      const msg = err.code === 'ENOSPC' ? 'На диске закончилось место. Освободите его или перенесите данные Оникса на другой диск: Настройки → О лаунчере → Папка данных.' : err.code === 'EPERM' || err.code === 'EACCES' ? `Нет доступа к файлу или папке: ${err.path || ''}`.trim() : err.message || String(err);
      return { ok: false, error: msg };
    }
  });
}

// Окно
handle('window:minimize', () => win.minimize());
handle('window:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
handle('window:close', () => win.close());
handle('update:state', () => updater.getState());
handle('update:check', () => updater.check());
handle('update:download', (restart) => updater.download(!!restart));
handle('update:install', () => updater.install());
handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, dataDir: store.paths.root }));
handle('app:openExternal', (url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

// Настройки
handle('settings:get', () => store.getSettings());
handle('settings:set', (patch) => {
  const res = store.setSettings(patch);
  if ('discordRpc' in patch || 'discordClientId' in patch) rpc.refresh();
  return res;
});
handle('storage:info', () => maintenance.storageInfo());
handle('storage:cleanExtra', () => maintenance.cleanExtra());
handle('storage:clearCache', () => maintenance.clearCache());
handle('storage:prune', () => maintenance.pruneCache());
handle('backup:now', () => maintenance.backupNow());
handle('backup:open', () => maintenance.openBackups());
handle('debug:export', () => maintenance.exportDebug(win));
handle('datadir:info', () => datadir.info());
handle('datadir:choose', () => datadir.choose(win));
handle('datadir:move', (dir) => datadir.move(dir, (stage, done, total) => send('content:progress', { key: 'datadir', stage, done, total })));
handle('settings:openDataDir', () => shell.openPath(store.paths.root));

// Аккаунты
handle('accounts:list', () => textures.withAccountTextures(auth.listAccounts()));
handle('accounts:loginMicrosoft', () => textures.withAccountTextures(auth.loginMicrosoft(win)));
handle('accounts:addOffline', (name) => textures.withAccountTextures(auth.addOffline(name)));
handle('accounts:select', (id) => textures.withAccountTextures(auth.selectAccount(id)));
handle('accounts:remove', (id) => textures.withAccountTextures(auth.removeAccount(id)));

// Версии
handle('versions:list', () => minecraft.listVersions());
handle('versions:loaders', (loader, mc) => minecraft.listLoaderVersions(loader, mc));
handle('versions:loaderGames', (loader) => minecraft.loaderGameVersions(loader));

// Сборки
handle('instances:list', () => instances.list().map((i) => ({ ...i, running: minecraft.runningIds().includes(i.id) })));
handle('instances:get', (id) => ({ ...instances.get(id), running: minecraft.runningIds().includes(id) }));
handle('instances:create', (opts) => instances.create(opts));
handle('instances:update', (id, patch) => instances.update(id, patch));
handle('instances:remove', (id) => instances.remove(id));
handle('instances:openFolder', (id) => shell.openPath(instances.dirOf(id)));
handle('instances:content', (id) => instances.listContent(id));
handle('instances:toggleContent', (id, type, file) => instances.toggleContent(id, type, file));
handle('instances:removeContent', (id, type, file) => instances.removeContent(id, type, file));

// Строки журнала и прогресс пересылаем пачками, чтобы поток вывода игры не нагружал интерфейс.
let logBuf = [];
let logTimer = null;
const lastProgress = new Map();
function queueLog(payload) {
  logBuf.push(payload);
  if (!logTimer) {
    logTimer = setTimeout(() => {
      logTimer = null;
      const batch = logBuf;
      logBuf = [];
      send('game:logs', batch);
    }, 150);
  }
}

handle('instances:launch', async (id, opts = {}) => {
  const instance = instances.get(id);
  const settings = store.getSettings();
  const account = await auth.getLaunchAccount();
  const emit = (type, payload) => {
    if (type === 'log') return queueLog(payload);
    if (type === 'progress') {
      const prev = lastProgress.get(id) || 0;
      const edge = payload.done === 0 || payload.done === payload.total;
      if (!edge && Date.now() - prev < 120) return;
      lastProgress.set(id, Date.now());
    }
    send(`game:${type}`, payload);
    if (type === 'started') rpc.playing(instance);
    if (type === 'exit') {
      rpc.idle();
      instances.recordPlay(payload.id, payload.playedMs);
      if (settings.closeOnLaunch && win && !win.isDestroyed()) win.show();
    }
  };
  const result = await minecraft.launch({ instance, account, settings, repair: !!opts.repair, quickPlay: opts.quickPlay || null, emit });
  if (result.started) {
    const patch = { lastPlayed: Date.now() };
    const q = opts.quickPlay;
    if (q && (q.type === 'server' || q.type === 'world')) {
      // История входов в миры и на серверы для блока «Последние» на главной.
      const key = q.type === 'server' ? q.address : q.name;
      const entry = { type: q.type, key, label: String(q.label || key).slice(0, 80), at: Date.now() };
      patch.recent = [entry, ...(instances.get(id).recent || []).filter((r) => !(r.type === entry.type && r.key === key))].slice(0, 6);
    }
    instances.update(id, patch);
    if (settings.closeOnLaunch) win.hide();
  } else if (result.error) {
    throw new Error(`Java не запустилась: ${result.error}`);
  }
  return result;
});
handle('instances:stop', (id) => minecraft.stop(id));

// Иконка, экспорт, импорт, файлы
handle('instances:pickIcon', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Выберите иконку сборки', properties: ['openFile'], filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
  return r.canceled ? null : packs.makeIcon(r.filePaths[0]);
});
handle('instances:exportMrpack', async (id, opts = {}) => {
  const inst = instances.get(id);
  const safe = inst.name.replace(/[\\/:*?"<>|]+/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Экспорт сборки', defaultPath: `${safe}.mrpack`, filters: [{ name: 'Modrinth modpack', extensions: ['mrpack'] }] });
  if (r.canceled) return null;
  return packs.exportMrpack(id, r.filePath, opts, (stage, done, total) => send('content:progress', { key: `export:${id}`, stage, done, total }));
});
handle('packs:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Импорт сборки', properties: ['openFile'], filters: [{ name: 'Сборки', extensions: ['mrpack', 'zip'] }] });
  if (r.canceled) return null;
  return packs.importPack(r.filePaths[0], (stage, done, total) => send('content:progress', { key: 'import', stage, done, total }));
});
handle('packs:classify', (text) => {
  const src = require('./importsrc').parseSource(text);
  return src ? { kind: src.kind, why: src.why || '' } : null;
});
handle('packs:importFrom', (input) => packs.importFrom(input, (stage, done, total) => send('content:progress', { key: 'import', stage, done, total })));
handle('packs:pickFile', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Импорт сборки', properties: ['openFile'], filters: [{ name: 'Сборки', extensions: ['mrpack', 'zip'] }] });
  return r.canceled ? null : r.filePaths[0];
});
handle('instances:pickFiles', async (id) => {
  const r = await dialog.showOpenDialog(win, { title: 'Добавить моды, ресурспаки или шейдеры', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Моды и архивы', extensions: ['jar', 'zip'] }] });
  return r.canceled ? null : packs.addFiles(id, r.filePaths);
});
handle('instances:addFiles', (id, files) => packs.addFiles(id, files));

// Обновления, проверка модов
handle('updates:check', (id) => updates.check(id));
handle('updates:apply', (id, items) => updates.apply(id, items, (stage, done, total) => send('content:progress', { key: `update:${id}`, stage, done, total })));
handle('analyze:run', (id) => analyze.analyze(id));
handle('analyze:installDep', (id, modid) => analyze.installDependency(id, modid));

// Скриншоты и журналы
handle('shots:list', (id) => gamefiles.screenshots(id));
handle('shots:thumb', (id, f) => gamefiles.thumb(id, f));
handle('shots:full', (id, f) => gamefiles.fullShot(id, f));
handle('shots:copy', (id, f) => gamefiles.copyShot(id, f));
handle('shots:delete', (id, f) => gamefiles.deleteShot(id, f));
handle('shots:reveal', (id, f) => gamefiles.revealShot(id, f));
handle('logs:list', (id) => gamefiles.listLogs(id));
handle('logs:read', (id, rel) => gamefiles.readLog(id, rel));
handle('logs:report', (id) => gamefiles.report(id));

// Страница проекта
handle('modrinth:detail', (id, inst) => modrinth.detail(id, inst));
handle('curseforge:detail', (id, inst) => curseforge.detail(id, inst));

// Миры, серверы
handle('instances:worlds', (id) => instances.listWorlds(id));
handle('instances:servers', (id) => instances.listServers(id));
handle('instances:addServer', (id, name, address) => instances.addServer(id, name, address));
handle('instances:removeServer', (id, address) => instances.removeServer(id, address));
handle('instances:ping', (address) => local.pingServer(address));

// Скины
handle('skins:profile', (id) => auth.skinProfile(id));
handle('skins:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Выберите скин (PNG 64×64)', properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (r.canceled) return null;
  const file = r.filePaths[0];
  return { path: file, dataUrl: 'data:image/png;base64,' + require('fs').readFileSync(file).toString('base64') };
});
handle('skins:set', (id, file, variant) => auth.setSkin(id, file, variant));
handle('skins:reset', (id) => auth.resetSkin(id));
handle('skins:setCape', (id, capeId) => auth.setCape(id, capeId));
handle('skinlib:list', () => skinlib.list());
handle('skinlib:addFile', (file, name, variant) => skinlib.addFile(file, name, variant));
handle('skinlib:addUrl', (url, name, variant) => skinlib.addUrl(url, name, variant));
handle('skinlib:remove', (id) => skinlib.remove(id));
handle('skinlib:rename', (id, name) => skinlib.rename(id, name));
handle('skinlib:variant', (id, variant) => skinlib.update(id, { variant }));
handle('skinlib:apply', (accId, id) => {
  const f = skinlib.filePath(id);
  return auth.setSkin(accId, f.file, f.variant);
});
// Профили Java
handle('java:list', () => javaProfiles.list());
handle('java:required', (version) => javaProfiles.requiredMajor(version));
handle('java:detect', () => javaProfiles.detect());
handle('java:pick', () => javaProfiles.pick(win));
handle('java:addCustom', (p) => javaProfiles.addCustom(p));
handle('java:removeCustom', (id) => javaProfiles.removeCustom(id));
handle('java:install', async (component) => {
  const comp = javaProfiles.COMPONENTS.find((c) => c.id === component);
  if (!comp) throw new Error('Неизвестная среда Java');
  await minecraft.ensureJava(component, (done, total) => send('content:progress', { key: 'java', stage: `Загрузка ${comp.label}`, done, total }));
  return javaProfiles.list();
});
handle('accounts:loginEly', (u, p, code) => textures.withAccountTextures(auth.loginEly(u, p, code)));

// Modrinth
handle('modrinth:search', (params) => modrinth.search(params));
handle('modrinth:tags', () => modrinth.tags());
handle('modrinth:project', (id) => modrinth.project(id));
handle('modrinth:install', (instanceId, projectId, versionId) =>
  modrinth.install(instanceId, projectId, (stage) => send('content:progress', { key: instanceId, stage }), versionId)
);
handle('modrinth:installModpack', (projectId) =>
  modrinth.installModpack(projectId, (stage, done, total) => send('content:progress', { key: `modpack:${projectId}`, stage, done, total }))
);

// Onyx Visual
const onyxvisual = require('./onyxvisual');
handle('onyxvisual:status', (instanceId) => onyxvisual.status(instanceId));
handle('onyxvisual:install', (instanceId) =>
  onyxvisual.install(instanceId, (stage) => send('content:progress', { key: instanceId, stage }))
);

// CurseForge
handle('curseforge:search', (params) => curseforge.search(params));
handle('curseforge:install', (instanceId, modId, fileId) =>
  curseforge.install(instanceId, modId, (stage) => send('content:progress', { key: instanceId, stage }), fileId)
);
handle('curseforge:installModpack', (modId) =>
  curseforge.installModpack(modId, (stage, done, total) => send('content:progress', { key: `modpack:cf${modId}`, stage, done, total }))
);

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createWindow();
  updater.init(send);
  maintenance.backupDaily().catch(() => {});
  rpc.idle();
  maintenance.pruneCache().catch(() => {});
  updater.checkOnStart();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
