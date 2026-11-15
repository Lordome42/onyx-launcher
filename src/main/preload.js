// Мост между интерфейсом и основным процессом: только явно разрешённые вызовы.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel) => async (...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  pathForFile: (file) => webUtils.getPathForFile(file),
  packs: { import: call('packs:import'), importFrom: call('packs:importFrom'), classify: call('packs:classify'), pickFile: call('packs:pickFile') },
  window: {
    minimize: call('window:minimize'),
    maximize: call('window:maximize'),
    close: call('window:close'),
    onState: on('window:state'),
  },
  storage: { info: call('storage:info'), cleanExtra: call('storage:cleanExtra'), clearCache: call('storage:clearCache'), prune: call('storage:prune'), backupNow: call('backup:now'), openBackups: call('backup:open'), exportDebug: call('debug:export') },
  storage: { info: call('storage:info'), cleanExtra: call('storage:cleanExtra'), clearCache: call('storage:clearCache'), prune: call('storage:prune'), backupNow: call('backup:now'), openBackups: call('backup:open'), exportDebug: call('debug:export') },
  datadir: { info: call('datadir:info'), choose: call('datadir:choose'), move: call('datadir:move') },
  update: { state: call('update:state'), check: call('update:check'), download: call('update:download'), install: call('update:install') },
  app: { info: call('app:info'), openExternal: call('app:openExternal') },
  settings: { get: call('settings:get'), set: call('settings:set'), openDataDir: call('settings:openDataDir') },
  accounts: {
    list: call('accounts:list'),
    loginMicrosoft: call('accounts:loginMicrosoft'),
    addOffline: call('accounts:addOffline'),
    select: call('accounts:select'),
    remove: call('accounts:remove'),
    loginEly: call('accounts:loginEly'),
  },
  updates: { check: call('updates:check'), apply: call('updates:apply') },
  analyze: { run: call('analyze:run'), installDep: call('analyze:installDep') },
  shots: { list: call('shots:list'), thumb: call('shots:thumb'), full: call('shots:full'), copy: call('shots:copy'), delete: call('shots:delete'), reveal: call('shots:reveal') },
  logs: { list: call('logs:list'), read: call('logs:read'), report: call('logs:report') },
  skinlib: { list: call('skinlib:list'), addFile: call('skinlib:addFile'), addUrl: call('skinlib:addUrl'), remove: call('skinlib:remove'), rename: call('skinlib:rename'), variant: call('skinlib:variant'), apply: call('skinlib:apply') },
  java: { list: call('java:list'), required: call('java:required'), detect: call('java:detect'), pick: call('java:pick'), addCustom: call('java:addCustom'), removeCustom: call('java:removeCustom'), install: call('java:install') },
  skins: { setCape: call('skins:setCape'), profile: call('skins:profile'), pick: call('skins:pick'), set: call('skins:set'), reset: call('skins:reset') },
  versions: { list: call('versions:list'), loaders: call('versions:loaders'), loaderGames: call('versions:loaderGames') },
  instances: {
    list: call('instances:list'),
    get: call('instances:get'),
    create: call('instances:create'),
    update: call('instances:update'),
    remove: call('instances:remove'),
    openFolder: call('instances:openFolder'),
    content: call('instances:content'),
    toggleContent: call('instances:toggleContent'),
    removeContent: call('instances:removeContent'),
    launch: call('instances:launch'),
    stop: call('instances:stop'),
    pickIcon: call('instances:pickIcon'),
    exportMrpack: call('instances:exportMrpack'),
    pickFiles: call('instances:pickFiles'),
    addFiles: call('instances:addFiles'),
    worlds: call('instances:worlds'),
    servers: call('instances:servers'),
    addServer: call('instances:addServer'),
    removeServer: call('instances:removeServer'),
    ping: call('instances:ping'),
  },
  modrinth: { tags: call('modrinth:tags'), search: call('modrinth:search'), project: call('modrinth:project'), install: call('modrinth:install'), detail: call('modrinth:detail'), installModpack: call('modrinth:installModpack') },
  onyxvisual: { status: call('onyxvisual:status'), install: call('onyxvisual:install') },
  curseforge: { detail: call('curseforge:detail'), search: call('curseforge:search'), install: call('curseforge:install'), installModpack: call('curseforge:installModpack') },
  events: {
    onProgress: on('game:progress'),
    onStarted: on('game:started'),
    onLogs: on('game:logs'),
    onVisibility: on('window:visibility'),
    onExit: on('game:exit'),
    onContentProgress: on('content:progress'),
    onUpdate: on('update:state'),
  },
});
