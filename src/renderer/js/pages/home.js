import { state, currentAccount } from '../state.js';
import { icon } from '../icons.js';
import { esc, instIcon, avatar, LOADERS, $, $$, formatDuration, timeAgo, toast } from '../ui.js';
import { instanceCard, newInstanceCard, bindCards } from './library.js';
import { openCreateInstance } from '../modals.js';
import { navigate } from '../router.js';
import { updateLive, togglePlay } from '../actions.js';

let marqueeCache = null;

// Самурайские изречения; часть про Майнкрафт. Без ссылок на авторов: это вольные афоризмы в духе бусидо.
const QUOTES = [
  ['Путь воина начинается с первого шага, а путь строителя с первого блока.', 'Путь самурая'],
  ['Клинок точат годами, а дом строят за ночь, но защищать их нужно одинаково.', 'Бусидо'],
  ['Не бойся ночи: даже крипер взрывается лишь тогда, когда ты стоишь рядом.', 'Путь шахтёра'],
  ['Мастер не говорит «получилось», пока не проверил крышу от мобов.', 'Путь строителя'],
  ['Кто копает вниз без факелов, тот учится у темноты.', 'Путь шахтёра'],
  ['Победа любит терпеливых: алмазы лежат на глубине, а не на поверхности.', 'Путь шахтёра'],
  ['Самурай всегда держит меч под рукой, а шахтёр ведро воды.', 'Путь выживания'],
  ['Сто ударов киркой лучше одной мечты о дворце.', 'Путь строителя'],
  ['Спокойный ум видит дорогу даже в Нижнем мире.', 'Бусидо'],
  ['Сначала дом, потом слава. Ночь наступит раньше, чем ты думаешь.', 'Путь выживания'],
  ['Честь важнее добычи, а сундук важнее инвентаря.', 'Бусидо'],
  ['Слабый ищет короткий путь, сильный копает прямо.', 'Путь шахтёра'],
  ['Не торопись в Энд: дракон подождёт, а вот оборудование нет.', 'Путь воина'],
  ['Каждый мод это ещё один инструмент. Мастер выбирает, а не собирает всё подряд.', 'Путь сборщика'],
  ['Сакура цветёт недолго, поэтому делай скриншоты.', 'Путь художника'],
  ['Упавший в лаву учится быстрее, но дороже.', 'Путь шахтёра'],
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

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
  const insts = [...state.instances].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  const last = insts[0];
  const totalPlay = state.instances.reduce((s, i) => s + (i.playTime || 0), 0);
  const quote = rand(QUOTES);

  const head = `<div class="hero-head">
      <span data-hero-avatar>${avatar(acc, 'xl')}</span>
      <div><div class="eyebrow">${greeting()}${acc ? `, ${esc(acc.name)}` : ''}</div>
      <h1>${last ? (last.lastPlayed ? 'Продолжим с того же места?' : 'Готово к первому запуску') : 'Добро пожаловать в Оникс'}</h1></div>
    </div>`;
  const hero = last
    ? `<div>${head}
        <div class="hero-instance">
          ${instIcon(last)}
          <div style="min-width:0">
            <h2 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(last.name)}</h2>
            <div class="muted" style="font-size:13px">${(LOADERS[last.loader] || LOADERS.vanilla).label} ${esc(last.version)} · всего сыграно ${formatDuration(totalPlay)}</div>
          </div>
          <span data-live-play="${esc(last.id)}" data-variant="big" style="margin-left:12px"></span>
          <button class="btn ghost" data-goto="${esc(last.id)}">Открыть${icon('chevronRight')}</button>
        </div>
        <div data-live-progress="${esc(last.id)}" style="max-width:520px"></div>
      </div>${heroArt()}`
    : `<div>${head}
        <blockquote class="quote" data-quote><p>${esc(quote[0])}</p><cite>${esc(quote[1])}</cite></blockquote>
        <button class="btn primary" data-new style="height:44px;padding:0 20px;margin-top:6px">${icon('plus')}Создать первую сборку</button>
      </div>${heroArt()}`;

  const rows = recentRows(insts);
  view.innerHTML = `<div class="view-inner">
    <section class="hero">${hero}</section>

    ${
      rows.length
        ? `<section class="section"><div class="section-head"><h2>Последние сервера и сборки</h2></div>
            <div class="recent-list" data-recent>${rows.map(recentRow).join('')}</div></section>`
        : ''
    }

    <section class="section">
      <div class="section-head"><h2>Сборки</h2><a data-nav="/library">Все сборки${icon('chevronRight')}</a></div>
      <div class="grid">${[...state.instances].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).slice(0, 7).map(instanceCard).join('')}${newInstanceCard()}</div>
    </section>

    <section class="section" data-marquee-section hidden>
      <div class="section-head"><h2>Найдите что-нибудь новое</h2><a data-nav="/browse">Открыть каталог${icon('chevronRight')}</a></div>
      <div class="marquee" data-marquee></div>
    </section>
  </div>`;

  bindCards(view);
  $$('[data-nav]', view).forEach((a) => a.addEventListener('click', () => navigate(a.dataset.nav)));
  $$('[data-goto]', view).forEach((a) => a.addEventListener('click', () => navigate(`/instance/${a.dataset.goto}`)));
  updateLive();
  wireRecent(view, rows);
  loadAvatar(view, acc);
  loadMarquee(view);
  if (!last) rotateQuotes(view);
}

