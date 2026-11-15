import { state, loadInstances, loadVersions, subscribe } from '../state.js';
import { icon } from '../icons.js';
import { javaOptions } from '../java-ui.js';
import { esc, instIcon, cube, coverStyle, LOADERS, $, $$, toast, confirmDialog, confirmSoft, formatDuration, timeAgo, formatSize, progressModal } from '../ui.js';
import { navigate } from '../router.js';
import { updateLive, togglePlay } from '../actions.js';
import { openModal } from '../ui.js';
import { openUpdates, openAnalysis, renderShots, renderLogs } from './instance-tools.js';

const TYPE_LABEL = { mod: 'Мод', resourcepack: 'Ресурспак', shader: 'Шейдер' };

export async function renderInstance(view, route) {
  const id = route.parts[0];
  const tab = route.parts[1] || 'content';
  const inst = state.instances.find((i) => i.id === id);
  const st = state.settings || {};
  if (!inst) {
    view.innerHTML = `<div class="view-inner"><div class="empty"><div class="icon-wrap">${icon('box')}</div><h3>Сборка не найдена</h3><p>Возможно, её удалили.</p><button class="btn" data-back>К библиотеке</button></div></div>`;
    $('[data-back]', view).addEventListener('click', () => navigate('/library'));
    return;
  }
  const loader = LOADERS[inst.loader] || LOADERS.vanilla;

  view.innerHTML = `<div class="view-inner">
    <div class="instance-head">
      <div class="glow" style="${coverStyle(inst.hue)}"></div>
      ${instIcon(inst)}
      <div class="info">
        <h1>${esc(inst.name)}</h1>
        <div class="chips">
          <span class="chip"><i style="width:8px;height:8px;border-radius:2px;background:${loader.color}"></i>${loader.label}${inst.loaderVersion ? ' ' + esc(inst.loaderVersion) : ''}</span>
          <span class="chip">${icon('gamepad')}Minecraft ${esc(inst.version)}</span>
          <span class="chip">${icon('clock')}${formatDuration(inst.playTime)}</span>
          <span class="chip">${esc(timeAgo(inst.lastPlayed))}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn icon-only ${inst.pinned ? 'primary' : ''}" data-pin aria-label="${inst.pinned ? 'Открепить' : 'Закрепить'}" title="${inst.pinned ? 'Открепить' : 'Закрепить в боковой панели'}">${icon('pin')}</button>
        <button class="btn icon-only" data-folder aria-label="Открыть папку" title="Открыть папку">${icon('folder')}</button>
        <span data-live-play="${esc(inst.id)}" data-variant="big"></span>
      </div>
    </div>
    <div data-live-progress="${esc(inst.id)}"></div>

    <div class="tabs" role="tablist">
      ${[
        ['content', 'puzzle', 'Контент <span class="count" data-count>…</span>', st.showTabContent !== false],
        ['worlds', 'globe', 'Миры', st.showTabWorlds !== false],
        ['servers', 'server', 'Серверы', true],
        ['shots', 'image', 'Скриншоты', st.showTabShots !== false],
        ['logs', 'terminal', 'Журнал', true],
        ['settings', 'settings', 'Настройки', true],
      ]
        .filter(([id, , , on]) => on || id === tab)
        .map(([id, ic, name]) => `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${icon(ic)}${name}</button>`)
        .join('')}
    </div>
    <div data-tabbody></div>
  </div>`;

  $('[data-folder]', view).addEventListener('click', () => window.api.instances.openFolder(inst.id));
  $('[data-pin]', view).addEventListener('click', async () => {
    await window.api.instances.update(inst.id, { pinned: !inst.pinned });
    await loadInstances();
  });
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => navigate(`/instance/${inst.id}/${b.dataset.tab}`)));
  updateLive();

  const body = $('[data-tabbody]', view);
  if (tab !== 'content') {
    window.api.instances.content(inst.id).then((c) => { const el = $('[data-count]', view); if (el) el.textContent = c.length; }).catch(() => {});
  }
  if (tab === 'worlds') return renderWorlds(body, inst);
  if (tab === 'servers') return renderServers(body, inst);
  if (tab === 'shots') return renderShots(body, inst);
  if (tab === 'logs') return renderLogs(body, inst);
  if (tab === 'settings') return renderSettings(body, inst);
  // На других вкладках всё равно показываем число элементов контента.
  return renderContent(body, inst, view);
}

