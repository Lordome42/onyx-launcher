import { state, currentAccount } from '../state.js';
import { icon } from '../icons.js';
import { esc, instIcon, formatNumber, LOADERS, $, $$, formatDuration } from '../ui.js';
import { instanceCard, newInstanceCard, bindCards } from './library.js';
import { openCreateInstance } from '../modals.js';
import { navigate } from '../router.js';
import { updateLive } from '../actions.js';

let featuredCache = null;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function heroArt() {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'skulk') {
    // Датчик скалка: светящиеся щупальца.
    const stalks = [[40, 150, 22], [75, 150, 14], [105, 150, 8], [135, 150, 16], [170, 150, 24]]
      .map(([x, y, bend], i) => `<path d="M${x} ${y} C${x - bend} ${y - 45} ${x + bend} ${y - 80} ${x + (i % 2 ? 6 : -6)} ${y - 105 - i * 4}" stroke="var(--accent)" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="${x + (i % 2 ? 6 : -6)}" cy="${y - 105 - i * 4}" r="7" fill="var(--accent-2)"/>`)
      .join('');
    return `<svg class="hero-art" viewBox="0 0 210 160" aria-hidden="true"><defs><radialGradient id="sk"><stop offset="0" stop-color="var(--accent)" stop-opacity=".55"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs>
      <circle cx="105" cy="80" r="78" fill="url(#sk)"/>${stalks}<ellipse cx="105" cy="152" rx="90" ry="8" fill="var(--accent)" opacity=".25"/></svg>`;
  }
  if (theme === 'lush') {
    // Светящиеся ягоды на лозах.
    const vine = (x, len, n) => `<path d="M${x} 0 C${x - 8} ${len / 3} ${x + 8} ${len / 1.6} ${x} ${len}" stroke="#4f9a3a" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      Array.from({ length: n }, (_, i) => `<circle cx="${x + (i % 2 ? 9 : -9)}" cy="${len - 8 - i * 20}" r="8" fill="var(--accent)"/><circle cx="${x + (i % 2 ? 7 : -11)}" cy="${len - 11 - i * 20}" r="2.5" fill="#fff" opacity=".7"/>`).join('');
    return `<svg class="hero-art" viewBox="0 0 210 160" aria-hidden="true">${vine(35, 120, 4)}${vine(80, 150, 5)}${vine(130, 100, 3)}${vine(175, 135, 4)}</svg>`;
  }
  if (theme === 'cherry') {
    // Цветок вишни.
    const petals = [0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r} 105 80)" d="M105 80 C85 60 88 22 105 14 C122 22 125 60 105 80Z" fill="var(--accent)" opacity=".92"/><path transform="rotate(${r} 105 80)" d="M105 80 L105 40" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>`).join('');
    const small = [[28, 36, 0.35], [180, 122, 0.3], [170, 30, 0.22], [36, 128, 0.25]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})">${[0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r})" d="M0 0 C-20 -20 -17 -58 0 -66 C17 -58 20 -20 0 0Z" fill="var(--accent-2)" opacity=".75"/>`).join('')}</g>`).join('');
    return `<svg class="hero-art" viewBox="0 0 210 160" aria-hidden="true">${small}${petals}<circle cx="105" cy="80" r="9" fill="#ffd36b"/></svg>`;
  }
  // Ворота тории на фоне красного солнца.
  return `<svg class="hero-art" viewBox="0 0 210 160" aria-hidden="true">
    <circle cx="105" cy="76" r="60" fill="var(--accent)"/>
    <g fill="var(--torii)">
      <path d="M4 38 C60 50 150 50 206 38 L199 56 C150 63 60 63 11 56 Z"/>
      <rect x="26" y="72" width="158" height="9" rx="2"/>
      <rect x="50" y="58" width="14" height="100" rx="2"/>
      <rect x="146" y="58" width="14" height="100" rx="2"/>
      <rect x="96" y="62" width="18" height="10"/>
    </g>
  </svg>`;
}