// Голова скина: берём актуальную ссылку на скин через профиль аккаунта.
async function loadAvatar(view, acc) {
  if (!acc) return;
  try {
    const p = await window.api.skins.profile(acc.id);
    const box = $('[data-hero-avatar]', view);
    if (box && p && p.skinUrl) box.innerHTML = avatar({ ...acc, skinUrl: p.skinUrl }, 'xl');
  } catch {
    /* остаётся буква */
  }
}

function rotateQuotes(view) {
  const el = $('[data-quote]', view);
  if (!el || state.settings.lowPower) return;
  let n = QUOTES.findIndex((q) => el.textContent.includes(q[0]));
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    n = (n + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length;
    el.classList.add('fade');
    setTimeout(() => {
      el.innerHTML = `<p>${esc(QUOTES[n][0])}</p><cite>${esc(QUOTES[n][1])}</cite>`;
      el.classList.remove('fade');
    }, 350);
  }, 12000);
}

// ---------- Последние сервера и сборки ----------
function recentRows(insts) {
  const rows = [];
  for (const inst of insts) {
    const hist = (inst.recent || []).slice(0, 2);
    for (const r of hist) rows.push({ inst, at: r.at, kind: r.type, key: r.key, label: r.label });
    if (!hist.length && inst.lastPlayed) rows.push({ inst, at: inst.lastPlayed, kind: 'instance' });
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, 5);
}

function recentRow(r, i) {
  const loader = LOADERS[r.inst.loader] || LOADERS.vanilla;
  const running = state.running.has(r.inst.id);
  const lead = r.kind === 'server' ? `<div class="project-icon">${icon('server')}</div>` : r.kind === 'world' ? `<div class="project-icon">${icon('globe')}</div>` : instIcon(r.inst);
  const status =
    r.kind === 'server'
      ? `<span class="rstat" data-ping="${esc(r.key)}"><span class="spin"></span>Загрузка…</span>`
      : r.kind === 'world'
        ? `<span class="rstat">${icon('globe')}Одиночная игра</span>`
        : `<span class="rstat">${esc(loader.label)} ${esc(r.inst.version)}</span>`;
  return `<div class="recent-row" data-ri="${i}">
    <div class="lead">${lead}</div>
    <div class="rtitle"><b>${esc(r.kind === 'instance' ? r.inst.name : r.label)}</b>
      <span>${r.kind === 'instance' ? '' : `<span class="mini">${instIcon(r.inst, '', true)}</span>${esc(r.inst.name)} · `}${esc(timeAgo(r.at))}</span></div>
    ${status}
    <button class="btn play sm" data-rplay="${i}">${icon(running ? 'stop' : 'play')}${running ? 'Остановить' : 'Играть'}</button>
    <div class="rmenu"><button class="btn ghost icon-only sm" data-rmenu="${i}" aria-label="Действия" aria-haspopup="menu">${icon('more')}</button></div>
  </div>`;
}

