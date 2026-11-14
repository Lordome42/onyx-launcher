// Страница скина: превью, загрузка скина (Microsoft) и переход на Ely.by для «пиратских» аккаунтов.
import { currentAccount, loadAccounts } from '../state.js';
import { icon } from '../icons.js';
import { esc, $, $$, avatar, toast, ACCOUNT_KIND } from '../ui.js';
import { openAccounts } from '../modals.js';

// Рисует вид спереди (16×32 пикселя) из текстуры скина 64×64 или 64×32.
function drawSkin(canvas, img, slim) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 32);
  const legacy = img.height === 32;
  const arm = slim ? 3 : 4;
  const part = (sx, sy, sw, sh, dx, dy, flip = false) => {
    if (flip) {
      ctx.save();
      ctx.translate(dx + sw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      ctx.restore();
    } else ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
  };
  // база
  part(8, 8, 8, 8, 4, 0);
  part(20, 20, 8, 12, 4, 8);
  part(44, 20, arm, 12, slim ? 1 : 0, 8);
  part(4, 20, 4, 12, 4, 20);
  if (legacy) {
    part(44, 20, arm, 12, 12, 8, true);
    part(4, 20, 4, 12, 8, 20, true);
  } else {
    part(36, 52, arm, 12, 12, 8);
    part(20, 52, 4, 12, 8, 20);
  }
  // второй слой
  part(40, 8, 8, 8, 4, 0);
  if (!legacy) {
    part(20, 36, 8, 12, 4, 8);
    part(44, 36, arm, 12, slim ? 1 : 0, 8);
    part(52, 52, arm, 12, 12, 8);
    part(4, 36, 4, 12, 4, 20);
    part(4, 52, 4, 12, 8, 20);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение скина'));
    img.src = src;
  });
}

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
    <div class="section-head" style="margin-bottom:20px"><div><h1>Скин</h1><div class="muted" style="margin-top:4px">${esc(acc.name)} · ${ACCOUNT_KIND[acc.type]}</div></div>
      <div style="display:flex;align-items:center;gap:10px">${avatar(acc, 'lg')}</div></div>
    <div class="skin-stage">
      <div class="skin-preview"><canvas width="16" height="32" data-canvas></canvas></div>
      <div data-panel><div class="skeleton" style="height:200px"></div></div>
    </div></div>`;

  let profile;
  try {
    profile = await window.api.skins.profile(acc.id);
  } catch (err) {
    $('[data-panel]', view).innerHTML = `<div class="empty"><h3>Не удалось получить скин</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  if (!view.isConnected) return;

  const canvas = $('[data-canvas]', view);
  let slim = profile.variant === 'slim';
  let image = null;
  const paint = async (src) => {
    try {
      image = await loadImage(src);
      drawSkin(canvas, image, slim);
    } catch {
      /* превью недоступно */
    }
  };
  if (profile.skinUrl) paint(profile.skinUrl);
  else paint('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'));

  const panel = $('[data-panel]', view);

  if (profile.type === 'msa') {
    let picked = null;
    const draw = () => {
      panel.innerHTML = `<div class="settings-group">
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
      </div>`;
      $('[data-pick]', panel).addEventListener('click', async () => {
        const f = await window.api.skins.pick();
        if (!f) return;
        picked = f;
        await paint(f.dataUrl);
        draw();
      });
      $$('[data-m]', panel).forEach((b) =>
        b.addEventListener('click', () => {
          slim = b.dataset.m === 'slim';
          if (image) drawSkin(canvas, image, slim);
          draw();
        })
      );
      $('[data-apply]', panel).addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          profile = await window.api.skins.set(acc.id, picked.path, slim ? 'slim' : 'classic');
          picked = null;
          await loadAccounts();
          toast('Скин обновлён', 'Он появится в игре при следующем входе.', 'success');
          draw();
        } catch (err) {
          toast('Не удалось сменить скин', err.message, 'error');
          draw();
        }
      });
      $('[data-reset]', panel).addEventListener('click', async () => {
        try {
          profile = await window.api.skins.reset(acc.id);
          picked = null;
          if (profile.skinUrl) await paint(profile.skinUrl);
          else if (image) canvas.getContext('2d').clearRect(0, 0, 16, 32);
          toast('Скин сброшен', '', 'success');
        } catch (err) {
          toast('Не удалось сбросить', err.message, 'error');
        }
      });
    };
    draw();
    return;
  }

  if (profile.type === 'ely') {
    panel.innerHTML = `<div class="settings-group">
      <div class="setting"><div class="txt"><b>Скин на Ely.by</b><span>Для пиратских аккаунтов скин хранится на Ely.by. Загрузите или смените его на сайте, затем нажмите «Обновить превью» — в игре он появится при следующем запуске.</span></div></div>
      <div class="setting"><div class="txt"><b>Изменить скин</b><span>Откроется сайт Ely.by в браузере.</span></div>
        <div class="ctl"><button class="btn primary" data-ely>${icon('external')}Открыть Ely.by</button><button class="btn" data-refresh>${icon('refresh')}Обновить превью</button></div></div>
    </div>`;
    $('[data-ely]', panel).addEventListener('click', () => window.api.app.openExternal('https://ely.by/skins'));
    $('[data-refresh]', panel).addEventListener('click', async () => {
      const p = await window.api.skins.profile(acc.id);
      await paint(p.skinUrl);
      toast('Превью обновлено', '', 'success');
    });
    return;
  }

  panel.innerHTML = `<div class="settings-group">
    <div class="setting"><div class="txt"><b>У офлайн-аккаунта нет скина</b><span>Он создан без входа на сервер авторизации, поэтому скин ему негде хранить. Подключите аккаунт Ely.by — скин будет виден в игре, а менять его можно на сайте Ely.by.</span></div></div>
    <div class="setting"><div class="txt"><b>Подключить Ely.by</b><span>Бесплатная регистрация на ely.by.</span></div>
      <div class="ctl"><button class="btn primary" data-connect>${icon('key')}Войти через Ely.by</button></div></div>
  </div>`;
  $('[data-connect]', panel).addEventListener('click', openAccounts);
}
