import { state, loadInstances } from '../state.js';
import { icon } from '../icons.js';
import { esc, instIcon, coverStyle, timeAgo, formatDuration, confirmDialog, LOADERS, $, $$, toast, progressModal } from '../ui.js';
import { navigate } from '../router.js';
import { openCreateInstance } from '../modals.js';
import { openImport } from '../import-ui.js';

export function instanceCard(i) {
  const loader = LOADERS[i.loader] || LOADERS.vanilla;
  return `<div class="instance-card" data-open="${esc(i.id)}" tabindex="0">
    <div class="cover" style="${coverStyle(i.hue)}">
      ${instIcon(i, '', true)}
      <button class="pin-btn ${i.pinned ? 'on' : ''}" data-pin="${esc(i.id)}" aria-label="${i.pinned ? 'Открепить' : 'Закрепить'}" title="${i.pinned ? 'Открепить' : 'Закрепить'}">${icon('pin')}</button>
      <span data-live-play="${esc(i.id)}" data-variant="fab"></span>
    </div>
    <div>
      <div class="name">${esc(i.name)}</div>
      <div class="meta"><i style="width:8px;height:8px;border-radius:2px;background:${loader.color}"></i>${loader.label} ${esc(i.version)}
        <span>·</span>${state.running.has(i.id) ? '<span style="color:var(--success)">в игре</span>' : esc(timeAgo(i.lastPlayed))}${state.settings.showPlayTime !== false && i.playTime ? `<span>·</span><span title="Время в игре">${icon('clock')}${formatDuration(i.playTime)}</span>` : ''}</div>
    </div>
  </div>`;
}

export function importPack() {
  openImport();
}

export function newInstanceCard() {
  return `<button class="instance-card new-card" data-new>
    <span class="plus">${icon('plus')}</span>Новая сборка</button>`;
}

export function bindCards(root) {
  $$('[data-open]', root).forEach((el) => {
    el.addEventListener('click', () => navigate(`/instance/${el.dataset.open}`));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(`/instance/${el.dataset.open}`);
    });
  });
  $$('[data-new]', root).forEach((el) => el.addEventListener('click', openCreateInstance));
  $$('[data-pin]', root).forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const inst = state.instances.find((x) => x.id === b.dataset.pin);
      if (!inst) return;
      await window.api.instances.update(inst.id, { pinned: !inst.pinned });
      await loadInstances();
    })
  );
}

let filter = { q: '', loader: 'all', sort: 'recent' };

export function renderLibrary(view) {
  const draw = () => {
    let list = state.instances.filter(
      (i) => (filter.loader === 'all' || i.loader === filter.loader) && i.name.toLowerCase().includes(filter.q.toLowerCase())
    );
    if (filter.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (filter.sort === 'version') list = [...list].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    list = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    $('[data-grid]', view).innerHTML = state.instances.length
      ? list.length
        ? list.map(instanceCard).join('') + newInstanceCard()
        : `<div class="empty" style="grid-column:1/-1"><div class="icon-wrap">${icon('search')}</div><h3>Ничего не найдено</h3><p>Попробуйте другое название или сбросьте фильтр.</p><button class="btn" data-reset>Сбросить фильтры</button></div>`
      : `<div class="empty" style="grid-column:1/-1"><div class="icon-wrap">${icon('box')}</div><h3>Пока нет ни одной сборки</h3><p>Сборка — это отдельная копия игры со своей версией, модами и мирами.</p><button class="btn primary" data-new>${icon('plus')}Создать сборку</button></div>`;
    bindCards(view);
    const reset = $('[data-reset]', view);
    if (reset)
      reset.addEventListener('click', () => {
        filter = { ...filter, q: '', loader: 'all' };
        $('#lib-q', view).value = '';
        $('#lib-loader', view).value = 'all';
        draw();
      });
    import('../actions.js').then((m) => m.updateLive());
  };

  view.innerHTML = `<div class="view-inner">
    <div class="section-head" style="margin-bottom:20px">
      <div><h1>Библиотека</h1><div class="muted" style="margin-top:4px">${state.instances.length} ${plural(state.instances.length, 'сборка', 'сборки', 'сборок')}</div></div>
      <div style="display:flex;gap:8px"><button class="btn" data-import>${icon('download')}Импорт сборки</button><button class="btn primary" data-new>${icon('plus')}Новая сборка</button></div>
    </div>
    <div class="toolbar" style="margin-bottom:20px">
      <div class="search"><label for="lib-q" class="sr-only" style="position:absolute;left:-9999px">Поиск сборок</label>${icon('search')}<input id="lib-q" class="input" placeholder="Поиск по сборкам" value="${esc(filter.q)}" /></div>
      <select id="lib-loader" class="select" aria-label="Загрузчик">
        <option value="all">Все загрузчики</option>
        ${Object.entries(LOADERS).map(([k, v]) => `<option value="${k}" ${filter.loader === k ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
      <select id="lib-sort" class="select" aria-label="Сортировка">
        <option value="recent" ${filter.sort === 'recent' ? 'selected' : ''}>Недавние</option>
        <option value="name" ${filter.sort === 'name' ? 'selected' : ''}>По названию</option>
        <option value="version" ${filter.sort === 'version' ? 'selected' : ''}>По версии</option>
      </select>
    </div>
    <div class="${state.settings.compactLibrary ? 'list-compact' : 'grid'}" data-grid></div>
  </div>`;
  $('[data-new]', view).addEventListener('click', openCreateInstance);
  $('[data-import]', view).addEventListener('click', importPack);
  $('#lib-q', view).addEventListener('input', (e) => {
    filter.q = e.target.value;
    draw();
  });
  $('#lib-loader', view).addEventListener('change', (e) => {
    filter.loader = e.target.value;
    draw();
  });
  $('#lib-sort', view).addEventListener('change', (e) => {
    filter.sort = e.target.value;
    draw();
  });
  draw();
}

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
