import { state } from '../state.js';
import { icon } from '../icons.js';
import { esc, instIcon, formatDuration, $, $$ } from '../ui.js';
import { navigate } from '../router.js';

const WEEKS = 8;
const DAY = 86400e3;

// Начало недели (понедельник, 00:00 по местному времени).
function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function computeStats(instances, now = Date.now()) {
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: thisWeek - (WEEKS - 1 - i) * 7 * DAY, ms: 0 }));
  let sessions = 0;
  let longest = 0;
  let tracked = 0;
  for (const inst of instances) {
    for (const [at, ms] of inst.sessions || []) {
      sessions++;
      tracked += ms;
      longest = Math.max(longest, ms);
      const w = weeks.find((x) => at >= x.start && at < x.start + 7 * DAY);
      if (w) w.ms += ms;
    }
  }
  const total = instances.reduce((s, i) => s + (i.playTime || 0), 0);
  const favorites = [...instances].filter((i) => i.playTime).sort((a, b) => b.playTime - a.playTime).slice(0, 6);
  return { weeks, sessions, longest, avg: sessions ? tracked / sessions : 0, total, favorites };
}

const fmtHours = (ms) => (ms >= 3600e3 ? `${(ms / 3600e3).toFixed(1).replace('.0', '')} ч` : `${Math.round(ms / 60000)} мин`);

export function renderStats(view) {
  const st = computeStats(state.instances);
  const maxWeek = Math.max(1, ...st.weeks.map((w) => w.ms));
  const maxFav = Math.max(1, ...st.favorites.map((i) => i.playTime));
  const label = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const empty = !st.total;

  view.innerHTML = `<div class="view-inner">
    <div class="section-head" style="margin-bottom:20px"><div><h1>Статистика</h1><div class="muted" style="margin-top:4px">Сколько и во что вы играли</div></div></div>
    ${
      empty
        ? `<div class="empty"><div class="icon-wrap">${icon('clock')}</div><h3>Пока нечего показывать</h3><p>Запустите любую сборку: время игры начнёт считаться, и здесь появятся недели и любимые сборки.</p></div>`
        : `<div class="stat-cards">
            <div class="stat-card"><span>Всего сыграно</span><b>${formatDuration(st.total)}</b></div>
            <div class="stat-card"><span>На этой неделе</span><b>${fmtHours(st.weeks[WEEKS - 1].ms)}</b></div>
            <div class="stat-card"><span>Запусков с учётом времени</span><b>${st.sessions}</b></div>
            <div class="stat-card"><span>Средняя сессия</span><b>${st.sessions ? fmtHours(st.avg) : '—'}</b></div>
            <div class="stat-card"><span>Самая долгая</span><b>${st.sessions ? fmtHours(st.longest) : '—'}</b></div>
          </div>
          <section class="section"><div class="section-head"><h2>Время игры по неделям</h2></div>
            <div class="week-chart" role="img" aria-label="Время игры за последние ${WEEKS} недель">
              ${st.weeks
                .map(
                  (w, i) => `<div class="wk ${i === WEEKS - 1 ? 'now' : ''}"><span class="val">${w.ms ? fmtHours(w.ms) : ''}</span>
                    <div class="bar"><i style="height:${Math.max(w.ms ? 4 : 0, (w.ms / maxWeek) * 100)}%"></i></div><span class="lbl">${esc(label(w.start))}</span></div>`
                )
                .join('')}
            </div>
            ${st.sessions ? '' : '<p class="faint" style="margin-top:10px">Понедельная статистика собирается с версии 0.3.6: старое время учтено только в общих числах.</p>'}
          </section>
          <section class="section"><div class="section-head"><h2>Любимые сборки</h2></div>
            <div class="fav-list">
              ${st.favorites
                .map(
                  (i, n) => `<button class="fav" data-open="${esc(i.id)}"><span class="rank">${n + 1}</span>${instIcon(i)}
                    <span class="fav-main"><b>${esc(i.name)}</b><span class="fav-bar"><i style="width:${(i.playTime / maxFav) * 100}%"></i></span></span>
                    <span class="fav-time">${formatDuration(i.playTime)}</span></button>`
                )
                .join('')}
            </div>
          </section>`
    }
  </div>`;
  $$('[data-open]', view).forEach((b) => b.addEventListener('click', () => navigate(`/instance/${b.dataset.open}`)));
}
