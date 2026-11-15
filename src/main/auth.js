// Аккаунты: вход через Microsoft (официальный OAuth → Xbox Live → Minecraft Services) и офлайн-профили.
const { BrowserWindow } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const { fetchJson } = require('./net');
const store = require('./store');

// Публичный client id официального лаунчера Minecraft для потока login.live.com.
// В настройках можно указать собственный client id приложения Azure.
const LIVE_CLIENT_ID = '00000000402b5328';

function oauthConfig() {
  const custom = store.getSettings().msClientId.trim();
  if (custom) {
    return {
      clientId: custom,
      authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      redirectUri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
      scope: 'XboxLive.signin offline_access',
      rpsPrefix: 'd=',
    };
  }
  return {
    clientId: LIVE_CLIENT_ID,
    authorizeUrl: 'https://login.live.com/oauth20_authorize.srf',
    tokenUrl: 'https://login.live.com/oauth20_token.srf',
    redirectUri: 'https://login.live.com/oauth20_desktop.srf',
    scope: 'service::user.auth.xboxlive.com::MBI_SSL',
    rpsPrefix: '',
  };
}

// Открывает окно входа Microsoft и возвращает authorization code.
function requestAuthCode(parent) {
  const cfg = oauthConfig();
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('prompt', 'select_account');

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 700,
      parent,
      modal: !!parent,
      title: 'Вход в Microsoft',
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      // Отдельная временная сессия, чтобы можно было войти в другой аккаунт.
      webPreferences: { partition: 'msauth-' + Date.now(), sandbox: true },
    });
    let finished = false;

    const check = (target) => {
      if (!target.startsWith(cfg.redirectUri)) return false;
      const u = new URL(target);
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      finished = true;
      win.close();
      if (code) resolve(code);
      else reject(new Error(error === 'access_denied' ? 'Вход отменён' : `Ошибка входа: ${error || 'неизвестно'}`));
      return true;
    };

    win.webContents.on('will-redirect', (e, target) => {
      if (check(target)) e.preventDefault();
    });
    win.webContents.on('will-navigate', (e, target) => {
      if (check(target)) e.preventDefault();
    });
    win.webContents.on('did-navigate', (_e, target) => check(target));
    win.on('closed', () => {
      if (!finished) reject(new Error('Окно входа закрыто'));
    });
    win.loadURL(url.toString());
  });
}

async function msToken(params) {
  const cfg = oauthConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    ...params,
  });
  return fetchJson(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

const XSTS_ERRORS = {
  2148916233: 'У этого аккаунта Microsoft нет профиля Xbox. Войдите на minecraft.net и создайте его.',
  2148916235: 'Xbox Live недоступен в вашей стране.',
  2148916236: 'Аккаунту нужна проверка возраста на xbox.com.',
  2148916237: 'Аккаунту нужна проверка возраста на xbox.com.',
  2148916238: 'Это детский аккаунт: его нужно добавить в семью на account.microsoft.com.',
};

// Полная цепочка: токен Microsoft → Xbox Live → XSTS → Minecraft → профиль.
async function minecraftFromMsToken(msAccessToken) {
  const cfg = oauthConfig();
  const json = { 'Content-Type': 'application/json', Accept: 'application/json' };

  const xbl = await fetchJson('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: cfg.rpsPrefix + msAccessToken },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }),
  });
  const uhs = xbl.DisplayClaims.xui[0].uhs;

  let xsts;
  try {
    xsts = await fetchJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      }),
    });
  } catch (err) {
    const code = err.body && err.body.XErr;
    throw new Error(XSTS_ERRORS[code] || 'Не удалось авторизоваться в Xbox Live');
  }

  const mc = await fetchJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xsts.Token}` }),
  });

  let profile;
  try {
    profile = await fetchJson('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${mc.access_token}` },
    });
  } catch (err) {
    if (err.status === 404) throw new Error('На этом аккаунте не куплен Minecraft: Java Edition.');
    throw err;
  }

  const skin = (profile.skins || []).find((s) => s.state === 'ACTIVE') || (profile.skins || [])[0];
  return {
    uuid: profile.id,
    name: profile.name,
    accessToken: mc.access_token,
    expiresAt: Date.now() + mc.expires_in * 1000,
    skinUrl: skin ? skin.url : null,
    xuid: xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0].xid ? xsts.DisplayClaims.xui[0].xid : '',
  };
}

