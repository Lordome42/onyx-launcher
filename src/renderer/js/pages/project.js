// Страница проекта внутри лаунчера: описание, версии, галерея. Источник: Modrinth или CurseForge.
import { state, loadInstances } from '../state.js';
import { icon } from '../icons.js';
import { esc, formatNumber, $, $$, toast, openModal, timeAgo, progressModal } from '../ui.js';
import { navigate } from '../router.js';
import { renderBody } from '../markup.js';

const TYPE = { mod: 'Мод', modpack: 'Сборка', resourcepack: 'Ресурспак', shader: 'Шейдер' };
const VT = { release: 'Релиз', beta: 'Бета', alpha: 'Альфа' };

export async function renderProject(view, route) {
  const source = route.parts[0] === 'curseforge' ? 'curseforge' : 'modrinth';
  const id = route.parts[1];
  view.innerHTML = `<div class="view-inner"><div class="skeleton" style="height:120px;margin-bottom:16px"></div><div class="skeleton" style="height:320px"></div></div>`;
  let p;
  try {
    p = await window.api[source].detail(id, route.query.instance || '');
  } catch (err) {
    view.innerHTML = `<div class="view-inner"><div class="empty"><div class="icon-wrap">${icon('alert')}</div><h3>Не удалось открыть страницу</h3><p>${esc(err.message)}</p><button class="btn" data-back>Назад</button></div></div>`;
    $('[data-back]', view).addEventListener('click', () => history.back());
    return;
  }
  if (!view.isConnected) return;

  const isPack = p.type === 'modpack';
  let target = route.query.instance ? state.instances.find((i) => i.id === route.query.instance) : null;
  const eligible = () => state.instances.filter((i) => p.type !== 'mod' || i.loader !== 'vanilla');
  if (!target && !isPack) target = eligible()[0] || null;
  let tab = 'about';

  const links = Object.entries({ site: 'Страница на сайте', source: 'Исходный код', issues: 'Сообщить о проблеме', wiki: 'Вики', discord: 'Discord' })
    .filter(([k]) => p.links && p.links[k])
    .map(([k, label]) => `<a class="ext-link" data-href="${esc(p.links[k])}">${icon('external')}${label}</a>`)
    .join('');

  view.innerHTML = `<div class="view-inner project-page">
    <button class="btn ghost sm" data-back style="margin-bottom:10px">${icon('chevronLeft')}Назад</button>
    <div class="project-head">
      ${p.icon ? `<img class="project-icon big" src="${esc(p.icon)}" alt="" />` : `<div class="project-icon big">${icon(isPack ? 'box' : 'puzzle')}</div>`}
      <div class="info">
        <h1>${esc(p.title)}</h1>
        <p class="muted">${esc(p.summary || '')}</p>
        <div class="chips">
          <span class="chip">${TYPE[p.type] || p.type}</span>
          <span class="chip">${icon('download')}${formatNumber(p.downloads)}</span>
          <span class="chip">${icon('heart')}${formatNumber(p.follows)}</span>
          ${p.authors && p.authors.length ? `<span class="chip">${icon('user')}${esc(p.authors.slice(0, 3).join(', '))}</span>` : ''}
          <span class="chip">${source === 'curseforge' ? 'CurseForge' : 'Modrinth'}</span>
          ${p.updated ? `<span class="chip">${icon('refresh')}${esc(timeAgo(Date.parse(p.updated)))}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        ${isPack ? '' : `<label for="pj-inst" style="position:absolute;left:-9999px">Сборка для установки</label><select class="select" id="pj-inst" style="width:200px">${eligible().length ? eligible().map((i) => `<option value="${esc(i.id)}" ${target && target.id === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('') : '<option value="">Нет подходящих сборок</option>'}</select>`}
        <button class="btn primary" data-install-latest ${!isPack && !target ? 'disabled' : ''}>${icon('download')}${isPack ? 'Создать сборку' : 'Установить'}</button>
      </div>
    </div>
    <div class="tabs" role="tablist">
      <button data-ptab="about" class="active">Описание</button>
      <button data-ptab="versions">Версии <span class="count">${p.versions.length}${p.versions.length >= 40 ? '+' : ''}</span></button>
      ${p.gallery.length ? `<button data-ptab="gallery">Галерея <span class="count">${p.gallery.length}</span></button>` : ''}
    </div>
    <div class="project-cols">
      <div data-pbody></div>
      <aside class="project-side">
        <div class="side-card"><h4>Совместимость</h4>
          ${p.gameVersions.length ? `<div class="tags">${p.gameVersions.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : '<span class="faint">нет данных</span>'}
          ${p.loaders.length ? `<div class="tags" style="margin-top:8px">${p.loaders.map((l) => `<span class="chip">${esc(l)}</span>`).join('')}</div>` : ''}
        </div>
        ${p.categories.length ? `<div class="side-card"><h4>Категории</h4><div class="tags">${p.categories.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>` : ''}
        ${links ? `<div class="side-card"><h4>Ссылки</h4><div class="ext-links">${links}</div></div>` : ''}
      </aside>
    </div>
  </div>`;

  $('[data-back]', view).addEventListener('click', () => history.back());
  const sel = $('#pj-inst', view);
  if (sel)
    sel.addEventListener('change', () => {
      target = state.instances.find((i) => i.id === sel.value) || null;
      $('[data-install-latest]', view).disabled = !target;
      if (tab === 'versions') drawTab();
    });

  const openLinks = (root) =>
    $$('[data-href]', root).forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.app.openExternal(a.dataset.href);
      })
    );
  openLinks(view);

  async function install(versionId, label) {
    if (isPack) {
      const stop = progressModal('Создаём сборку', `modpack:${source === 'curseforge' ? 'cf' : ''}${p.id}`);
      try {
        const res = await window.api[source].installModpack(p.id);
        stop();
        await loadInstances();
        toast(`Сборка «${res.instance.name}» создана`, res.manual && res.manual.length ? `${res.manual.length} файл(ов) нужно добавить вручную.` : 'Всё скачано, можно играть.', 'success');
        navigate(`/instance/${res.instance.id}`);
      } catch (err) {
        stop();
        toast('Не удалось создать сборку', err.message, 'error');
      }
      return;
    }
    if (!target) return;
    const btns = $$('[data-install-latest], [data-install-ver]', view);
    btns.forEach((b) => (b.disabled = true));
    try {
      const raw = await window.api[source].install(target.id, p.id, versionId || undefined);
      const list = Array.isArray(raw) ? raw : raw.installed;
      await loadInstances();
      toast(`${p.title} установлен`, `В сборку «${target.name}»${label ? ` (${label})` : ''}${list.length > 1 ? ` и ещё ${list.length - 1} зависимости` : ''}`, 'success');
    } catch (err) {
      toast(`Не удалось установить ${p.title}`, err.message, 'error');
    } finally {
      $$('[data-install-latest], [data-install-ver]', view).forEach((b) => (b.disabled = !target));
    }
  }
  $('[data-install-latest]', view).addEventListener('click', () => install(null, ''));

  const drawTab = () => {
    const box = $('[data-pbody]', view);
    if (tab === 'about') {
      box.innerHTML = `<div class="prose">${p.body ? renderBody(p.body, p.bodyFormat) : '<p class="muted">Автор не добавил подробное описание.</p>'}</div>`;
      openLinks(box);
    } else if (tab === 'versions') {
      box.innerHTML = p.versions.length
        ? `${p.filtered && target ? `<p class="muted" style="margin:0 0 10px">Показаны версии, подходящие для «${esc(target.name)}».</p>` : ''}<div class="version-list">${p.versions
            .map(
              (v, i) => `<div class="version-row">
              <div style="min-width:0"><div class="t">${esc(v.name || v.title)}</div><div class="s">${esc((v.gameVersions || []).slice(0, 4).join(', '))}${v.loaders && v.loaders.length ? ' · ' + esc(v.loaders.join(', ')) : ''}</div></div>
              <span class="chip ${v.type !== 'release' ? 'warn' : ''}">${VT[v.type] || v.type}</span>
              <span class="faint">${v.date ? esc(timeAgo(Date.parse(v.date))) : ''}</span>
              <span class="faint">${icon('download')}${formatNumber(v.downloads || 0)}</span>
              ${isPack ? '' : `<button class="btn sm" data-install-ver="${i}" ${!target || v.downloadable === false ? 'disabled' : ''} title="${v.downloadable === false ? 'Автор запретил скачивание вне сайта' : ''}">Установить</button>`}
            </div>`
            )
            .join('')}</div>`
        : '<div class="empty"><h3>Нет подходящих версий</h3><p>Для выбранной сборки версий этого проекта не нашлось.</p></div>';
      $$('[data-install-ver]', box).forEach((b) => {
        const v = p.versions[Number(b.dataset.installVer)];
        b.addEventListener('click', () => install(v.id, v.name));
      });
    } else {
      box.innerHTML = `<div class="gallery">${p.gallery.map((g, i) => `<button class="shot" data-g="${i}" aria-label="${esc(g.title || 'Изображение ' + (i + 1))}"><img src="${esc(g.url)}" alt="" loading="lazy" decoding="async" />${g.title ? `<span class="cap">${esc(g.title)}</span>` : ''}</button>`).join('')}</div>`;
      $$('[data-g]', box).forEach((b) =>
        b.addEventListener('click', () => {
          const g = p.gallery[Number(b.dataset.g)];
          openModal(`<div class="modal-head"><h2 style="font-size:15px">${esc(g.title || p.title)}</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div><div class="modal-body shot-full"><img src="${esc(g.url)}" alt="" /></div>`);
        })
      );
    }
  };
  $$('[data-ptab]', view).forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.ptab;
      $$('[data-ptab]', view).forEach((x) => x.classList.toggle('active', x === b));
      drawTab();
    })
  );
  drawTab();
}
