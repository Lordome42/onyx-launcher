// Discord Rich Presence по локальному IPC Discord (без внешних зависимостей).
// Нужен ID приложения Discord (discord.com/developers). Если он не задан, статус не отправляется.
const net = require('net');
const path = require('path');
const store = require('./store');

const DEFAULT_CLIENT_ID = ''; // сюда можно вписать ID приложения «Оникс», тогда поле в настройках не понадобится

let sock = null;
let ready = false;
let buf = Buffer.alloc(0);
let retry = null;
let current = null; // последний желаемый статус
let clientId = '';
let nonce = 0;

function pipePaths() {
  if (process.platform === 'win32') return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  const dirs = [base, path.join(base, 'snap.discord'), path.join(base, 'app', 'com.discordapp.Discord')];
  return dirs.flatMap((d) => Array.from({ length: 10 }, (_, i) => path.join(d, `discord-ipc-${i}`)));
}

function frame(op, data) {
  const json = Buffer.from(JSON.stringify(data));
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

function enabled() {
  const s = store.getSettings();
  return s.discordRpc !== false && !!(s.discordClientId || DEFAULT_CLIENT_ID);
}

function tryPaths(list, done) {
  const next = (i) => {
    if (i >= list.length) return done(null);
    const s = net.createConnection(list[i]);
    let ok = false;
    s.once('connect', () => {
      ok = true;
      done(s);
    });
    s.once('error', () => {
      if (!ok) next(i + 1);
    });
  };
  next(0);
}

function send() {
  if (!sock || !ready) return;
  const activity = current
    ? {
        details: current.details,
        state: current.state,
        timestamps: current.start ? { start: Math.floor(current.start / 1000) } : undefined,
        assets: { large_image: 'onyx', large_text: 'Оникс' },
      }
    : null;
  sock.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(++nonce) }));
}

function connect() {
  if (sock || !enabled()) return;
  clientId = String(store.getSettings().discordClientId || DEFAULT_CLIENT_ID).trim();
  tryPaths(pipePaths(), (s) => {
    if (!s) {
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, 30000);
      if (retry.unref) retry.unref();
      return;
    }
    sock = s;
    buf = Buffer.alloc(0);
    s.write(frame(0, { v: 1, client_id: clientId }));
    s.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = {};
        try {
          msg = JSON.parse(buf.subarray(8, 8 + len).toString());
        } catch {
          /* битый пакет */
        }
        buf = buf.subarray(8 + len);
        if (msg.evt === 'READY') {
          ready = true;
          send();
        }
      }
    });
    const drop = () => {
      sock = null;
      ready = false;
      if (enabled() && !retry) {
        retry = setTimeout(() => {
          retry = null;
          connect();
        }, 30000);
        if (retry.unref) retry.unref();
      }
    };
    s.on('close', drop);
    s.on('error', drop);
  });
}

// status: { details, state, start } или null для очистки.
function setStatus(status) {
  current = status;
  if (!enabled()) return;
  if (!sock) connect();
  else send();
}

function idle() {
  setStatus({ details: 'В лаунчере', state: 'Выбирает сборку' });
}

function playing(inst) {
  const loader = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge', vanilla: 'Vanilla' }[inst.loader] || 'Vanilla';
  setStatus({ details: `Играет: ${inst.name}`.slice(0, 120), state: `${loader} ${inst.version}`, start: Date.now() });
}

// Вызывается после смены настроек: включает, выключает или переподключает.
function refresh() {
  if (!enabled()) {
    if (sock) {
      try {
        current = null;
        send();
        sock.destroy();
      } catch {
        /* уже закрыт */
      }
    }
    sock = null;
    ready = false;
    return;
  }
  const id = String(store.getSettings().discordClientId || DEFAULT_CLIENT_ID).trim();
  if (sock && id !== clientId) {
    sock.destroy();
    sock = null;
    ready = false;
  }
  if (!current) current = { details: 'В лаунчере', state: 'Выбирает сборку' };
  if (!sock) connect();
  else send();
}

function shutdown() {
  if (retry) clearTimeout(retry);
  if (sock) {
    current = null;
    send();
    sock.destroy();
  }
  sock = null;
}

module.exports = { idle, playing, refresh, shutdown, enabled };
