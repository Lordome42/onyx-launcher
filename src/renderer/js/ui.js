// Общие помощники интерфейса.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const LOADERS = {
  vanilla: { label: 'Vanilla', color: '#9aa3b5' },
  fabric: { label: 'Fabric', color: '#dbb68a' },
  quilt: { label: 'Quilt', color: '#c48bf0' },
  forge: { label: 'Forge', color: '#6aa0e8' },
  neoforge: { label: 'NeoForge', color: '#f0a05a' },
};

// Изометрический блок — значок сборки, окрашенный в выбранный оттенок.
// Значок сборки: своя картинка, если задана, иначе изометрический блок.
export function instIcon(inst, cls = '', bare = false) {
  return cube(inst.hue, cls, bare, inst.iconData || inst.iconUrl || '');
}

export function cube(hue = 260, cls = '', bare = false, img = '') {
  if (img) {
    return `<svg class="cube ${cls}" viewBox="0 0 64 64" aria-hidden="true"${bare ? ' style="border-radius:14px"' : ''}><image href="${esc(img)}" width="64" height="64" preserveAspectRatio="xMidYMid slice"/></svg>`;
  }
  const h = Math.round(hue);
  const id = `c${h}${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="cube ${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${h} 55% 26%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 60% 14%)"/>
      </linearGradient>
    </defs>
    ${bare ? '' : `<rect width="64" height="64" fill="url(#${id}b)"/><circle cx="14" cy="12" r="22" fill="hsl(${h} 80% 60%)" opacity=".18"/>`}
    <polygon points="32,13 50,23 32,33 14,23" fill="hsl(${h} 75% 66%)"/>
    <polygon points="14,23 32,33 32,53 14,43" fill="hsl(${h} 60% 46%)"/>
    <polygon points="50,23 32,33 32,53 50,43" fill="hsl(${h} 58% 34%)"/>
    <polygon points="32,13 41,18 32,23 23,18" fill="#fff" opacity=".18"/>
    <polygon points="14,33 23,38 23,48 14,43" fill="#000" opacity=".12"/>
    <polygon points="41,38 50,33 50,43 41,48" fill="#fff" opacity=".07"/>
  </svg>`;
}

export function coverStyle(hue = 260) {
  return `background: radial-gradient(120% 120% at 20% 0%, hsl(${hue} 70% 45% / .55), transparent 60%), linear-gradient(135deg, hsl(${hue} 45% 22%), hsl(${(hue + 50) % 360} 50% 12%));`;
}

export function avatar(account, size = '') {
  if (!account) return `<div class="avatar ${size}">${icon('user')}</div>`;
  if (account.skinUrl) {
    const url = esc(account.skinUrl);
    return `<div class="avatar ${size}"><div class="skin-face" style="background-image:url('${url}')"></div><div class="skin-hat" style="background-image:url('${url}')"></div></div>`;
  }
  const hue = [...account.name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  return `<div class="avatar ${size}" style="background: linear-gradient(135deg, hsl(${hue} 60% 50%), hsl(${(hue + 40) % 360} 60% 35%))">${esc(account.name[0].toUpperCase())}</div>`;
}

export const ACCOUNT_KIND = { msa: 'Лицензия Microsoft', ely: 'Ely.by · пиратский', offline: 'Офлайн · пиратский' };

export function msLogo() {
  return `<span class="ms-logo"><i style="background:#f25022"></i><i style="background:#7fba00"></i><i style="background:#00a4ef"></i><i style="background:#ffb900"></i></span>`;
}

export function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' млн';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + ' тыс.';
  return String(n);
}

export function formatDuration(ms) {
  const min = Math.floor((ms || 0) / 60000);
  if (min < 1) return 'меньше минуты';
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  return `${h} ч ${min % 60} мин`;
}

export function timeAgo(ts) {
  if (!ts) return 'ещё не запускалась';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString('ru-RU');
}

export function formatSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' МБ';
  return Math.max(1, Math.round(bytes / 1024)) + ' КБ';
}

// ---------- Тосты ----------
export function toast(title, text = '', kind = 'info') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const ic = kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info';
  el.innerHTML = `${icon(ic)}<div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 260);
  }, kind === 'error' ? 7000 : 4000);
}

// ---------- Модальные окна ----------
export function openModal(html, { onMount, onClose } = {}) {
  const prevFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  $$('[data-close]', overlay).forEach((b) => b.addEventListener('click', close));
  const modal = $('.modal', overlay);
  if (onMount) onMount(modal, close);
  const first = modal.querySelector('input, select, button.primary');
  if (first) first.focus();
  return close;
}

export function confirmDialog({ title, text, action = 'Удалить', danger = true }) {
  return new Promise((resolve) => {
    let result = false;
    openModal(
      `<div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
       <div class="modal-body"><p class="muted" style="margin:0">${esc(text)}</p></div>
       <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${esc(action)}</button></div>`,
      {
        onMount: (m, close) => {
          $('[data-ok]', m).addEventListener('click', () => {
            result = true;
            close();
          });
        },
        onClose: () => resolve(result),
      }
    );
  });
}

// Необязательное подтверждение: при включённой настройке «только опасные предупреждения» пропускается.
export async function confirmSoft(opts) {
  try {
    const { state } = await import('./state.js');
    if (state.settings && state.settings.onlyDangerConfirms) return true;
  } catch {
    /* спрашиваем как обычно */
  }
  return confirmDialog(opts);
}

// Окно с прогрессом для долгих операций: слушает события content:progress с нужным ключом.
export function progressModal(title, key) {
  let close = () => {};
  openModal(
    `<div class="modal-head"><h2>${esc(title)}</h2></div>
     <div class="modal-body"><div class="muted" data-stage>Подготовка…</div><div class="progress indeterminate" data-bar><i style="width:0"></i></div></div>`,
    { onMount: (m, c) => (close = c) }
  );
  const unsub = window.api.events.onContentProgress((p) => {
    if (p.key !== key) return;
    const stage = $('[data-stage]');
    const bar = $('[data-bar]');
    if (stage) stage.textContent = p.total ? `${p.stage}: ${p.done} из ${p.total}` : p.stage;
    if (bar) {
      bar.classList.toggle('indeterminate', !p.total);
      $('i', bar).style.width = p.total ? `${Math.round((p.done / p.total) * 100)}%` : '0';
    }
  });
  return () => {
    unsub();
    close();
  };
}