async function loginMicrosoft(parent) {
  const code = await requestAuthCode(parent);
  const tokens = await msToken({ code, grant_type: 'authorization_code' });
  const mc = await minecraftFromMsToken(tokens.access_token);
  const data = store.loadAccounts();
  const existing = data.list.find((a) => a.type === 'msa' && a.uuid === mc.uuid);
  const account = {
    id: existing ? existing.id : crypto.randomUUID(),
    type: 'msa',
    ...mc,
    refreshToken: tokens.refresh_token,
  };
  data.list = data.list.filter((a) => a.id !== account.id).concat(account);
  data.selected = account.id;
  store.saveAccounts(data);
  return store.publicAccount(account);
}

// UUID офлайн-игрока по тому же алгоритму, что и у сервера в offline-mode.
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  return md5.toString('hex');
}

function addOffline(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('Ник должен быть от 3 до 16 символов: латиница, цифры и _');
  }
  const data = store.loadAccounts();
  const uuid = offlineUuid(name);
  let account = data.list.find((a) => a.type === 'offline' && a.uuid === uuid);
  if (!account) {
    account = { id: crypto.randomUUID(), type: 'offline', name, uuid, accessToken: '', refreshToken: '' };
    data.list.push(account);
  }
  data.selected = account.id;
  store.saveAccounts(data);
  return store.publicAccount(account);
}

// ---------- Ely.by (Yggdrasil-совместимый сервер для «пиратских» аккаунтов со скинами) ----------
const ELY_AUTH = 'https://authserver.ely.by/auth';
const ely = (route, payload) =>
  fetchJson(`${ELY_AUTH}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

async function loginEly(username, password, code) {
  username = String(username || '').trim();
  if (!username || !password) throw new Error('Введите логин и пароль Ely.by');
  const clientToken = crypto.randomUUID();
  let res;
  try {
    res = await ely('authenticate', { username, password: code ? `${password}:${String(code).trim()}` : password, clientToken, requestUser: true });
  } catch (err) {
    const msg = (err.body && err.body.errorMessage) || '';
    if (/two factor/i.test(msg)) throw new Error('У аккаунта включена двухфакторная защита: введите код из приложения.');
    if (err.status === 401 || err.status === 403) throw new Error('Неверный логин или пароль Ely.by.');
    throw err;
  }
  const p = res.selectedProfile;
  if (!p) throw new Error('На этом аккаунте Ely.by нет профиля игрока.');
  const data = store.loadAccounts();
  const existing = data.list.find((a) => a.type === 'ely' && a.uuid === p.id);
  const account = {
    id: existing ? existing.id : crypto.randomUUID(),
    type: 'ely',
    name: p.name,
    uuid: p.id,
    accessToken: res.accessToken,
    refreshToken: '',
    clientToken: res.clientToken || clientToken,
    skinUrl: `https://skinsystem.ely.by/skins/${encodeURIComponent(p.name)}.png`,
  };
  data.list = data.list.filter((a) => a.id !== account.id).concat(account);
  data.selected = account.id;
  store.saveAccounts(data);
  return store.publicAccount(account);
}

async function refreshEly(account, data) {
  try {
    await ely('validate', { accessToken: account.accessToken, clientToken: account.clientToken });
    return;
  } catch {
    /* токен устарел — пробуем обновить */
  }
  try {
    const res = await ely('refresh', { accessToken: account.accessToken, clientToken: account.clientToken });
    account.accessToken = res.accessToken;
    store.saveAccounts(data);
  } catch {
    throw new Error('Сессия Ely.by истекла: войдите в аккаунт Ely.by заново');
  }
}

async function freshMs(account, data) {
  if (!account.accessToken || !account.expiresAt || account.expiresAt < Date.now() + 5 * 60 * 1000) {
    if (!account.refreshToken) throw new Error('Сессия истекла: войдите в аккаунт Microsoft заново');
    let tokens;
    try {
      tokens = await msToken({ refresh_token: account.refreshToken, grant_type: 'refresh_token' });
    } catch {
      throw new Error('Сессия истекла: войдите в аккаунт Microsoft заново');
    }
    const mc = await minecraftFromMsToken(tokens.access_token);
    Object.assign(account, mc, { refreshToken: tokens.refresh_token || account.refreshToken });
    store.saveAccounts(data);
  }
}