async function renderContent(body, inst, view) {
  body.innerHTML = `<div class="skeleton" style="height:220px"></div>`;
  let items = [];
  let typeFilter = 'all';
  let q = '';
  try {
    items = await window.api.instances.content(inst.id);
  } catch (err) {
    body.innerHTML = `<div class="empty"><h3>Не удалось прочитать папку сборки</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  const countEl = $('[data-count]', view);
  if (countEl) countEl.textContent = items.length;
  const canMods = inst.loader && inst.loader !== 'vanilla';

  const draw = () => {
    const list = items.filter((i) => (typeFilter === 'all' || i.type === typeFilter) && i.title.toLowerCase().includes(q.toLowerCase()));
    body.innerHTML = `
      <div class="toolbar" style="margin-bottom:14px">
        <div class="search"><label for="ct-q" style="position:absolute;left:-9999px">Поиск контента</label>${icon('search')}<input id="ct-q" class="input" placeholder="Поиск среди установленного" value="${esc(q)}" /></div>
        <div class="segmented">
          ${[['all', 'Всё'], ['mod', 'Моды'], ['resourcepack', 'Ресурспаки'], ['shader', 'Шейдеры']]
            .map(([k, v]) => `<button data-type="${k}" class="${typeFilter === k ? 'active' : ''}">${v}</button>`)
            .join('')}
        </div>
        <button class="btn" data-upd style="height:44px" title="Проверить, вышли ли новые версии установленных модов">${icon('refresh')}Обновления</button>
        <button class="btn" data-check style="height:44px" title="Найти конфликты, дубликаты и недостающие зависимости">${icon('shield')}Проверка</button>
        <button class="btn" data-file style="height:44px" title="Добавить .jar или .zip с компьютера (можно перетащить сюда)">${icon('upload')}Из файла</button>
        <button class="btn primary" data-add style="height:44px">${icon('plus')}Добавить контент</button>
      </div>
      ${
        !items.length
          ? `<div class="empty"><div class="icon-wrap">${icon('puzzle')}</div><h3>Здесь пока пусто</h3>
             <p>${canMods ? 'Найдите моды, ресурспаки и шейдеры в каталоге — они установятся сразу в эту сборку вместе с зависимостями.' : 'В ванильную сборку можно ставить ресурспаки и шейдеры. Для модов создайте сборку с Fabric или Quilt.'}</p>
             <button class="btn primary" data-add>${icon('compass')}Открыть каталог</button></div>`
          : !list.length
            ? `<div class="empty"><h3>Ничего не найдено</h3><p>Попробуйте другой запрос или фильтр.</p></div>`
            : `<div class="content-list">${list
                .map(
                  (c) => `<div class="content-item ${c.enabled ? '' : 'disabled'}">
                  ${c.iconUrl ? `<img class="project-icon" src="${esc(c.iconUrl)}" alt="" loading="lazy" />` : `<div class="project-icon">${icon(c.type === 'mod' ? 'puzzle' : c.type === 'shader' ? 'sun' : 'image')}</div>`}
                  <div style="min-width:0"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.versionNumber || c.baseName)} · ${formatSize(c.size)}</div></div>
                  <span class="chip">${TYPE_LABEL[c.type]}</span>
                  <button class="toggle ${c.enabled ? 'on' : ''}" data-toggle="${esc(c.file)}" data-ctype="${c.type}" aria-label="${c.enabled ? 'Выключить' : 'Включить'} ${esc(c.title)}"></button>
                  <button class="btn ghost sm icon-only" data-rm="${esc(c.file)}" data-ctype="${c.type}" data-title="${esc(c.title)}" aria-label="Удалить ${esc(c.title)}">${icon('trash')}</button>
                </div>`
                )
                .join('')}</div>`
      }`;
    const qi = $('#ct-q', body);
    qi.addEventListener('input', (e) => {
      q = e.target.value;
      const pos = e.target.selectionStart;
      draw();
      const n = $('#ct-q', body);
      n.focus();
      n.setSelectionRange(pos, pos);
    });
    $$('[data-type]', body).forEach((b) =>
      b.addEventListener('click', () => {
        typeFilter = b.dataset.type;
        draw();
      })
    );
    const reload = async () => {
      items = await window.api.instances.content(inst.id);
      const c = $('[data-count]', view);
      if (c) c.textContent = items.length;
      draw();
    };
    $$('[data-upd]', body).forEach((b) => b.addEventListener('click', () => openUpdates(inst, reload)));
    $$('[data-check]', body).forEach((b) => b.addEventListener('click', () => openAnalysis(inst, reload)));
    $$('[data-file]', body).forEach((b) => b.addEventListener('click', async () => handleAdded(await window.api.instances.pickFiles(inst.id))));
    $$('[data-add]', body).forEach((b) =>
      b.addEventListener('click', () => navigate(`/browse?instance=${encodeURIComponent(inst.id)}&type=${canMods ? 'mod' : 'resourcepack'}`))
    );
    $$('[data-toggle]', body).forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          items = await window.api.instances.toggleContent(inst.id, b.dataset.ctype, b.dataset.toggle);
          draw();
        } catch (err) {
          toast('Не удалось переключить', err.message, 'error');
        }
      })
    );
    $$('[data-rm]', body).forEach((b) =>
      b.addEventListener('click', async () => {
        const ok = await confirmSoft({ title: `Удалить «${b.dataset.title}»?`, text: 'Файл будет удалён из папки сборки.', action: 'Удалить' });
        if (!ok) return;
        items = await window.api.instances.removeContent(inst.id, b.dataset.ctype, b.dataset.rm);
        const countEl = $('[data-count]', view);
        if (countEl) countEl.textContent = items.length;
        draw();
      })
    );
  };
  const handleAdded = async (res) => {
    if (!res) return;
    if (res.added.length) toast(`Добавлено: ${res.added.length}`, res.added.slice(0, 4).map((a) => a.name).join(', ') + (res.added.length > 4 ? '…' : ''), 'success');
    if (res.skipped.length) toast('Часть файлов пропущена', res.skipped.map((x) => `${x.name}: ${x.reason}`).join('; '), 'error');
    items = await window.api.instances.content(inst.id);
    const countEl = $('[data-count]', view);
    if (countEl) countEl.textContent = items.length;
    draw();
  };
  body.addEventListener('dragover', (e) => {
    e.preventDefault();
    body.classList.add('dropping');
  });
  body.addEventListener('dragleave', (e) => {
    if (e.target === body) body.classList.remove('dropping');
  });
  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    body.classList.remove('dropping');
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
    if (paths.length) handleAdded(await window.api.instances.addFiles(inst.id, paths));
  });
  draw();
}

function renderSettings(body, inst) {
  window.api.instances.content(inst.id).then((c) => {
    const el = $('[data-count]');
    if (el) el.textContent = c.length;
  }).catch(() => {});
  const s = state.settings;
  const mem = inst.memoryMax || 0;
  const HUES = [262, 222, 190, 160, 125, 85, 40, 15, 340, 300];
  body.innerHTML = `
    <div class="settings-group">
      <div class="setting">
        <div class="txt"><b>Иконка</b><span>Своя картинка вместо блока. Лучше всего квадратная.</span></div>
        <div class="ctl"><span class="icon-preview" data-icon-preview>${instIcon(inst)}</span>
          <button class="btn" data-icon-pick>${icon('image')}Выбрать…</button>
          <button class="btn ghost" data-icon-clear ${inst.iconData ? '' : 'disabled'}>Убрать</button></div>
      </div>
      <div class="setting">
        <div class="txt"><b>Цвет блока</b><span>Используется, когда своей иконки нет.</span></div>
        <div class="ctl hue-swatches">${HUES.map((h) => `<button type="button" data-hue="${h}" aria-label="Оттенок ${h}" style="background:hsl(${h} 65% 55%)" class="${h === inst.hue ? 'active' : ''}"></button>`).join('')}</div>
      </div>
      <div class="setting">
        <div class="txt"><b>Название</b><span>Отображается в библиотеке и боковой панели.</span></div>
        <div class="ctl"><label for="is-name" style="position:absolute;left:-9999px">Название</label><input id="is-name" class="input" style="width:280px" maxlength="48" value="${esc(inst.name)}" /></div>
      </div>
      <div class="setting">
        <div class="txt"><b>Оперативная память</b><span>${mem ? `Своё значение для этой сборки.` : `Сейчас используется общее значение из настроек: ${s.memoryMax} МБ.`}</span></div>
        <div class="ctl">
          <button class="toggle ${mem ? 'on' : ''}" data-mem-custom aria-label="Своё значение памяти"></button>
          <select class="select" id="is-mem" style="width:140px" ${mem ? '' : 'disabled'} aria-label="Память">
            ${[2048, 3072, 4096, 6144, 8192, 12288, 16384].map((v) => `<option value="${v}" ${(mem || s.memoryMax) === v ? 'selected' : ''}>${v / 1024} ГБ</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="setting">
        <div class="txt"><b>Аргументы JVM</b><span>Добавляются к общим аргументам из настроек.</span></div>
        <div class="ctl"><label for="is-jvm" style="position:absolute;left:-9999px">Аргументы JVM</label><input id="is-jvm" class="input" style="width:280px" placeholder="-XX:+UseG1GC" value="${esc(inst.jvmArgs || '')}" /></div>
      </div>
      <div class="setting">
        <div class="txt"><b>Профиль Java</b><span data-java-need>Какая Java будет использована для этой сборки.</span></div>
        <div class="ctl"><select class="select" id="is-jprof" style="width:280px" aria-label="Профиль Java"><option>Загрузка…</option></select></div>
      </div>
      <div class="setting">
        <div class="txt"><b>Своя Java</b><span>Путь к java/javaw. Оставьте пустым — нужная версия Java скачается автоматически.</span></div>
        <div class="ctl"><label for="is-java" style="position:absolute;left:-9999px">Путь к Java</label><input id="is-java" class="input" style="width:280px" placeholder="Автоматически" value="${esc(inst.javaPath || '')}" /></div>
      </div>
    </div>
    <div class="settings-group">
      <div class="setting stack">
        <div class="txt"><b>Версия и загрузчик</b><span>Смена версии может сломать моды и миры: сначала сделайте копию папки сборки.</span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <select class="select" id="is-loader" style="width:150px" aria-label="Загрузчик">${Object.entries(LOADERS).map(([k, v]) => `<option value="${k}" ${inst.loader === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          <select class="select" id="is-ver" style="width:150px" aria-label="Версия игры"><option>${esc(inst.version)}</option></select>
          <select class="select" id="is-lv" style="width:190px" aria-label="Версия загрузчика"></select>
          <button class="btn primary" data-apply-ver>Применить</button>
        </div>
      </div>
      <div class="setting">
        <div class="txt"><b>Размер окна игры</b><span>Пусто: используется значение из общих настроек.</span></div>
        <div class="ctl"><input id="is-w" class="input" type="number" min="640" style="width:100px" placeholder="ширина" value="${inst.gameWidth || ''}" aria-label="Ширина окна" />
          <span class="faint">×</span><input id="is-h" class="input" type="number" min="480" style="width:100px" placeholder="высота" value="${inst.gameHeight || ''}" aria-label="Высота окна" /></div>
      </div>
    </div>
    <div class="settings-group">
      <div class="setting">
        <div class="txt"><b>Экспорт в .mrpack</b><span>Сборка в формате Modrinth. Её можно импортировать в Оникс, приложение Modrinth, Prism и другие лаунчеры.</span></div>
        <div class="ctl"><button class="btn" data-export>${icon('upload')}Экспортировать</button></div>
      </div>
    </div>
    <div class="settings-group">
      <div class="setting">
        <div class="txt"><b>Проверить файлы</b><span>Сверит контрольные суммы всех файлов игры и скачает повреждённые, затем запустит игру.</span></div>
        <div class="ctl"><button class="btn" data-repair>${icon('wrench')}Проверить и запустить</button></div>
      </div>
      <div class="setting">
        <div class="txt"><b style="color:var(--danger)">Удалить сборку</b><span>Удалит папку сборки вместе с мирами, модами и скриншотами. Отменить будет нельзя.</span></div>
        <div class="ctl"><button class="btn danger" data-delete>${icon('trash')}Удалить сборку</button></div>
      </div>
    </div>`;

  const save = async (patch) => {
    try {
      await window.api.instances.update(inst.id, patch);
      Object.assign(inst, patch);
      await loadInstances();
      toast('Сохранено', '', 'success');
    } catch (err) {
      toast('Не удалось сохранить', err.message, 'error');
    }
  };
  $('[data-icon-pick]', body).addEventListener('click', async () => {
    try {
      const data = await window.api.instances.pickIcon();
      if (data) {
        await save({ iconData: data });
        renderSettings(body, inst);
      }
    } catch (err) {
      toast('Не удалось задать иконку', err.message, 'error');
    }
  });
  $('[data-icon-clear]', body).addEventListener('click', async () => {
    await save({ iconData: '' });
    renderSettings(body, inst);
  });
  $$('[data-hue]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      await save({ hue: Number(b.dataset.hue) });
      renderSettings(body, inst);
    })
  );
  $('#is-w', body).addEventListener('change', (e) => save({ gameWidth: Number(e.target.value) || 0 }));
  $('#is-h', body).addEventListener('change', (e) => save({ gameHeight: Number(e.target.value) || 0 }));
  setupVersionPicker(body, inst, save);
  $('[data-export]', body).addEventListener('click', () => exportDialog(inst));
  $('#is-name', body).addEventListener('change', (e) => e.target.value.trim() && save({ name: e.target.value.trim() }));
  $('#is-jvm', body).addEventListener('change', (e) => save({ jvmArgs: e.target.value.trim() }));
  Promise.all([window.api.java.list(), window.api.java.required(inst.version)]).then(([list, major]) => {
    const sel = $('#is-jprof', body);
    if (!sel) return;
    sel.innerHTML = javaOptions(list, inst.javaProfile || 'default', { withDefault: true });
    const need = $('[data-java-need]', body);
    if (need) need.textContent = `Версии ${inst.version} обычно нужна Java ${major}. «Автоматически» подберёт и скачает её сама.`;
  }).catch(() => {});
  $('#is-jprof', body).addEventListener('change', (e) => save({ javaProfile: e.target.value }));
  $('#is-java', body).addEventListener('change', (e) => save({ javaPath: e.target.value.trim() }));
  $('[data-mem-custom]', body).addEventListener('click', (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    $('#is-mem', body).disabled = !on;
    save({ memoryMax: on ? Number($('#is-mem', body).value) : 0 });
  });
  $('#is-mem', body).addEventListener('change', (e) => save({ memoryMax: Number(e.target.value) }));
  $('[data-repair]', body).addEventListener('click', async () => {
    if (state.running.has(inst.id) || state.progress[inst.id]) return;
    state.progress[inst.id] = { stage: 'Проверка файлов', done: 0, total: 0 };
    updateLive();
    try {
      await window.api.instances.launch(inst.id, { repair: true });
    } catch (err) {
      delete state.progress[inst.id];
      updateLive();
      toast('Не удалось запустить игру', err.message, 'error');
    }
  });
  $('[data-delete]', body).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Удалить «${inst.name}»?`,
      text: 'Сборка, её миры, моды и настройки будут удалены без возможности восстановления.',
      action: 'Удалить сборку',
    });
    if (!ok) return;
    await window.api.instances.remove(inst.id);
    await loadInstances();
    navigate('/library');
    toast('Сборка удалена', '', 'success');
  });
}

