// Чтение локальных данных без лишней нагрузки: иконки и названия из jar/zip, миры (level.dat), серверы (servers.dat), пинг серверов.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const net = require('net');
const dns = require('dns').promises;
const crypto = require('crypto');
const { nativeImage } = require('electron');
const AdmZip = require('adm-zip');
const { paths } = require('./store');

// ---------- Мини-читалка ZIP: читаем только нужные записи, а не весь архив ----------
function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, pos);
  return n === len ? buf : buf.subarray(0, n);
}

function zipEntries(fd, size) {
  const tailLen = Math.min(size, 65557);
  const tail = readAt(fd, size - tailLen, tailLen);
  let i = tail.length - 22;
  while (i >= 0 && tail.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) return null;
  const count = tail.readUInt16LE(i + 10);
  const cdSize = tail.readUInt32LE(i + 12);
  const cdOff = tail.readUInt32LE(i + 16);
  if (cdOff === 0xffffffff || cdSize > 32 * 1024 * 1024) return null; // zip64 не читаем
  const cd = readAt(fd, cdOff, cdSize);
  const map = new Map();
  let o = 0;
  for (let n = 0; n < count && o + 46 <= cd.length && cd.readUInt32LE(o) === 0x02014b50; n++) {
    const nameLen = cd.readUInt16LE(o + 28);
    const extraLen = cd.readUInt16LE(o + 30);
    const commentLen = cd.readUInt16LE(o + 32);
    map.set(cd.toString('utf8', o + 46, o + 46 + nameLen), {
      method: cd.readUInt16LE(o + 10),
      compSize: cd.readUInt32LE(o + 20),
      size: cd.readUInt32LE(o + 24),
      localOff: cd.readUInt32LE(o + 42),
    });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

function zipRead(fd, entry, limit = 4 * 1024 * 1024) {
  if (!entry || entry.size > limit) return null;
  const head = readAt(fd, entry.localOff, 30);
  const start = entry.localOff + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const raw = readAt(fd, start, entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  return null;
}

// ---------- NBT ----------
function parseNbt(buf) {
  let o = 0;
  const str = () => {
    const len = buf.readUInt16BE(o);
    o += 2;
    const s = buf.toString('utf8', o, o + len);
    o += len;
    return s;
  };
  const read = (t) => {
    switch (t) {
      case 1: return buf.readInt8(o++);
      case 2: { const v = buf.readInt16BE(o); o += 2; return v; }
      case 3: { const v = buf.readInt32BE(o); o += 4; return v; }
      case 4: { const v = Number(buf.readBigInt64BE(o)); o += 8; return v; }
      case 5: { const v = buf.readFloatBE(o); o += 4; return v; }
      case 6: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case 7: { const n = buf.readInt32BE(o); o += 4 + n; return null; }
      case 8: return str();
      case 9: {
        const it = buf.readInt8(o++);
        const n = buf.readInt32BE(o);
        o += 4;
        const arr = [];
        for (let i = 0; i < n; i++) arr.push(read(it));
        return arr;
      }
      case 10: {
        const obj = {};
        for (;;) {
          const tt = buf.readInt8(o++);
          if (tt === 0) break;
          const k = str();
          obj[k] = read(tt);
        }
        return obj;
      }
      case 11: { const n = buf.readInt32BE(o); o += 4 + n * 4; return null; }
      case 12: { const n = buf.readInt32BE(o); o += 4 + n * 8; return null; }
      default: throw new Error('Неизвестный тег NBT');
    }
  };
  const rootType = buf.readInt8(o++);
  str();
  return read(rootType);
}

// ---------- Иконки и метаданные модов/ресурспаков ----------
function thumb(buf) {
  try {
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    const side = Math.min(64, Math.max(width, height));
    const out = img.resize({ width: width >= height ? side : Math.round((side * width) / height), height: height > width ? side : Math.round((side * height) / width), quality: 'good' });
    return 'data:image/png;base64,' + out.toPNG().toString('base64');
  } catch {
    return null;
  }
}

function pickIcon(icon) {
  if (!icon) return null;
  if (typeof icon === 'string') return icon;
  const keys = Object.keys(icon).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const best = keys.find((k) => k >= 64) || keys[keys.length - 1];
  return icon[best];
}

function tomlValue(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'm'));
  return m ? m[1] ?? m[2] : null;
}

function extractInfo(file, type) {
  const info = { title: null, version: null, icon: null };
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const entries = zipEntries(fd, fs.fstatSync(fd).size);
    if (!entries) return info;
    const get = (name) => zipRead(fd, entries.get(name));
    let iconPath = null;
    if (type === 'mod') {
      const fabric = get('fabric.mod.json');
      const quilt = get('quilt.mod.json');
      const toml = get('META-INF/neoforge.mods.toml') || get('META-INF/mods.toml');
      const legacy = get('mcmod.info');
      if (fabric) {
        const j = JSON.parse(fabric.toString('utf8'));
        info.title = j.name || j.id;
        info.version = typeof j.version === 'string' ? j.version : null;
        iconPath = pickIcon(j.icon);
      } else if (quilt) {
        const j = JSON.parse(quilt.toString('utf8')).quilt_loader || {};
        info.title = (j.metadata && j.metadata.name) || j.id;
        info.version = j.version;
        iconPath = pickIcon(j.metadata && j.metadata.icon);
      } else if (toml) {
        const t = toml.toString('utf8');
        info.title = tomlValue(t, 'displayName');
        const v = tomlValue(t, 'version');
        info.version = v && !v.includes('${') ? v : null;
        iconPath = tomlValue(t, 'logoFile');
      } else if (legacy) {
        const j = JSON.parse(legacy.toString('utf8'));
        const m = (Array.isArray(j) ? j : j.modList || [])[0] || {};
        info.title = m.name;
        info.version = m.version;
        iconPath = m.logoFile;
      }
      if (iconPath) iconPath = iconPath.replace(/^\/+/, '');
      if (!iconPath || !entries.has(iconPath)) iconPath = entries.has('pack.png') ? 'pack.png' : null;
    } else {
      iconPath = entries.has('pack.png') ? 'pack.png' : null;
    }
    const buf = iconPath ? zipRead(fd, entries.get(iconPath), 6 * 1024 * 1024) : null;
    if (buf) info.icon = thumb(buf);
  } catch {
    /* повреждённый архив — просто без иконки */
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return info;
}

// ---------- Зависимости и совместимость мода (для проверки сборки) ----------
function arr(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}
function keysOf(o) {
  return o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : [];
}

function parseToml(text) {
  const out = { ids: [], depends: [], mc: null };
  const blocks = text.split(/^\s*\[\[/m).slice(1);
  for (const b of blocks) {
    const head = b.slice(0, b.indexOf(']]'));
    const val = (k) => tomlValue(b, k);
    if (head === 'mods') {
      const id = val('modId');
      if (id) out.ids.push(id);
    } else if (head.startsWith('dependencies')) {
      const id = val('modId');
      if (!id) continue;
      const mandatory = /mandatory\s*=\s*true/.test(b) || /type\s*=\s*["']required["']/.test(b);
      if (id === 'minecraft') out.mc = val('versionRange');
      else if (mandatory) out.depends.push(id);
    }
  }
  return out;
}

function readJarMeta(file) {
  const meta = { loader: null, id: null, ids: [], version: null, name: null, depends: [], breaks: [], mcRange: null };
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const entries = zipEntries(fd, fs.fstatSync(fd).size);
    if (!entries) return meta;
    const get = (n) => zipRead(fd, entries.get(n));
    const fabric = get('fabric.mod.json');
    const quilt = get('quilt.mod.json');
    const toml = get('META-INF/neoforge.mods.toml');
    const forge = get('META-INF/mods.toml');
    if (fabric) {
      const j = JSON.parse(fabric.toString('utf8'));
      meta.loader = 'fabric';
      meta.id = j.id;
      meta.name = j.name || j.id;
      meta.version = typeof j.version === 'string' ? j.version : null;
      meta.ids = [j.id, ...arr(j.provides).map((p) => (typeof p === 'string' ? p : p && p.id))];
      meta.depends = keysOf(j.depends).filter((k) => k !== 'minecraft');
      meta.mcRange = j.depends && j.depends.minecraft;
      meta.breaks = [...keysOf(j.breaks), ...keysOf(j.conflicts)];
      // вложенные jar (Fabric API и другие) тоже предоставляют моды
      for (const jar of arr(j.jars)) {
        const buf = jar && jar.file ? zipRead(fd, entries.get(jar.file), 12 * 1024 * 1024) : null;
        if (!buf) continue;
        try {
          const inner = new AdmZip(buf).getEntry('fabric.mod.json');
          if (inner) {
            const ij = JSON.parse(inner.getData().toString('utf8'));
            meta.ids.push(ij.id, ...arr(ij.provides).map((p) => (typeof p === 'string' ? p : p && p.id)));
          }
        } catch {
          /* вложенный jar не читается */
        }
      }
    } else if (quilt) {
      const q = JSON.parse(quilt.toString('utf8')).quilt_loader || {};
      meta.loader = 'quilt';
      meta.id = q.id;
      meta.name = (q.metadata && q.metadata.name) || q.id;
      meta.version = q.version;
      meta.ids = [q.id, ...arr(q.provides).map((p) => (typeof p === 'string' ? p : p && p.id))];
      const deps = arr(q.depends).map((d) => (typeof d === 'string' ? { id: d } : d)).filter((d) => d && d.id && !d.optional);
      meta.depends = deps.map((d) => d.id).filter((d) => d !== 'minecraft');
      const mc = deps.find((d) => d.id === 'minecraft');
      meta.mcRange = mc && (mc.versions || null);
      meta.breaks = arr(q.breaks).map((b) => (typeof b === 'string' ? b : b && b.id)).filter(Boolean);
    } else if (toml || forge) {
      const t = parseToml((toml || forge).toString('utf8'));
      meta.loader = toml ? 'neoforge' : 'forge';
      meta.ids = t.ids;
      meta.id = t.ids[0] || null;
      meta.name = tomlValue((toml || forge).toString('utf8'), 'displayName') || meta.id;
      meta.depends = t.depends.filter((d) => !['forge', 'neoforge', 'minecraft'].includes(d));
      meta.mcRange = t.mc;
    }
  } catch {
    /* повреждённый мод */
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  meta.ids = [...new Set(meta.ids.filter(Boolean))];
  return meta;
}

const memo = new Map();
async function archiveInfo(file, type) {
  const st = await fsp.stat(file);
  const key = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}|${type}`).digest('hex');
  if (memo.has(key)) return memo.get(key);
  const cacheFile = path.join(paths.icons, key + '.json');
  let info;
  try {
    info = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
  } catch {
    info = extractInfo(file, type);
    fsp.writeFile(cacheFile, JSON.stringify(info)).catch(() => {});
  }
  memo.set(key, info);
  return info;
}

// ---------- Миры ----------
async function listWorlds(gameDir) {
  const dir = path.join(gameDir, 'saves');
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const folder of names) {
    const world = path.join(dir, folder);
    try {
      const levelFile = path.join(world, 'level.dat');
      const st = await fsp.stat(levelFile);
      let data = {};
      try {
        data = (parseNbt(zlib.gunzipSync(await fsp.readFile(levelFile))) || {}).Data || {};
      } catch {
        /* не удалось прочитать level.dat */
      }
      let icon = null;
      try {
        icon = 'data:image/png;base64,' + (await fsp.readFile(path.join(world, 'icon.png'))).toString('base64');
      } catch {
        /* у мира нет иконки */
      }
      out.push({ folder, name: data.LevelName || folder, lastPlayed: data.LastPlayed || st.mtimeMs, gameType: data.GameType ?? null, hardcore: !!data.hardcore, icon });
    } catch {
      /* не мир */
    }
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

// ---------- Серверы ----------
async function readGameServers(gameDir) {
  try {
    const root = parseNbt(await fsp.readFile(path.join(gameDir, 'servers.dat')));
    return (root.servers || []).filter((s) => s && s.ip).map((s) => ({ name: s.name || s.ip, address: s.ip, fromGame: true }));
  } catch {
    return [];
  }
}

const varint = (n) => {
  const out = [];
  n >>>= 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
};
const mcString = (s) => Buffer.concat([varint(Buffer.byteLength(s)), Buffer.from(s)]);

function flattenMotd(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.replace(/§./g, '');
  return (d.text || '').replace(/§./g, '') + (d.extra || []).map(flattenMotd).join('');
}

async function resolveTarget(address) {
  let [host, port] = address.split(':');
  if (port) return { host, port: Number(port) || 25565 };
  try {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv[0]) return { host: srv[0].name, port: srv[0].port, original: host };
  } catch {
    /* SRV-записи нет */
  }
  return { host, port: 25565 };
}

async function pingServer(address, timeout = 4500) {
  const target = await resolveTarget(address);
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host: target.host, port: target.port });
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(res);
    };
    socket.setTimeout(timeout, () => finish({ ok: false }));
    socket.on('error', () => finish({ ok: false }));
    socket.on('connect', () => {
      const port = Buffer.alloc(2);
      port.writeUInt16BE(target.port);
      const hs = Buffer.concat([varint(0), varint(-1), mcString(target.original || target.host), port, varint(1)]);
      socket.write(Buffer.concat([varint(hs.length), hs, varint(1), varint(0)]));
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        let o = 0;
        const rv = () => {
          let r = 0;
          for (let s = 0; ; s += 7) {
            const b = buf[o++];
            if (b === undefined) throw new RangeError('wait');
            r |= (b & 0x7f) << s;
            if (!(b & 0x80)) return r;
          }
        };
        const len = rv();
        if (buf.length - o < len) return;
        rv(); // id пакета
        const jl = rv();
        if (buf.length - o < jl) return;
        const j = JSON.parse(buf.toString('utf8', o, o + jl));
        finish({
          ok: true,
          latency: Date.now() - started,
          motd: flattenMotd(j.description).trim(),
          online: j.players ? j.players.online : null,
          max: j.players ? j.players.max : null,
          version: j.version ? j.version.name : '',
          favicon: j.favicon || null,
        });
      } catch (e) {
        if (!(e instanceof RangeError)) finish({ ok: false });
      }
    });
  });
}

module.exports = { readJarMeta, archiveInfo, listWorlds, readGameServers, pingServer };
