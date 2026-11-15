import { state } from '../state.js';
import { icon } from '../icons.js';
import { esc, $, $$, timeAgo } from '../ui.js';
import { navigate } from '../router.js';

// Все скриншоты всех сборок на одной странице, самые новые сверху.
export async function renderAllShots(view) {
  view.innerHTML = `<div class="view-inner"><div class="section-head" style="margin-bottom:20px"><div><h1>Скриншоты</h1><div class="muted" style="margin-top:4px" data-sub>Загружаю…</div></div></div><div class="shot-grid" data-grid></div></div>`;
  const all = [];
  await Promise.all(
    state.instances.map(async (inst) => {
      try {
        for (const s of await window.api.shots.list(inst.id)) all.push({ inst, ...s });
      } catch {
        /* у сборки нет скриншотов */
      }
    })
  );
  if (!view.isConnected) return;
  all.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const sub = $('[data-sub]', view);
  const grid = $('[data-grid]', view);
  if (!all.length) {
    sub.textContent = '';
    grid.outerHTML = `<div class="empty"><div class="icon-wrap">${icon('image')}</div><h3>Пока нет скриншотов</h3><p>Нажмите F2 в игре: снимки появятся здесь.</p></div>`;
    return;
  }
  const shown = all.slice(0, 120);
  sub.textContent = `Всего: ${all.length}${all.length > shown.length ? `, показаны последние ${shown.length}` : ''}`;
  grid.innerHTML = shown
    .map((s, i) => `<button class="shot" data-i="${i}" aria-label="${esc(s.inst.name)}: ${esc(s.file)}"><span class="ph"></span><span class="cap">${esc(s.inst.name)} · ${esc(timeAgo(s.mtime))}</span></button>`)
    .join('');
  $$('.shot', grid).forEach((b) => {
    const s = shown[Number(b.dataset.i)];
    b.addEventListener('click', () => navigate(`/instance/${s.inst.id}/shots`));
    window.api.shots
      .thumb(s.inst.id, s.file)
      .then((url) => {
        if (url && b.isConnected) $('.ph', b).outerHTML = `<img src="${url}" alt="" loading="lazy" />`;
      })
      .catch(() => {});
  });
}
