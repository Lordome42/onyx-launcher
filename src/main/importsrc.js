// Распознавание источника сборки по тексту: ссылка Modrinth, ссылка CurseForge, прямая ссылка на файл или путь к файлу.
const MR_HOSTS = /^(www\.)?modrinth\.com$/i;
const CF_HOSTS = /^(www\.|legacy\.|beta\.)?curseforge\.com$/i;

function parseSource(raw) {
  const text = String(raw || '').trim().replace(/^["']|["']$/g, '');
  if (!text) return null;

  // curseforge://install?addonId=123&fileId=456 (кнопка «Установить» на сайте)
  const proto = /^curseforge:\/\/install\?(.+)$/i.exec(text);
  if (proto) {
    const q = new URLSearchParams(proto[1]);
    const modId = Number(q.get('addonId'));
    if (modId) return { kind: 'curseforge', modId, fileId: Number(q.get('fileId')) || null };
  }

  let url = null;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : /^(www\.)?(modrinth|curseforge)\.com\//i.test(text) ? `https://${text}` : '');
  } catch {
    url = null;
  }
  if (!url) {
    // локальный путь к файлу
    if (/\.(mrpack|zip)$/i.test(text) && (/^[a-z]:[\\/]/i.test(text) || text.startsWith('/') || text.startsWith('\\\\'))) return { kind: 'file', path: text };
    return null;
  }
  if (url.protocol === 'file:') {
    try {
      return { kind: 'file', path: decodeURIComponent(url.pathname.replace(/^\/([a-z]:)/i, '$1')) };
    } catch {
      return null;
    }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (MR_HOSTS.test(url.hostname)) {
    // /modpack/<slug>[/version/<номер или id>], также /project/<slug>
    if (['modpack', 'project'].includes(parts[0]) && parts[1]) {
      const v = parts[2] === 'version' && parts[3] ? parts[3] : null;
      return { kind: 'modrinth', slug: parts[1], version: v };
    }
    return { kind: 'unsupported', why: 'Это ссылка не на сборку Modrinth. Нужна страница вида modrinth.com/modpack/название.' };
  }
  if (/^cdn\.modrinth\.com$/i.test(url.hostname) && /\.mrpack$/i.test(url.pathname)) return { kind: 'direct', url: url.href };

  if (CF_HOSTS.test(url.hostname)) {
    // /minecraft/modpacks/<slug>[/files/<id>]
    const i = parts.indexOf('modpacks');
    if (i >= 0 && parts[i + 1]) {
      const f = parts.indexOf('files');
      const fileId = f >= 0 && /^\d+$/.test(parts[f + 1] || '') ? Number(parts[f + 1]) : null;
      return { kind: 'curseforge', slug: parts[i + 1], fileId };
    }
    if (parts[0] === 'projects' && /^\d+$/.test(parts[1] || '')) return { kind: 'curseforge', modId: Number(parts[1]), fileId: null };
    return { kind: 'unsupported', why: 'Это ссылка не на сборку CurseForge. Нужна страница вида curseforge.com/minecraft/modpacks/название.' };
  }

  if (url.protocol === 'https:' && /\.(mrpack|zip)$/i.test(url.pathname)) return { kind: 'direct', url: url.href };
  return null;
}

module.exports = { parseSource };