function wireRecent(view, rows) {
  $$('[data-rplay]', view).forEach((b) =>
    b.addEventListener('click', () => {
      const r = rows[Number(b.dataset.rplay)];
      const qp = r.kind === 'server' ? { type: 'server', address: r.key, label: r.label } : r.kind === 'world' ? { type: 'world', name: r.key, label: r.label } : null;
      togglePlay(r.inst.id, qp);
    })
  );
  $$('[data-rmenu]', view).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = rows[Number(b.dataset.rmenu)];
      $$('.pop-menu', view).forEach((m) => m.remove());
      const m = document.createElement('div');
      m.className = 'pop-menu';
      m.setAttribute('role', 'menu');
      m.innerHTML = `<button role="menuitem" data-m="open">${icon('box')}Открыть сборку</button><button role="menuitem" data-m="folder">${icon('folder')}Открыть папку</button>${r.kind !== 'instance' ? `<button role="menuitem" data-m="drop">${icon('x')}Убрать из списка</button>` : ''}`;
      b.parentElement.appendChild(m);
      const close = () => { m.remove(); document.removeEventListener('click', close); };
      setTimeout(() => document.addEventListener('click', close), 0);
      m.addEventListener('click', async (ev) => {
        const act = ev.target.closest('[data-m]');
        if (!act) return;
        if (act.dataset.m === 'open') navigate(`/instance/${r.inst.id}`);
        else if (act.dataset.m === 'folder') window.api.instances.openFolder(r.inst.id);
        else {
          const recent = (r.inst.recent || []).filter((x) => !(x.type === r.kind && x.key === r.key));
          await window.api.instances.update(r.inst.id, { recent });
          const { loadInstances } = await import('../state.js');
          await loadInstances();
        }
      });
    })
  );
  // Пинг серверов по очереди, чтобы не создавать лишней нагрузки.
  (async () => {
    for (const el of $$('[data-ping]', view)) {
      if (!view.isConnected) return;
      try {
        const p = await window.api.instances.ping(el.dataset.ping);
        if (!el.isConnected) continue;
        el.innerHTML = p && p.ok ? `<span class="dot ok"></span>${p.online != null ? `${p.online} онлайн` : 'В сети'} · ${p.latency} мс` : '<span class="dot off"></span>Не отвечает';
      } catch {
        if (el.isConnected) el.innerHTML = '<span class="dot off"></span>Не отвечает';
      }
    }
  })();
}

// ---------- Бегущая строка ----------
async function loadMarquee(view) {
  const box = $('[data-marquee]', view);
  const section = $('[data-marquee-section]', view);
  try {
    if (!marqueeCache) {
      const kinds = ['mod', 'mod', 'shader', 'resourcepack'];
      const lists = await Promise.all(
        kinds.map((type) => window.api.modrinth.search({ type, sort: 'downloads', limit: 12, offset: Math.floor(Math.random() * (type === 'mod' ? 400 : 120)) }).then((r) => r.hits.map((h) => ({ ...h, kind: type }))))
      );
      marqueeCache = shuffle(lists.flat().filter((h) => h.icon_url));
    }
    if (!box.isConnected || marqueeCache.length < 6) return;
    const half = Math.ceil(marqueeCache.length / 2);
    const rows = [marqueeCache.slice(0, half), marqueeCache.slice(half)];
    const KIND = { mod: 'Мод', shader: 'Шейдер', resourcepack: 'Ресурспак' };
    const card = (p) => `<button class="mq-card" data-pid="${esc(p.project_id)}" tabindex="-1"><img src="${esc(p.icon_url)}" alt="" loading="lazy" decoding="async" /><span><b>${esc(p.title)}</b><small>${esc(KIND[p.kind])} · ${esc(p.description)}</small></span></button>`;
    box.innerHTML = rows.map((r, i) => `<div class="mq-row ${i ? 'rev' : ''}"><div class="mq-track" style="--mq-time:${Math.max(40, r.length * 6)}s">${r.map(card).join('')}${r.map(card).join('')}</div></div>`).join('');
    section.hidden = false;
    box.addEventListener('click', (e) => {
      const c = e.target.closest('[data-pid]');
      if (c) navigate(`/project/modrinth/${encodeURIComponent(c.dataset.pid)}`);
    });
  } catch {
    /* без сети строки просто нет */
  }
}
