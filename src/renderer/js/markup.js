// Безопасный показ описаний проектов: Markdown (Modrinth) и HTML (CurseForge) пропускаются через белый список тегов.
const ALLOWED = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'br', 'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'center', 'details', 'summary', 'sub', 'sup', 'kbd']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'svg', 'video', 'audio', 'noscript']);

const safeUrl = (u, protocols) => {
  try {
    const url = new URL(u, 'https://x.invalid');
    return protocols.includes(url.protocol) && url.hostname !== 'x.invalid' ? url.href : null;
  } catch {
    return null;
  }
};

function clean(node, out) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(document.createTextNode(child.textContent));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (!ALLOWED.has(tag)) {
        clean(child, out); // неизвестный тег: оставляем содержимое
        continue;
      }
      const el = document.createElement(tag);
      if (tag === 'a') {
        const href = safeUrl(child.getAttribute('href') || '', ['http:', 'https:']);
        if (href) el.setAttribute('data-href', href);
      } else if (tag === 'img') {
        const src = safeUrl(child.getAttribute('src') || '', ['https:']);
        if (!src) continue;
        el.setAttribute('src', src);
        el.setAttribute('alt', child.getAttribute('alt') || '');
        el.setAttribute('loading', 'lazy');
        el.setAttribute('decoding', 'async');
      } else if (tag === 'th' || tag === 'td') {
        /* без атрибутов */
      }
      clean(child, el);
      out.appendChild(el);
    }
  }
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const box = document.createElement('div');
  clean(doc.body, box);
  return box.innerHTML;
}

// Небольшой конвертер Markdown → HTML. Неэкранированный HTML внутри сохраняется и затем чистится.
export function markdownToHtml(md) {
  const blocks = [];
  let text = String(md || '').replace(/\r\n?/g, '\n');
  text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`);
    return `\n\u0000${blocks.length - 1}\u0000\n`;
  });
  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>`)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  for (const line of text.split('\n')) {
    let m;
    if (/^\u0000\d+\u0000$/.test(line.trim())) {
      flush();
      closeList();
      out.push(blocks[Number(line.trim().replace(/\u0000/g, ''))]);
    } else if (!line.trim()) {
      flush();
      closeList();
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flush();
      closeList();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      flush();
      closeList();
      out.push('<hr>');
    } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      flush();
      closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line))) {
      flush();
      const kind = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(m[2])}</li>`);
    } else if (/^\s*<\/?[a-zA-Z]/.test(line)) {
      flush();
      closeList();
      out.push(line); // строка с HTML-тегами
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flush();
  closeList();
  return out.join('\n');
}

export function renderBody(body, format) {
  return sanitizeHtml(format === 'markdown' ? markdownToHtml(body) : body);
}
