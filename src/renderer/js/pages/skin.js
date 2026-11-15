// Страница скина: 3D-предпросмотр, библиотека скинов, плащи, загрузка (Microsoft) и Ely.by для «пиратских» аккаунтов.
import { state, currentAccount, loadAccounts } from '../state.js';
import { icon } from '../icons.js';
import { esc, $, $$, avatar, toast, ACCOUNT_KIND } from '../ui.js';
import { openAccounts } from '../modals.js';
import { createViewer } from '../skin3d.js';

const headStyle = (url) => `background-image:url('${url}'),url('${url}');background-size:448px 448px,448px 448px;background-position:-56px -56px,-280px -56px`;
const capeStyle = (url) => `background-image:url('${url}');background-size:282px 141px;background-position:-4.4px -4.4px;width:44px;height:70px`;

export async function renderSkin(view) {
  const acc = currentAccount();
  if (!acc) {
    view.innerHTML = `<div class="view-inner"><h1 style="margin-bottom:20px">Скин</h1>
      <div class="empty"><div class="icon-wrap">${icon('user')}</div><h3>Сначала добавьте аккаунт</h3><p>Для лицензии скин меняется здесь, для пиратских аккаунтов через Ely.by.</p>
      <button class="btn primary" data-open-acc>${icon('user')}Открыть аккаунты</button></div></div>`;
    $('[data-open-acc]', view).addEventListener('click', openAccounts);
    return;
  }

  view.innerHTML = `<div class="view-inner">
    <div class="section-head" style="margin-bottom:20px"><div><h1>Скин</h1><div class="muted" style="margin-top:4px">${state.settings.hideSkinName ? ACCOUNT_KIND[acc.type] : `${esc(acc.name)} · ${ACCOUNT_KIND[acc.type]}`}</div></div>
      <div style="display:flex;align-items:center;gap:10px">${avatar(acc, 'lg')}</div></div>
    <div class="skin-stage">
      <div style="position:relative"><div data-viewer></div>
        <div class="p3-bar">
          <button class="btn sm" data-face="front">Спереди</button>
          <button class="btn sm" data-face="back">Сзади</button>
          <button class="btn sm" data-spin>${icon('refresh')}Вращать</button>
          <button class="btn sm" data-cape-toggle hidden>Плащ</button>
        </div></div>
      <div class="skin-col" data-panel><div class="skeleton" style="height:200px"></div></div>
    </div></div>`;

  const viewer = createViewer($('[data-viewer]', view), { lowPower: !!state.settings.lowPower });
  const bar = (sel) => $(sel, view);
  bar('[data-face="front"]').addEventListener('click', () => viewer.face('front'));
  bar('[data-face="back"]').addEventListener('click', () => viewer.face('back'));
  bar('[data-spin]').addEventListener('click', () => viewer.setAuto(!viewer.isAuto()));

  let profile;
  try {
    profile = await window.api.skins.profile(acc.id);
  } catch (err) {
    $('[data-panel]', view).innerHTML = `<div class="empty"><h3>Не удалось получить скин</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  if (!view.isConnected) return;

  const panel = $('[data-panel]', view);
  let slim = profile.variant === 'slim';
  let skinSrc = profile.skinUrl || null; // что сейчас показано в превью
  let showCape = true;
  let library = [];
  let selected = null; // выбранный в библиотеке скин
  let picked = null; // файл, выбранный с диска

  const activeCape = () => (profile.capes || []).find((c) => c.active) || null;
  const preview = () => viewer.set({ skin: skinSrc, slim, cape: activeCape() ? activeCape().url : null, showCape });
  const capeBtn = bar('[data-cape-toggle]');
  capeBtn.hidden = !activeCape();
  capeBtn.addEventListener('click', () => {
    showCape = !showCape;
    capeBtn.classList.toggle('primary', showCape);
    preview();
  });
  capeBtn.classList.toggle('primary', true);
  preview();

  const isMsa = profile.type === 'msa';

  async function loadLibrary() {
    try {
      library = await window.api.skinlib.list();
    } catch {
      library = [];
    }
  }
  await loadLibrary();

  const refreshProfile = async () => {
    profile = await window.api.skins.profile(acc.id);
    skinSrc = profile.skinUrl || null;
    slim = profile.variant === 'slim';
    capeBtn.hidden = !activeCape();
    preview();
    await loadAccounts();
  };

  const draw = () => {
    const libHtml = `<section>
      <div class="section-head"><h2>Библиотека скинов</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${profile.skinUrl ? `<button class="btn sm" data-save-current>${icon('plus')}Сохранить текущий</button>` : ''}
          <button class="btn sm" data-lib-add>${icon('folder')}Добавить файл…</button></div></div>
      ${
        library.length
          ? `<div class="skin-grid">${library
              .map(
                (it) => `<div class="skin-card ${selected === it.id ? 'on' : ''}" data-lib="${esc(it.id)}" tabindex="0" role="button" aria-label="Выбрать скин ${esc(it.name)}">
                  <div class="head" style="${headStyle(it.dataUrl)}"></div><b>${esc(it.name)}</b><span class="sub">${it.variant === 'slim' ? 'Тонкая' : 'Обычная'} модель</span>
                  <button class="x" data-lib-del="${esc(it.id)}" aria-label="Удалить из библиотеки" title="Удалить из библиотеки">${icon('x')}</button></div>`
              )
              .join('')}</div>`
          : `<div class="faint">Здесь будут ваши скины. Добавьте PNG 64×64 или сохраните текущий скин: переключаться можно одним нажатием.</div>`
      }
      ${
        selected
          ? `<div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
              ${isMsa ? `<button class="btn primary" data-lib-apply>${icon('upload')}Применить к аккаунту</button>` : `<span class="faint">Для этого аккаунта скин только в предпросмотре: ${profile.type === 'ely' ? 'загрузите его на Ely.by' : 'у офлайн-аккаунта нет скина'}.</span>`}
              <div class="segmented" data-lib-model><button data-m="classic" class="${library.find((x) => x.id === selected).variant === 'slim' ? '' : 'active'}">Обычная</button><button data-m="slim" class="${library.find((x) => x.id === selected).variant === 'slim' ? 'active' : ''}">Тонкая</button></div>
            </div>`
          : ''
      }
    </section>`;

    const capesHtml = isMsa
      ? `<section><div class="section-head"><h2>Плащи</h2></div>
          ${
            (profile.capes || []).length
              ? `<div class="skin-grid">
                  <div class="skin-card cape-card ${activeCape() ? '' : 'on'}" data-cape="" tabindex="0" role="button"><div class="head" style="background-color:var(--surface-3);width:44px;height:70px"></div><b>Без плаща</b></div>
                  ${profile.capes
                    .map(
                      (c) => `<div class="skin-card cape-card ${c.active ? 'on' : ''}" data-cape="${esc(c.id)}" tabindex="0" role="button" aria-label="Надеть плащ ${esc(c.alias)}"><div class="head" style="${capeStyle(c.url)}"></div><b>${esc(c.alias)}</b>${c.active ? '<span class="sub">Надет</span>' : ''}</div>`
                    )
                    .join('')}</div>`
              : `<div class="faint">У аккаунта пока нет плащей. Они выдаются Mojang за события и награды, например за участие в Minecon или за покупку игры в определённые периоды.</div>`
          }
        </section>`
      : '';

    let accountHtml = '';
    if (isMsa) {
      accountHtml = `<section><div class="settings-group">
        <div class="setting stack"><div class="txt"><b>Загрузить новый скин</b><span>PNG 64×64 пикселя. Скин сразу применится к вашему аккаунту Microsoft.</span></div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn" data-pick>${icon('folder')}Выбрать файл…</button>
            <div class="segmented" data-model>
              <button data-m="classic" class="${slim ? '' : 'active'}">Обычная (4 px)</button>
              <button data-m="slim" class="${slim ? 'active' : ''}">Тонкая (3 px)</button>
            </div>
            <button class="btn primary" data-apply ${picked ? '' : 'disabled'}>${icon('upload')}Применить</button>
          </div>
          <span class="faint" style="font-size:12.5px">${picked ? esc(picked.path) : 'Файл не выбран'}</span>
        </div>
        <div class="setting"><div class="txt"><b>Сбросить скин</b><span>Вернёт стандартный скин Стива или Алекс.</span></div>
          <div class="ctl"><button class="btn danger" data-reset>Сбросить</button></div></div>
      </div></section>`;
    } else if (profile.type === 'ely') {
      accountHtml = `<section><div class="settings-group">
        <div class="setting"><div class="txt"><b>Скин на Ely.by</b><span>Для пиратских аккаунтов скин хранится на Ely.by. Загрузите или смените его на сайте, затем нажмите «Обновить превью».</span></div></div>
        <div class="setting"><div class="txt"><b>Изменить скин</b><span>Откроется сайт Ely.by в браузере.</span></div>
          <div class="ctl"><button class="btn primary" data-ely>${icon('external')}Открыть Ely.by</button><button class="btn" data-refresh>${icon('refresh')}Обновить превью</button></div></div>
      </div></section>`;
    } else {
      accountHtml = `<section><div class="settings-group">
        <div class="setting"><div class="txt"><b>У офлайн-аккаунта нет скина</b><span>Он создан без входа на сервер авторизации, поэтому скин ему негде хранить. Подключите аккаунт Ely.by: скин будет виден в игре, а менять его можно на сайте.</span></div></div>
        <div class="setting"><div class="txt"><b>Подключить Ely.by</b><span>Бесплатная регистрация на ely.by.</span></div>
          <div class="ctl"><button class="btn primary" data-connect>${icon('key')}Войти через Ely.by</button></div></div>
      </div></section>`;
    }

    panel.innerHTML = libHtml + capesHtml + accountHtml;
    wire();
  };

  const guard = async (fn, okMsg, errTitle) => {
    try {
      await fn();
      if (okMsg) toast(okMsg[0], okMsg[1] || '', 'success');
    } catch (err) {
      toast(errTitle, err.message, 'error');
    }
    draw();
  };

  function wire() {
    $$('[data-lib]', panel).forEach((el) => {
      const pick = () => {
        selected = selected === el.dataset.lib ? null : el.dataset.lib;
        const it = library.find((x) => x.id === selected);
        if (it) {
          skinSrc = it.dataUrl;
          slim = it.variant === 'slim';
        } else {
          skinSrc = profile.skinUrl || null;
          slim = profile.variant === 'slim';
        }
        preview();
        draw();
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
    });
    $$('[data-lib-del]', panel).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        guard(async () => {
          library = await window.api.skinlib.remove(b.dataset.libDel);
          if (selected === b.dataset.libDel) {
            selected = null;
            skinSrc = profile.skinUrl || null;
            slim = profile.variant === 'slim';
            preview();
          }
        }, ['Удалено из библиотеки'], 'Не удалось удалить');
      })
    );
    const add = $('[data-lib-add]', panel);
    if (add)
      add.addEventListener('click', () =>
        guard(async () => {
          const f = await window.api.skins.pick();
          if (!f) return;
          library = await window.api.skinlib.addFile(f.path, '', 'classic');
        }, null, 'Не удалось добавить скин')
      );
    const cur = $('[data-save-current]', panel);
    if (cur)
      cur.addEventListener('click', () =>
        guard(async () => {
          library = await window.api.skinlib.addUrl(profile.skinUrl, acc.name, profile.variant === 'slim' ? 'slim' : 'classic');
        }, ['Скин сохранён в библиотеку'], 'Не удалось сохранить скин')
      );
    $$('[data-lib-model] [data-m]', panel).forEach((b) =>
      b.addEventListener('click', () =>
        guard(async () => {
          library = await window.api.skinlib.variant(selected, b.dataset.m);
          slim = b.dataset.m === 'slim';
          preview();
        }, null, 'Не удалось изменить модель')
      )
    );
    const apply = $('[data-lib-apply]', panel);
    if (apply)
      apply.addEventListener('click', (e) => {
        e.currentTarget.disabled = true;
        guard(async () => {
          await window.api.skinlib.apply(acc.id, selected);
          selected = null;
          await refreshProfile();
        }, ['Скин применён', 'Он появится в игре при следующем входе.'], 'Не удалось сменить скин');
      });
    $$('[data-cape]', panel).forEach((el) => {
      const go = () =>
        guard(async () => {
          profile = await window.api.skins.setCape(acc.id, el.dataset.cape || null);
          capeBtn.hidden = !activeCape();
          preview();
        }, [el.dataset.cape ? 'Плащ надет' : 'Плащ снят'], 'Не удалось сменить плащ');
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
    });
    const pickBtn = $('[data-pick]', panel);
    if (pickBtn) {
      pickBtn.addEventListener('click', async () => {
        const f = await window.api.skins.pick();
        if (!f) return;
        picked = f;
        selected = null;
        skinSrc = f.dataUrl;
        preview();
        draw();
      });
      $$('[data-model] [data-m]', panel).forEach((b) =>
        b.addEventListener('click', () => {
          slim = b.dataset.m === 'slim';
          preview();
          draw();
        })
      );
      $('[data-apply]', panel).addEventListener('click', (e) => {
        e.currentTarget.disabled = true;
        guard(async () => {
          profile = await window.api.skins.set(acc.id, picked.path, slim ? 'slim' : 'classic');
          picked = null;
          await refreshProfile();
        }, ['Скин обновлён', 'Он появится в игре при следующем входе.'], 'Не удалось сменить скин');
      });
      $('[data-reset]', panel).addEventListener('click', () =>
        guard(async () => {
          profile = await window.api.skins.reset(acc.id);
          picked = null;
          await refreshProfile();
        }, ['Скин сброшен'], 'Не удалось сбросить')
      );
    }
    const ely = $('[data-ely]', panel);
    if (ely) {
      ely.addEventListener('click', () => window.api.app.openExternal('https://ely.by/skins'));
      $('[data-refresh]', panel).addEventListener('click', () =>
        guard(async () => {
          await refreshProfile();
        }, ['Превью обновлено'], 'Не удалось обновить')
      );
    }
    const connect = $('[data-connect]', panel);
    if (connect) connect.addEventListener('click', openAccounts);
  }

  draw();
}