async function setupVersionPicker(body, inst, save) {
  const loaderSel = $('#is-loader', body);
  const verSel = $('#is-ver', body);
  const lvSel = $('#is-lv', body);
  const fillLoaderVersions = async () => {
    if (loaderSel.value === 'vanilla') {
      lvSel.innerHTML = '<option value="">—</option>';
      lvSel.disabled = true;
      return;
    }
    lvSel.disabled = false;
    lvSel.innerHTML = '<option value="">Загрузка…</option>';
    try {
      const list = await window.api.versions.loaders(loaderSel.value, verSel.value);
      lvSel.innerHTML = '<option value="">Последняя стабильная</option>' + list.map((l) => `<option value="${esc(l.version)}">${esc(l.version)}${l.stable ? '' : ' · бета'}</option>`).join('');
      if (loaderSel.value === inst.loader && verSel.value === inst.version && inst.loaderVersion) lvSel.value = inst.loaderVersion;
    } catch {
      lvSel.innerHTML = '<option value="">Последняя стабильная</option>';
    }
  };
  const fillVersions = async () => {
    try {
      const data = await loadVersions();
      let list = data.versions.filter((v) => v.type === 'release' || v.id === inst.version);
      if (loaderSel.value !== 'vanilla') {
        const supported = new Set(await window.api.versions.loaderGames(loaderSel.value));
        list = list.filter((v) => supported.has(v.id) || v.id === inst.version);
      }
      const prev = verSel.value || inst.version;
      verSel.innerHTML = list.map((v) => `<option value="${esc(v.id)}">${esc(v.id)}</option>`).join('');
      verSel.value = list.some((v) => v.id === prev) ? prev : list[0] && list[0].id;
    } catch {
      /* без сети остаётся текущая версия */
    }
    fillLoaderVersions();
  };
  loaderSel.addEventListener('change', fillVersions);
  verSel.addEventListener('change', fillLoaderVersions);
  $('[data-apply-ver]', body).addEventListener('click', () => save({ loader: loaderSel.value, version: verSel.value, loaderVersion: loaderSel.value === 'vanilla' ? '' : lvSel.value }));
  fillVersions();
}

