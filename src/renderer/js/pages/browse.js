import { state, loadInstances, loadVersions } from '../state.js';
import { icon } from '../icons.js';
import { esc, instIcon, formatNumber, LOADERS, $, $$, toast, openModal, timeAgo } from '../ui.js';
import { navigate } from '../router.js';
import { createFilters } from '../filters.js';

const TYPES = [
  ['mod', 'Моды', 'puzzle'],
  ['modpack', 'Сборки', 'box'],
  ['resourcepack', 'Ресурспаки', 'image'],
  ['shader', 'Шейдеры', 'sun'],
];
const SORTS = [
  ['relevance', 'По релевантности'],
  ['downloads', 'По загрузкам'],
  ['follows', 'По популярности'],
  ['newest', 'Новые'],
  ['updated', 'Обновлённые'],
];
const SOURCES = [
  ['modrinth', 'Modrinth'],
  ['curseforge', 'CurseForge'],
];
const MODRINTH_PATH = { mod: 'mod', modpack: 'modpack', resourcepack: 'resourcepack', shader: 'shader' };

export async function renderBrowse(view, route) {
  const target = route.query.instance ? state.instances.find((i) => i.id === route.query.instance) : null;
  const params = {
    query: route.query.q || '',
    type: route.query.type || 'mod',
    sort: route.query.q ? 'relevance' : 'downloads',
    gameVersion: target ? target.version : '',
    loader: target && target.loader !== 'vanilla' ? target.loader : '',
    offset: 0,
  };
  let source = route.query.src === 'curseforge' ? 'curseforge' : 'modrinth';
  let hits = [];
  let total = 0;
  let page = 1;
  const PAGE_SIZE = 20;
  const MAX_PAGES = 250; // API отдаёт не глубже 5000 результатов
  let seq = 0;
  const busy = new Map(); // project_id → подпись на кнопке
  const useTarget = () => target && params.type !== 'modpack';

  const unsub = window.api.events.onContentProgress((p) => {
    for (const [pid] of busy) {
      if (p.key === `modpack:${source === 'curseforge' ? 'cf' : ''}${pid}`) {
        busy.set(pid, p.total ? `${p.stage} ${p.done}/${p.total}` : p.stage);
        const b = $(`[data-busy="${pid}"]`, view);
        if (b) b.lastChild.textContent = busy.get(pid);
      }
    }
  });
  const guard = setInterval(() => {
    if (!view.isConnected) {
      clearInterval(guard);
      unsub();
    }
  }, 2000);

  view.innerHTML = `<div class="view-inner">
    <div class="section-head" style="margin-bottom:18px"><div><h1>Каталог</h1><div class="muted" style="margin-top:4px">Моды, сборки, ресурспаки и шейдеры</div></div>
      <div class="segmented" data-sources>${SOURCES.map(([k, v]) => `<button data-src="${k}" class="${source === k ? 'active' : ''}">${v}</button>`).join('')}</div></div>
    ${
      target
        ? `<div class="target-banner">${instIcon(target)}<div class="grow"><b>Установка в «${esc(target.name)}»</b>
            <div class="muted" style="font-size:12.5px">${(LOADERS[target.loader] || LOADERS.vanilla).label} ${esc(target.version)} · показываем только совместимое</div></div>
            <button class="btn sm" data-back>${icon('chevronRight')}К сборке</button>
            <button class="btn sm ghost icon-only" data-untarget aria-label="Сбросить сборку">${icon('x')}</button></div>`
        : ''
    }
    <div class="segmented" style="margin-bottom:14px" data-types>
      ${TYPES.map(([k, v, ic]) => `<button data-type="${k}" class="${params.type === k ? 'active' : ''}">${icon(ic)}${v}</button>`).join('')}
    </div>
    <div class="toolbar" style="margin-bottom:18px">
      <div class="search"><label for="br-q" style="position:absolute;left:-9999px">Поиск</label>${icon('search')}<input id="br-q" class="input" placeholder="Найти, например Sodium" value="${esc(params.query)}" /></div>
      <select id="br-sort" class="select" aria-label="Сортировка">${SORTS.map(([k, v]) => `<option value="${k}" ${params.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
    <div class="browse-cols">
      <div style="min-width:0"><div data-results style="display:grid;gap:12px"></div>
      <div style="display:flex;flex-direction:column;align-items:center;margin-top:18px" data-more></div></div>
      <aside class="filters" data-filters aria-label="Фильтры"></aside>
    </div>
  </div>`;
  const filters = createFilters({
    mount: $('[data-filters]', view),
    getType: () => params.type,
    getSource: () => source,
    lockVersionLoader: () => !!useTarget(),
    versionsPromise: loadVersions().then((v) => v.versions),
    onChange: () => {
      Object.assign(params, filters.params());
      search(true);
    },
  });
  filters.draw();

  if (target) {
    $('[data-back]', view).addEventListener('click', () => navigate(`/instance/${target.id}`));
    $('[data-untarget]', view).addEventListener('click', () => navigate(`/browse?type=${params.type}&src=${source}`));
  }

  $$('[data-src]', view).forEach((b) =>
    b.addEventListener('click', () => {
      source = b.dataset.src;
      $$('[data-src]', view).forEach((x) => x.classList.toggle('active', x === b));
      filters.draw();
      Object.assign(params, filters.params());
      search(true);
    })
  );
  $$('[data-type]', view).forEach((b) =>
    b.addEventListener('click', () => {
      params.type = b.dataset.type;
      $$('[data-type]', view).forEach((x) => x.classList.toggle('active', x === b));
      filters.typeChanged();
      Object.assign(params, filters.params());
      search(true);
    })
  );
  let debounce;
  $('#br-q', view).addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      params.query = e.target.value.trim();
      search(true);
    }, 350);
  });
  $('#br-sort', view).addEventListener('change', (e) => {
    params.sort = e.target.value;
    search(true);
  });

  const installedIds = () => {
    if (!useTarget()) return new Set();
    const inst = state.instances.find((i) => i.id === target.id);
    return new Set(Object.values((inst && inst.content) || {}).map((c) => c.projectId));
  };

  function row(p) {
    const installed = installedIds().has(p.source === 'curseforge' ? `cf:${p.project_id}` : p.project_id);
    const label = busy.get(p.project_id);
    const isPack = params.type === 'modpack';
    return `<div class="project-row">
      ${p.icon_url ? `<img class="project-icon" src="${esc(p.icon_url)}" alt="" loading="lazy" decoding="async" />` : `<div class="project-icon">${icon(isPack ? 'box' : 'puzzle')}</div>`}
      <div style="min-width:0">
        <div class="title"><h3 data-ext="${esc(p.slug)}" data-url="${esc(p.url || '')}" data-ptype="${esc(p.project_type)}">${esc(p.title)}</h3><span class="faint">автор ${esc(p.author)}</span></div>
        <div class="desc">${esc(p.description)}</div>
        <div class="tags">${(p.display_categories || p.categories || []).slice(0, 5).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
      </div>
      <div class="side">
        <div class="stats">
          <span>${icon('download')}<b>${formatNumber(p.downloads)}</b></span>
          <span>${icon('heart')}<b>${formatNumber(p.follows)}</b></span>
          <span class="faint">${icon('refresh')}${esc(timeAgo(Date.parse(p.date_modified)))}</span>
        </div>
        ${
          installed
            ? `<button class="btn sm" disabled>${icon('check')}Установлено</button>`
            : label
              ? `<button class="btn sm primary" disabled data-busy="${esc(p.project_id)}">${icon('download')}<span>${esc(label)}</span></button>`
              : p.allowed === false
                ? `<button class="btn sm" data-open-site="${esc(p.project_id)}">${icon('external')}На сайте</button>`
                : `<button class="btn sm primary" data-install="${esc(p.project_id)}" data-title="${esc(p.title)}">${icon('download')}${isPack ? 'Создать сборку' : 'Установить'}</button>`
        }
      </div>
    </div>`;
  }

  function drawResults() {
    const box = $('[data-results]', view);
    box.innerHTML = hits.length
      ? hits.map(row).join('')
      : `<div class="empty"><div class="icon-wrap">${icon('search')}</div><h3>Ничего не нашлось</h3><p>Попробуйте изменить запрос или убрать фильтры по версии и загрузчику.</p></div>`;
    $$('[data-install]', box).forEach((b) => b.addEventListener('click', () => install(b.dataset.install, b.dataset.title)));
    $$('[data-open-site]', box).forEach((b) => {
      const p = hits.find((h) => h.project_id === b.dataset.openSite);
      b.addEventListener('click', () => p && p.url && window.api.app.openExternal(p.url));
    });
    $$('[data-ext]', box).forEach((h) =>
      h.addEventListener('click', () => {
        const p = hits.find((x) => x.slug === h.dataset.ext);
        const pid = p ? p.project_id : h.dataset.ext;
        navigate(`/project/${source}/${encodeURIComponent(pid)}${target ? `?instance=${encodeURIComponent(target.id)}` : ''}`);
      })
    );
    drawPager();
  }

  function pageList(cur, last) {
    const set = new Set([1, last, cur - 1, cur, cur + 1]);
    if (cur <= 3) [2, 3, 4].forEach((n) => set.add(n));
    if (cur >= last - 2) [last - 1, last - 2, last - 3].forEach((n) => set.add(n));
    const nums = [...set].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  }

  function drawPager() {
    const box = $('[data-more]', view);
    const last = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    if (!hits.length || last <= 1) {
      box.innerHTML = '';
      return;
    }
    const btn = (n, label, extra = '') => `<button class="btn sm pg ${n === page ? 'primary' : ''}" data-page="${n}" ${extra} aria-label="Страница ${n}" ${n === page ? 'aria-current="page"' : ''}>${label}</button>`;
    box.innerHTML = `<nav class="pager" aria-label="Страницы каталога">
      <button class="btn sm pg" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Предыдущая страница">${icon('chevronLeft')}</button>
      ${pageList(page, last).map((n) => (n === '…' ? '<span class="pg-gap">…</span>' : btn(n, n))).join('')}
      <button class="btn sm pg" data-page="${page + 1}" ${page >= last ? 'disabled' : ''} aria-label="Следующая страница">${icon('chevronRight')}</button>
    </nav>
    <div class="faint" style="text-align:center;margin-top:8px;font-size:12.5px">Страница ${page} из ${last} · найдено ${formatNumber(total)}</div>`;
    $$('[data-page]', box).forEach((b) =>
      b.addEventListener('click', () => {
        const n = Number(b.dataset.page);
        if (!n || n === page || n < 1 || n > last) return;
        page = n;
        search(false);
        view.scrollTo ? view.scrollTo({ top: 0, behavior: 'smooth' }) : (view.scrollTop = 0);
      })
    );
  }

  async function search(reset) {
    const my = ++seq;
    if (reset) page = 1;
    params.offset = (page - 1) * PAGE_SIZE;
    {
      $('[data-results]', view).innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton" style="height:106px"></div>').join('');
      $('[data-more]', view).innerHTML = '';
    }
    const q = { ...params, limit: PAGE_SIZE };
    if (useTarget() === false && target) {
      q.gameVersion = '';
      q.loader = '';
    }
    try {
      const res = await window.api[source].search(q);
      if (my !== seq || !view.isConnected) return;
      hits = res.hits;
      total = res.total_hits;
      drawResults();
    } catch (err) {
      if (my !== seq) return;
      const needKey = /ключ/i.test(err.message);
      $('[data-results]', view).innerHTML = `<div class="empty"><div class="icon-wrap">${icon(needKey ? 'key' : 'wifiOff')}</div>
        <h3>${needKey ? 'Нужен ключ CurseForge' : 'Каталог недоступен'}</h3>
        <p>${needKey ? esc(err.message) + ' Ключ бесплатный: его выдают на console.curseforge.com.' : 'Не получилось связаться с каталогом. Проверьте подключение и повторите.'}</p>
        ${needKey ? `<button class="btn primary" data-settings>${icon('settings')}Открыть настройки</button>` : `<button class="btn" data-retry>${icon('refresh')}Повторить</button>`}</div>`;
      const r = $('[data-retry]', view);
      if (r) r.addEventListener('click', () => search(true));
      const st = $('[data-settings]', view);
      if (st) st.addEventListener('click', () => navigate('/settings'));
    }
  }

  async function install(projectId, title) {
    const isPack = params.type === 'modpack';
    let inst = useTarget() ? target : null;
    if (!isPack && !inst) inst = await pickInstance(params.type);
    if (!isPack && !inst) return;
    busy.set(projectId, 'Подготовка');
    drawResults();
    try {
      if (isPack) {
        const res = await window.api[source].installModpack(projectId);
        await loadInstances();
        toast(`Сборка «${res.instance.name}» создана`, res.manual.length ? `${res.manual.length} файл(ов) автор запретил скачивать вне сайта — их нужно добавить вручную.` : 'Всё скачано, можно играть.', 'success');
        navigate(`/instance/${res.instance.id}`);
        return;
      }
      const raw = await window.api[source].install(inst.id, projectId);
      const list = Array.isArray(raw) ? raw : raw.installed;
      const skipped = Array.isArray(raw) ? [] : raw.skipped;
      await loadInstances();
      const deps = list.length > 1 ? ` и ещё ${list.length - 1} (зависимости)` : '';
      toast(`${title} установлен`, `В сборку «${inst.name}»${deps}${skipped.length ? `. Не удалось скачать: ${skipped.join('; ')}` : ''}`, 'success');
    } catch (err) {
      toast(`Не удалось установить ${title}`, err.message, 'error');
    } finally {
      busy.delete(projectId);
      if (view.isConnected) drawResults();
    }
  }

  search(true);
}

function pickInstance(type) {
  return new Promise((resolve) => {
    let chosen = null;
    const list = state.instances.filter((i) => type !== 'mod' || i.loader !== 'vanilla');
    openModal(
      `<div class="modal-head"><h2>Куда установить?</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
       <div class="modal-body">
        ${
          list.length
            ? `<div class="content-list">${list
                .map(
                  (i) => `<div class="content-item" style="grid-template-columns:40px 1fr auto;cursor:pointer" data-pick="${esc(i.id)}" tabindex="0">
                  ${instIcon(i).replace('class="cube', 'style="width:40px;height:40px;border-radius:10px" class="cube')}
                  <div><div class="t">${esc(i.name)}</div><div class="s">${(LOADERS[i.loader] || LOADERS.vanilla).label} ${esc(i.version)}</div></div>
                  ${icon('chevronRight')}
                </div>`
                )
                .join('')}</div>`
            : `<div class="empty" style="padding:28px"><h3>Нет подходящих сборок</h3><p>${type === 'mod' ? 'Моды ставятся в сборки с загрузчиком: Fabric, Quilt, Forge или NeoForge.' : 'Сначала создайте сборку.'}</p></div>`
        }
       </div>`,
      {
        onMount: (m, close) => {
          $$('[data-pick]', m).forEach((el) => {
            const pick = () => {
              chosen = state.instances.find((i) => i.id === el.dataset.pick);
              close();
            };
            el.addEventListener('click', pick);
            el.addEventListener('keydown', (e) => e.key === 'Enter' && pick());
          });
        },
        onClose: () => resolve(chosen),
      }
    );
  });
}