export function renderHome(view) {
  const acc = currentAccount();
  const last = [...state.instances].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];
  const totalPlay = state.instances.reduce((s, i) => s + (i.playTime || 0), 0);

  const hero = last
    ? `<div>
        <div class="eyebrow">${greeting()}${acc ? `, ${esc(acc.name)}` : ''}</div>
        <h1>${last.lastPlayed ? 'Продолжим с того же места?' : 'Готово к первому запуску'}</h1>
        <div class="hero-instance">
          ${instIcon(last)}
          <div style="min-width:0">
            <h2 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(last.name)}</h2>
            <div class="muted" style="font-size:13px">${(LOADERS[last.loader] || LOADERS.vanilla).label} ${esc(last.version)} · сыграно ${formatDuration(last.playTime)}</div>
          </div>
          <span data-live-play="${esc(last.id)}" data-variant="big" style="margin-left:12px"></span>
          <button class="btn ghost" data-goto="${esc(last.id)}">Открыть${icon('chevronRight')}</button>
        </div>
        <div data-live-progress="${esc(last.id)}" style="max-width:520px"></div>
      </div>${heroArt()}`
    : `<div>
        <div class="eyebrow">${greeting()}${acc ? `, ${esc(acc.name)}` : ''}</div>
        <h1>Добро пожаловать в Оникс</h1>
        <p class="muted" style="max-width:460px;margin:8px 0 20px">Создайте сборку, выберите версию и загрузчик, а моды можно поставить в пару кликов из каталога Modrinth.</p>
        <button class="btn primary" data-new style="height:44px;padding:0 20px">${icon('plus')}Создать первую сборку</button>
      </div>${heroArt()}`;

  view.innerHTML = `<div class="view-inner">
    <section class="hero">${hero}</section>

    ${
      state.instances.length
        ? `<div class="stat-row section" style="margin-top:20px">
            <div class="stat"><div class="k">Сборок</div><div class="v">${state.instances.length}</div></div>
            <div class="stat"><div class="k">Всего в игре</div><div class="v">${formatDuration(totalPlay)}</div></div>
            <div class="stat"><div class="k">Аккаунт</div><div class="v" style="font-size:16px;margin-top:8px">${acc ? `${esc(acc.name)} <span class="chip ${acc.type === 'msa' ? 'success' : ''}" style="margin-left:6px">${acc.type === 'msa' ? 'Лицензия' : 'Офлайн'}</span>` : '<span class="faint">не выбран</span>'}</div></div>
          </div>`
        : ''
    }

    <section class="section">
      <div class="section-head"><h2>Ваши сборки</h2><a data-nav="/library">Все сборки${icon('chevronRight')}</a></div>
      <div class="grid">${[...state.instances].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).slice(0, 7).map(instanceCard).join('')}${newInstanceCard()}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Популярные моды</h2><a data-nav="/browse">Открыть каталог${icon('chevronRight')}</a></div>
      <div class="featured" data-featured>${Array.from({ length: 6 }, () => '<div class="skeleton" style="height:82px"></div>').join('')}</div>
    </section>
  </div>`;

  bindCards(view);
  $$('[data-nav]', view).forEach((a) => a.addEventListener('click', () => navigate(a.dataset.nav)));
  $$('[data-goto]', view).forEach((a) => a.addEventListener('click', () => navigate(`/instance/${a.dataset.goto}`)));
  updateLive();
  loadFeatured(view);
}

async function loadFeatured(view) {
  const box = $('[data-featured]', view);
  try {
    featuredCache ||= (await window.api.modrinth.search({ type: 'mod', sort: 'downloads', limit: 9 })).hits;
    if (!box.isConnected) return;
    box.innerHTML = featuredCache
      .map(
        (p) => `<div class="featured-card" data-browse="${esc(p.title)}" tabindex="0">
          ${p.icon_url ? `<img class="project-icon" src="${esc(p.icon_url)}" alt="" loading="lazy" />` : `<div class="project-icon">${icon('puzzle')}</div>`}
          <div style="min-width:0"><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p>
          <div class="faint" style="font-size:12px;margin-top:6px;display:flex;align-items:center;gap:5px">${icon('download', '')} ${formatNumber(p.downloads)}</div></div>
        </div>`
      )
      .join('');
    $$('[data-browse]', box).forEach((el) => el.addEventListener('click', () => navigate(`/browse?q=${encodeURIComponent(el.dataset.browse)}`)));
  } catch {
    box.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:28px"><h3>Каталог сейчас недоступен</h3><p>Проверьте подключение к интернету — популярные моды появятся здесь.</p></div>`;
  }
}