function exportDialog(inst) {
  const opt = (id, label, on, hint = '') => `<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="margin-top:3px" />
    <span><b style="font-weight:600">${label}</b>${hint ? `<span class="faint" style="display:block;font-size:12.5px">${hint}</span>` : ''}</span></label>`;
  openModal(
    `<div class="modal-head"><h2>Экспорт сборки</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
     <div class="modal-body">
       <div class="two-col">
         <div class="field"><label for="ex-name">Название</label><input id="ex-name" class="input" value="${esc(inst.name)}" maxlength="64" /></div>
         <div class="field"><label for="ex-ver">Версия сборки</label><input id="ex-ver" class="input" value="1.0.0" maxlength="24" /></div>
       </div>
       <div class="field"><label for="ex-sum">Описание</label><input id="ex-sum" class="input" maxlength="200" /></div>
       <div style="display:grid;gap:12px">
         ${opt('ex-cfg', 'Конфиги модов (папка config)', true)}
         ${opt('ex-rp', 'Ресурспаки', true)}
         ${opt('ex-sh', 'Шейдеры', true)}
         ${opt('ex-opt', 'Настройки игры (options.txt)', false)}
         ${opt('ex-srv', 'Список серверов (servers.dat)', false)}
         ${opt('ex-world', 'Миры (папка saves)', false, 'Архив может получиться очень большим.')}
       </div>
       <span class="faint" style="font-size:12.5px">Моды, которые есть на Modrinth, записываются ссылками, остальные кладутся внутрь архива.</span>
     </div>
     <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" data-go>${icon('upload')}Экспортировать</button></div>`,
    {
      onMount: (m, close) => {
        $('[data-go]', m).addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          const stop = progressModal('Экспорт сборки', `export:${inst.id}`);
          try {
            const res = await window.api.instances.exportMrpack(inst.id, {
              name: $('#ex-name', m).value.trim(),
              version: $('#ex-ver', m).value.trim(),
              summary: $('#ex-sum', m).value.trim(),
              config: $('#ex-cfg', m).checked,
              resourcepacks: $('#ex-rp', m).checked,
              shaderpacks: $('#ex-sh', m).checked,
              options: $('#ex-opt', m).checked,
              servers: $('#ex-srv', m).checked,
              worlds: $('#ex-world', m).checked,
            });
            stop();
            if (res) {
              close();
              toast('Сборка экспортирована', `${res.linked} по ссылкам Modrinth, ${res.bundled} внутри архива${res.lookupFailed ? '. Modrinth недоступен, поэтому все файлы положены в архив.' : ''}`, 'success');
            } else e.currentTarget.disabled = false;
          } catch (err) {
            stop();
            e.currentTarget.disabled = false;
            toast('Не удалось экспортировать', err.message, 'error');
          }
        });
      },
    }
  );
}