// Возвращает аккаунт, готовый к запуску игры, при необходимости обновляя токены.
async function getLaunchAccount() {
  const data = store.loadAccounts();
  const account = data.list.find((a) => a.id === data.selected);
  if (!account) throw new Error('Сначала добавьте аккаунт');
  if (account.type === 'offline') {
    return { name: account.name, uuid: account.uuid, accessToken: crypto.randomBytes(16).toString('hex'), userType: 'legacy', xuid: '0' };
  }
  if (account.type === 'ely') {
    await refreshEly(account, data);
    return { name: account.name, uuid: account.uuid, accessToken: account.accessToken, userType: 'mojang', xuid: '0', ely: true };
  }
  await freshMs(account, data);
  return { name: account.name, uuid: account.uuid, accessToken: account.accessToken, userType: 'msa', xuid: account.xuid || '0' };
}

// ---------- Скины ----------
function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(24);
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Это не PNG-файл');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function findAccount(id) {
  const data = store.loadAccounts();
  const account = data.list.find((a) => a.id === id);
  if (!account) throw new Error('Аккаунт не найден');
  return { data, account };
}

async function skinProfile(id) {
  const { data, account } = findAccount(id);
  if (account.type === 'msa') {
    await freshMs(account, data);
    const profile = await fetchJson('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${account.accessToken}` } });
    const skin = (profile.skins || []).find((s) => s.state === 'ACTIVE') || (profile.skins || [])[0];
    account.skinUrl = skin ? skin.url : null;
    store.saveAccounts(data);
    const capes = (profile.capes || []).map((c) => ({ id: c.id, url: c.url, alias: c.alias || 'Плащ', active: c.state === 'ACTIVE' }));
    return { type: 'msa', name: account.name, skinUrl: account.skinUrl, variant: skin ? (skin.variant || 'CLASSIC').toLowerCase() : 'classic', capes };
  }
  if (account.type === 'ely') {
    return { type: 'ely', name: account.name, skinUrl: `${account.skinUrl}?t=${Date.now()}`, variant: 'classic' };
  }
  return { type: 'offline', name: account.name, skinUrl: null, variant: 'classic' };
}

async function setSkin(id, file, variant) {
  const { data, account } = findAccount(id);
  if (account.type !== 'msa') throw new Error('Загрузка скина в лаунчере доступна для аккаунтов Microsoft');
  const { w, h } = pngSize(file);
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(`Размер скина должен быть 64×64 (у файла ${w}×${h})`);
  await freshMs(account, data);
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'image/png' }), 'skin.png');
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'User-Agent': 'OnyxLauncher/0.2.0' },
    body: form,
  });
  if (!res.ok) throw new Error(res.status === 400 ? 'Mojang отклонил этот скин' : `Mojang вернул ошибку ${res.status}`);
  return skinProfile(id);
}

// Включает плащ по идентификатору или прячет его (capeId = null).
async function setCape(id, capeId) {
  const { data, account } = findAccount(id);
  if (account.type !== 'msa') throw new Error('Плащи доступны только для аккаунтов Microsoft');
  await freshMs(account, data);
  const headers = { Authorization: `Bearer ${account.accessToken}`, 'User-Agent': 'OnyxLauncher/0.3.6' };
  const res = capeId
    ? await fetch('https://api.minecraftservices.com/minecraft/profile/capes/active', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId }) })
    : await fetch('https://api.minecraftservices.com/minecraft/profile/capes/active', { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Mojang вернул ошибку ${res.status}`);
  return skinProfile(id);
}

async function resetSkin(id) {
  const { data, account } = findAccount(id);
  if (account.type !== 'msa') throw new Error('Доступно только для аккаунтов Microsoft');
  await freshMs(account, data);
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins/active', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'User-Agent': 'OnyxLauncher/0.2.0' },
  });
  if (!res.ok) throw new Error(`Mojang вернул ошибку ${res.status}`);
  return skinProfile(id);
}

function listAccounts() {
  const data = store.loadAccounts();
  return { selected: data.selected, list: data.list.map(store.publicAccount) };
}

function selectAccount(id) {
  const data = store.loadAccounts();
  if (data.list.some((a) => a.id === id)) data.selected = id;
  store.saveAccounts(data);
  return listAccounts();
}

function removeAccount(id) {
  const data = store.loadAccounts();
  data.list = data.list.filter((a) => a.id !== id);
  if (data.selected === id) data.selected = data.list[0] ? data.list[0].id : null;
  store.saveAccounts(data);
  return listAccounts();
}

module.exports = { loginEly, skinProfile, setSkin, setCape, resetSkin, loginMicrosoft, addOffline, getLaunchAccount, listAccounts, selectAccount, removeAccount, offlineUuid };
