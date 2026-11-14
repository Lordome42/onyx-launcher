// Демо-данные для просмотра интерфейса в обычном браузере (без Electron). Используется только для скриншотов.
(function () {
  const svgIcon = (h, ch) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 60%)"/><stop offset="1" stop-color="hsl(${h + 40} 70% 35%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="42" font-family="Arial" font-weight="700" font-size="28" text-anchor="middle" fill="white">${ch}</text></svg>`
    );
  const now = Date.now();
  const skinDataUrl = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const r = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    r('#e8b89a', 8, 8, 8, 8); r('#3b2a22', 8, 8, 8, 3); r('#3b2a22', 40, 8, 8, 4);
    r('#222', 10, 12, 1, 1); r('#222', 13, 12, 1, 1);
    r('#b32b30', 20, 20, 8, 12); r('#e8b89a', 44, 20, 4, 12); r('#e8b89a', 36, 52, 4, 12);
    r('#2b2b3a', 4, 20, 4, 12); r('#2b2b3a', 20, 52, 4, 12); r('#c9a45c', 20, 30, 8, 2);
    return c.toDataURL();
  })();
  const instances = [
    { id: 'survival', name: 'Выживание с друзьями', version: '1.21.4', loader: 'fabric', loaderVersion: '0.16.9', hue: 262, pinned: true, lastPlayed: now - 2 * 3600e3, playTime: 41 * 3600e3, content: { 'sodium.jar': { projectId: 'AANobbMI' } } },
    { id: 'tech', name: 'Техно-сборка', version: '1.20.1', loader: 'forge', hue: 190, pinned: true, lastPlayed: now - 3 * 86400e3, playTime: 12 * 3600e3, content: {} },
    { id: 'vanilla', name: 'Ванилла 1.21', version: '1.21.4', loader: 'vanilla', hue: 125, lastPlayed: now - 9 * 86400e3, playTime: 5 * 3600e3, content: {} },
    { id: 'skyblock', name: 'Скайблок', version: '1.19.2', loader: 'fabric', hue: 40, lastPlayed: 0, playTime: 0, content: {} },
    { id: 'retro', name: 'Ретро 1.8.9', version: '1.8.9', loader: 'vanilla', hue: 340, lastPlayed: now - 40 * 86400e3, playTime: 2 * 3600e3, content: {} },
  ];
  const mods = [
    ['Sodium', 'Современный движок рендеринга, который заметно повышает FPS.', 98e6, 'jellysquid3', 200, 'S', ['optimization']],
    ['Fabric API', 'Базовая библиотека для большинства модов на Fabric.', 120e6, 'modmuss50', 30, 'F', ['library']],
    ['Iris Shaders', 'Мод для шейдеров, совместимый с Sodium.', 72e6, 'coderbot', 280, 'I', ['decoration', 'optimization']],
    ['Lithium', 'Оптимизирует игровую логику без изменения поведения.', 54e6, 'jellysquid3', 150, 'L', ['optimization']],
    ['Mod Menu', 'Добавляет меню модов с настройками прямо в игре.', 61e6, 'Prospector', 320, 'M', ['utility']],
    ['Xaero’s Minimap', 'Миникарта с путевыми точками и картой мира.', 40e6, 'xaero96', 100, 'X', ['adventure', 'utility']],
    ['Entity Culling', 'Не рисует сущностей, которых не видно.', 33e6, 'tr7zw', 10, 'E', ['optimization']],
    ['Zoomify', 'Плавное приближение камеры, как у подзорной трубы.', 21e6, 'isxander', 240, 'Z', ['utility']],
    ['Cloth Config', 'Библиотека экранов настроек для модов.', 70e6, 'shedaniel', 60, 'C', ['library']],
  ];
  const hits = mods.map(([title, description, downloads, author, h, ch, cats], i) => ({
    project_id: 'p' + i,
    slug: title.toLowerCase().replace(/\W+/g, '-'),
    project_type: 'mod',
    title,
    description,
    downloads,
    follows: Math.round(downloads / 3000),
    author,
    icon_url: svgIcon(h, ch),
    display_categories: [...cats, 'fabric'],
    date_modified: new Date(now - (i + 1) * 86400e3 * 3).toISOString(),
  }));

  const projectDetail = (source) => ({
    source, id: 'AANobbMI', slug: 'sodium', type: 'mod', title: 'Sodium', summary: 'Современный движок отрисовки, который заметно повышает FPS и убирает микрофризы.',
    body: '## О моде\n\nSodium заменяет **движок рендеринга** Minecraft более быстрым и эффективным. Совместим с [Iris Shaders](https://modrinth.com/mod/iris).\n\n- Больше FPS на любом железе\n- Меньше подтормаживаний\n- Совместим с Fabric и Quilt\n\n### Установка\n\nПросто положите мод в папку `mods`.\n\n> Для шейдеров дополнительно нужен Iris.',
    bodyFormat: 'markdown', icon: null, downloads: 62000000, follows: 98000, categories: ['optimization', 'client'], gameVersions: ['1.21', '1.21.1', '1.21.3', '1.21.4'], loaders: ['fabric', 'quilt'],
    updated: new Date(Date.now() - 4 * 86400e3).toISOString(), authors: ['jellysquid3', 'IMS'], gallery: [{ url: 'x', title: 'Сравнение' }],
    links: { site: 'https://modrinth.com/mod/sodium', source: 'https://github.com/CaffeineMC/sodium', issues: 'https://github.com/CaffeineMC/sodium/issues', discord: 'https://discord.gg/x' },
    filtered: true,
    versions: [
      { id: 'v1', name: 'mc1.21.4-0.6.5', title: 'Sodium 0.6.5', type: 'release', date: new Date(Date.now() - 4 * 86400e3).toISOString(), downloads: 1200000, gameVersions: ['1.21.4'], loaders: ['fabric', 'quilt'] },
      { id: 'v2', name: 'mc1.21.4-0.6.4', title: 'Sodium 0.6.4', type: 'release', date: new Date(Date.now() - 20 * 86400e3).toISOString(), downloads: 900000, gameVersions: ['1.21.4'], loaders: ['fabric'] },
      { id: 'v3', name: 'mc1.21.4-0.6.6-beta.1', title: 'Sodium 0.6.6 beta', type: 'beta', date: new Date(Date.now() - 2 * 86400e3).toISOString(), downloads: 40000, gameVersions: ['1.21.4'], loaders: ['fabric'] },
    ],
  });
  const content = [
    { file: 'sodium.jar', baseName: 'sodium.jar', type: 'mod', enabled: true, size: 1.1e6, title: 'Sodium', versionNumber: 'mc1.21.4-0.6.5', iconUrl: svgIcon(200, 'S') },
    { file: 'fabric-api.jar', baseName: 'fabric-api.jar', type: 'mod', enabled: true, size: 2.3e6, title: 'Fabric API', versionNumber: '0.110.5+1.21.4', iconUrl: svgIcon(30, 'F') },
    { file: 'iris.jar', baseName: 'iris.jar', type: 'mod', enabled: true, size: 2.9e6, title: 'Iris Shaders', versionNumber: '1.8.5+1.21.4', iconUrl: svgIcon(280, 'I') },
    { file: 'modmenu.jar.disabled', baseName: 'modmenu.jar', type: 'mod', enabled: false, size: 0.6e6, title: 'Mod Menu', versionNumber: '13.0.0', iconUrl: svgIcon(320, 'M') },
    { file: 'faithful.zip', baseName: 'faithful.zip', type: 'resourcepack', enabled: true, size: 12e6, title: 'Faithful 32x', versionNumber: '1.21.4' },
    { file: 'complementary.zip', baseName: 'complementary.zip', type: 'shader', enabled: true, size: 0.4e6, title: 'Complementary Reimagined', versionNumber: 'r5.3' },
  ];
  let settings = { theme: new URLSearchParams(location.search).get('theme') || 'samurai', memoryMax: 6144, memoryMin: 1024, javaPath: '', jvmArgs: '', gameWidth: 1280, gameHeight: 720, fullscreen: false, closeOnLaunch: false, showSnapshots: false, msClientId: '' };
  let accounts = {
    selected: 'a1',
    list: [
      { id: 'a1', type: 'msa', name: 'Dome_Builder', uuid: 'x' },
      { id: 'a2', type: 'ely', name: 'Ronin_77', uuid: 'z' },
      { id: 'a3', type: 'offline', name: 'Steve_2024', uuid: 'y' },
    ],
  };
  const ok = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));
  const noop = () => () => {};
  window.api = {
    platform: 'win32',
    window: { minimize: ok, maximize: ok, close: ok, onState: noop },
    app: { info: () => ok({ version: '0.1.0', platform: 'win32', dataDir: 'C:\\Users\\Dome\\AppData\\Roaming\\.onyx-launcher' }), openExternal: ok },
    settings: { get: () => ok(settings), set: (p) => ok((settings = { ...settings, ...p })), openDataDir: ok },
    accounts: { loginEly: ok, list: () => ok(accounts), loginMicrosoft: ok, addOffline: ok, select: (id) => ok((accounts.selected = id, accounts)), remove: () => ok(accounts) },
    versions: {
      list: () => ok({ latest: { release: '1.21.4' }, versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'].map((id) => ({ id, type: 'release' })) }),
      loaders: () => ok([{ version: '0.16.9', stable: true }, { version: '0.16.8', stable: true }]),
      loaderGames: () => ok(['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5']),
    },
    instances: {
      list: () => ok(instances.map((i) => ({ ...i, running: i.id === 'tech' }))),
      get: (id) => ok(instances.find((i) => i.id === id)),
      create: ok,
      update: ok,
      remove: ok,
      openFolder: ok,
      content: () => ok(content),
      toggleContent: () => ok(content),
      removeContent: () => ok(content),
      launch: () => new Promise(() => {}),
      stop: ok,
      worlds: () => ok([
        { folder: 'World1', name: 'Новый мир', lastPlayed: now - 3600e3, gameType: 0, hardcore: false, icon: null },
        { folder: 'Creative', name: 'Творческая площадка', lastPlayed: now - 5 * 86400e3, gameType: 1, hardcore: false, icon: null },
        { folder: 'HC', name: 'Хардкор', lastPlayed: now - 20 * 86400e3, gameType: 0, hardcore: true, icon: null },
      ]),
      servers: () => ok([{ name: 'Мой сервер', address: 'play.example.com' }, { name: 'Друзья', address: '192.168.1.20:25565', fromGame: true }]),
      addServer: ok, removeServer: ok,
      pickIcon: ok, exportMrpack: () => ok({ linked: 12, bundled: 2 }), pickFiles: () => ok({ added: [], skipped: [] }), addFiles: () => ok({ added: [], skipped: [] }),
      ping: (a) => ok(a.startsWith('play') ? { ok: true, latency: 38, motd: 'Добро пожаловать на сервер!', online: 12, max: 100, favicon: null } : { ok: false }),
    },

    updates: {
      check: () => ok({ checked: 4, total: 4, updates: [
        { key: 'm:sodium.jar', source: 'modrinth', type: 'mod', file: 'sodium.jar', title: 'Sodium', current: '0.6.0', latest: '0.6.5', enabled: true },
        { key: 'm:lithium.jar', source: 'modrinth', type: 'mod', file: 'lithium.jar', title: 'Lithium', current: '0.14.0', latest: '0.14.3', enabled: true },
        { key: 'c:jei.jar', source: 'curseforge', type: 'mod', file: 'jei.jar', title: 'Just Enough Items', current: '19.21.0', latest: '19.21.2', enabled: false, blocked: true },
      ] }),
      apply: () => ok({ updated: 2, failed: [] }),
    },
    analyze: {
      run: () => ok({ checked: 4, loader: 'fabric', version: '1.21.4', issues: [
        { severity: 'error', kind: 'missing', mod: 'Iris Shaders', file: 'iris.jar', text: 'Нужен мод «sodium», но он не установлен.', fix: { modid: 'sodium' } },
        { severity: 'error', kind: 'loader', mod: 'Create', file: 'create.jar', text: 'Мод сделан для forge, а сборка использует fabric. Игра может не запуститься.' },
        { severity: 'warn', kind: 'version', mod: 'Xaero Minimap', file: 'xaero.jar', text: 'Рассчитан на Minecraft 1.21.1, а в сборке 1.21.4.' },
        { severity: 'error', kind: 'duplicate', mod: 'lithium', file: 'lithium.jar', text: 'Мод «lithium» установлен дважды: lithium.jar, lithium-0.14.jar. Оставьте один файл.' },
      ] }),
      installDep: ok,
    },
    shots: {
      list: () => ok(Array.from({ length: 9 }, (_, i) => ({ file: `2025-06-${10 + i}_21.${10 + i}.33.png`, size: 1.4e6 + i * 9e4, mtime: now - i * 86400e3 }))),
      thumb: (id, f) => { const h = (f.length * 37) % 360; return ok('data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="203"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},60%,62%)"/><stop offset="0.6" stop-color="hsl(${h + 30},50%,40%)"/><stop offset="1" stop-color="hsl(${h + 60},40%,18%)"/></linearGradient></defs><rect width="360" height="203" fill="url(#g)"/><rect y="150" width="360" height="53" fill="hsl(110,35%,28%)"/></svg>`)); },
      full: (id, f) => ok('data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="hsl(210,50%,50%)"/><rect y="520" width="1280" height="200" fill="hsl(110,35%,28%)"/></svg>`)),
      copy: ok, delete: ok, reveal: ok,
    },
    logs: {
      list: () => ok([{ path: 'logs/latest.log', name: 'latest.log', kind: 'log', size: 48213, mtime: now }, { path: 'crash-reports/crash-2025-06-12_21.44.10-client.txt', name: 'crash-2025-06-12_21.44.10-client.txt', kind: 'crash', size: 9120, mtime: now - 86400e3 }]),
      read: () => ok({ text: ['[21:14:02] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.9', '[21:14:03] [main/INFO]: Loading 4 mods', '[21:14:05] [main/WARN]: Mod xaero.jar requested version 1.21.1', '[21:14:07] [Render thread/INFO]: Reloading ResourceManager', '[21:14:09] [Render thread/ERROR]: Failed to load shader pack', 'java.lang.IllegalStateException: shader missing', '\tat net.irisshaders.iris.Iris.load(Iris.java:204)', '[21:14:12] [Render thread/INFO]: Created: 1024x512 atlas'].join('\n') }),
      report: () => ok('Оникс 0.3.0'),
    },
    modrinth: { tags: () => Promise.reject(new Error('offline')), detail: (id) => ok(projectDetail('modrinth')), search: () => ok({ hits, total_hits: 40 }), project: ok, install: () => ok(['x']) },
    packs: { import: ok },
    pathForFile: () => '',
    skins: {
      profile: (id) => ok({ type: id === 'a1' ? 'msa' : id === 'a2' ? 'ely' : 'offline', name: 'x', skinUrl: skinDataUrl, variant: 'classic' }),
      pick: ok, set: ok, reset: ok,
    },
    curseforge: { detail: () => ok(projectDetail('curseforge')), search: () => ok({ hits: hits.map((h) => ({ ...h, source: 'curseforge', display_categories: ['Technology', 'Magic'] })), total_hits: 40 }), install: () => ok({ installed: ['x'], skipped: [] }), installModpack: () => ok({ instance: instances[0], manual: [] }) },
    datadir: { info: () => ok({ dir: 'C:\\Users\\User\\AppData\\Roaming\\.onyx-launcher', size: 6.4e9, free: 3.1e9 }), choose: () => ok('D:\\Games'), move: ok },
    update: { state: () => ok({ status: 'idle' }), check: () => ok({ status: 'none' }), download: ok, install: ok },
    events: { onUpdate: noop, onProgress: noop, onStarted: noop, onLogs: noop, onVisibility: noop, onExit: noop, onContentProgress: noop },
  };
})();