const supportsQuickPlay = (v) => !/^1\.\d/.test(v) || Number(v.split('.')[1]) >= 20;
const MODES = ['Выживание', 'Творчество', 'Приключение', 'Наблюдатель'];

async function renderWorlds(body, inst) {
  body.innerHTML = '<div class="skeleton" style="height:160px"></div>';
  const worlds = await window.api.instances.worlds(inst.id).catch(() => []);
  const running = state.running.has(inst.id);
  const ok = supportsQuickPlay(inst.version);
  if (!worlds.length) {
    body.innerHTML = `<div class="empty"><div class="icon-wrap">${icon('globe')}</div><h3>Миров пока нет</h3><p>Запустите игру и создайте мир — он появится здесь, и в него можно будет заходить прямо из лаунчера.</p></div>`;
    return;
  }
  body.innerHTML = `${ok ? '' : `<div class="target-banner">${icon('info')}<div class="grow muted">Вход сразу в мир работает с Minecraft 1.20 и новее. В этой версии выберите мир в самой игре.</div></div>`}
    <div class="entry-list">${worlds
      .map(
        (w) => `<div class="entry">
        ${w.icon ? `<img class="thumb" src="${w.icon}" alt="" />` : `<div class="thumb">${icon('globe')}</div>`}
        <div style="min-width:0"><div class="t">${esc(w.name)}</div>
          <div class="s">${w.hardcore ? 'Хардкор' : MODES[w.gameType] || 'Мир'} · ${esc(timeAgo(w.lastPlayed))} · папка ${esc(w.folder)}</div></div>
        <div class="acts"><button class="btn sm primary" data-world="${esc(w.folder)}" data-label="${esc(w.name)}" ${ok && !running ? '' : 'disabled'}>${icon('play')}Играть</button></div>
      </div>`
      )
      .join('')}</div>`;
  $$('[data-world]', body).forEach((b) => b.addEventListener('click', () => togglePlay(inst.id, { type: 'world', name: b.dataset.world, label: b.dataset.label || b.dataset.world })));
}

async function renderServers(body, inst) {
  const running = state.running.has(inst.id);
  let servers = [];
  const draw = async () => {
    servers = await window.api.instances.servers(inst.id).catch(() => []);
    body.innerHTML = `<div class="toolbar" style="margin-bottom:14px;justify-content:space-between">
        <span class="muted">Серверы из игры и добавленные здесь</span>
        <button class="btn primary" data-add-server>${icon('plus')}Добавить сервер</button></div>
      ${
        servers.length
          ? `<div class="entry-list">${servers
              .map(
                (sv) => `<div class="entry" data-sv="${esc(sv.address)}">
              <div class="thumb" data-fav>${icon('server')}</div>
              <div style="min-width:0"><div class="t">${esc(sv.name)}</div>
                <div class="s" data-motd>${esc(sv.address)}</div></div>
              <div class="acts"><span class="ping" data-ping><i></i>…</span>
                <button class="btn sm primary" data-join="${esc(sv.address)}" data-label="${esc(sv.name)}" ${running ? 'disabled' : ''}>${icon('play')}Зайти</button>
                ${sv.fromGame ? '' : `<button class="btn ghost sm icon-only" data-del="${esc(sv.address)}" aria-label="Удалить сервер">${icon('trash')}</button>`}</div>
            </div>`
              )
              .join('')}</div>`
          : `<div class="empty"><div class="icon-wrap">${icon('server')}</div><h3>Серверов пока нет</h3><p>Добавьте адрес — лаунчер покажет, сколько игроков онлайн, и запустит игру сразу на сервере.</p>
             <button class="btn primary" data-add-server>${icon('plus')}Добавить сервер</button></div>`
      }`;
    $$('[data-add-server]', body).forEach((b) => b.addEventListener('click', addDialog));
    $$('[data-join]', body).forEach((b) => b.addEventListener('click', () => togglePlay(inst.id, { type: 'server', address: b.dataset.join, label: b.dataset.label || b.dataset.join })));
    $$('[data-del]', body).forEach((b) =>
      b.addEventListener('click', async () => {
        await window.api.instances.removeServer(inst.id, b.dataset.del);
        draw();
      })
    );
    pingAll();
  };

  const pingAll = async () => {
    const queue = [...servers];
    const worker = async () => {
      while (queue.length) {
        const sv = queue.shift();
        const res = await window.api.instances.ping(sv.address).catch(() => ({ ok: false }));
        if (!body.isConnected) return;
        const row = $$('[data-sv]', body).find((r) => r.dataset.sv === sv.address);
        if (!row) continue;
        const ping = $('[data-ping]', row);
        ping.className = `ping ${res.ok ? 'ok' : 'bad'}`;
        ping.innerHTML = res.ok ? `<i></i>${res.online ?? '?'} / ${res.max ?? '?'} · ${res.latency} мс` : '<i></i>не отвечает';
        if (res.ok) {
          if (res.motd) $('[data-motd]', row).textContent = res.motd;
          if (res.favicon) $('[data-fav]', row).innerHTML = `<img class="thumb" src="${res.favicon}" alt="" />`;
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };

  const addDialog = () =>
    openModal(
      `<div class="modal-head"><h2>Новый сервер</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
       <div class="modal-body">
         <div class="field"><label for="sv-name">Название</label><input id="sv-name" class="input" maxlength="40" autocomplete="off" /></div>
         <div class="field"><label for="sv-addr">Адрес</label><input id="sv-addr" class="input" autocomplete="off" placeholder="play.example.com" /><span class="error" data-err></span></div>
       </div>
       <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" data-save>Добавить</button></div>`,
      {
        onMount: (m, close) => {
          const save = async () => {
            try {
              await window.api.instances.addServer(inst.id, $('#sv-name', m).value, $('#sv-addr', m).value);
              close();
              draw();
            } catch (err) {
              $('[data-err]', m).textContent = err.message;
            }
          };
          $('[data-save]', m).addEventListener('click', save);
          $('#sv-addr', m).addEventListener('keydown', (e) => e.key === 'Enter' && save());
        },
      }
    );
  draw();
}

export { togglePlay };
