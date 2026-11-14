// Окно создания сборки и всплывающее меню аккаунтов.
import { state, loadInstances, loadAccounts, loadVersions, currentAccount } from './state.js';
import { icon } from './icons.js';
import { $, $$, esc, cube, avatar, msLogo, openModal, toast, LOADERS, ACCOUNT_KIND } from './ui.js';
import { navigate } from './router.js';

const HUES = [262, 222, 190, 160, 125, 85, 40, 15, 340, 300];
const loaderGamesCache = {};

export async function openCreateInstance() {
  let hue = HUES[Math.floor(Math.random() * HUES.length)];
  let loader = 'vanilla';
  let showSnapshots = !!state.settings.showSnapshots;

  const close = openModal(
    `<div class="modal-head"><h2>Новая сборка</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
     <div class="modal-body">
       <div class="hue-row">
         <span data-cube>${cube(hue)}</span>
         <div class="field" style="flex:1">
           <label for="ci-name">Название</label>
           <input id="ci-name" class="input" maxlength="48" autocomplete="off" />
         </div>
       </div>
       <div class="field"><span class="label">Цвет значка</span>
         <div class="hue-swatches">${HUES.map((h) => `<button type="button" data-hue="${h}" aria-label="Оттенок ${h}" style="background:hsl(${h} 65% 55%)" class="${h === hue ? 'active' : ''}"></button>`).join('')}</div>
       </div>
       <div class="field"><span class="label">Загрузчик</span>
         <div class="segmented" data-loaders>
           ${Object.entries(LOADERS).map(([k, v]) => `<button type="button" data-loader="${k}" class="${k === loader ? 'active' : ''}"><i style="width:8px;height:8px;border-radius:2px;background:${v.color}"></i>${v.label}</button>`).join('')}
         </div>
         <span class="hint" data-loader-hint>Чистая игра без модов.</span>
       </div>
       <div class="two-col">
         <div class="field">
           <label for="ci-version">Версия игры</label>
           <select id="ci-version" class="select"><option>Загрузка…</option></select>
         </div>
         <div class="field" data-lv-field style="display:none">
           <label for="ci-lv">Версия загрузчика</label>
           <select id="ci-lv" class="select"></select>
         </div>
       </div>
       <label style="display:flex;align-items:center;gap:10px;cursor:pointer" class="muted">
         <button type="button" class="toggle ${showSnapshots ? 'on' : ''}" data-snapshots aria-label="Показывать снапшоты"></button>
         Показывать снапшоты и старые версии
       </label>
       <span class="error" data-error style="color:var(--danger);font-size:12.5px"></span>
     </div>
     <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" data-create>${icon('plus')}Создать сборку</button></div>`,
    {
      onMount: (m) => {
        const versionSel = $('#ci-version', m);
        const lvSel = $('#ci-lv', m);
        const nameInput = $('#ci-name', m);

        const fillVersions = async () => {
          versionSel.disabled = true;
          try {
            const data = await loadVersions();
            let list = data.versions.filter((v) => showSnapshots || v.type === 'release');
            if (loader !== 'vanilla') {
              loaderGamesCache[loader] ||= new Set(await window.api.versions.loaderGames(loader));
              list = list.filter((v) => loaderGamesCache[loader].has(v.id));
            }
            const prev = versionSel.value;
            versionSel.innerHTML = list
              .map((v) => `<option value="${esc(v.id)}">${esc(v.id)}${v.type !== 'release' ? ` · ${v.type === 'snapshot' ? 'снапшот' : v.type.replace('old_', '')}` : ''}</option>`)
              .join('');
            if (list.some((v) => v.id === prev)) versionSel.value = prev;
            nameInput.placeholder = `Minecraft ${versionSel.value}`;
            await fillLoaderVersions();
          } catch (err) {
            versionSel.innerHTML = '<option>Нет соединения</option>';
            $('[data-error]', m).textContent = 'Не удалось получить список версий. Проверьте подключение к интернету и попробуйте снова.';
          } finally {
            versionSel.disabled = false;
          }
        };

        const fillLoaderVersions = async () => {
          const field = $('[data-lv-field]', m);
          if (loader === 'vanilla') {
            field.style.display = 'none';
            return;
          }
          field.style.display = '';
          lvSel.innerHTML = '<option value="">Загрузка…</option>';
          try {
            const list = await window.api.versions.loaders(loader, versionSel.value);
            lvSel.innerHTML =
              `<option value="">Последняя стабильная</option>` +
              list.map((l) => `<option value="${esc(l.version)}">${esc(l.version)}${l.stable ? '' : ' · бета'}</option>`).join('');
          } catch {
            lvSel.innerHTML = '<option value="">Последняя стабильная</option>';
          }
        };

        $$('[data-hue]', m).forEach((b) =>
          b.addEventListener('click', () => {
            hue = Number(b.dataset.hue);
            $$('[data-hue]', m).forEach((x) => x.classList.toggle('active', x === b));
            $('[data-cube]', m).innerHTML = cube(hue);
          })
        );
        const hints = { vanilla: 'Чистая игра без модов.', fabric: 'Лёгкий и быстрый загрузчик, большинство современных модов.', quilt: 'Форк Fabric, совместим с большинством Fabric-модов.', forge: 'Классический загрузчик, самые большие сборки. Первая установка занимает несколько минут.', neoforge: 'Современный наследник Forge для новых версий. Первая установка занимает несколько минут.' };
        $$('[data-loader]', m).forEach((b) =>
          b.addEventListener('click', () => {
            loader = b.dataset.loader;
            $$('[data-loader]', m).forEach((x) => x.classList.toggle('active', x === b));
            $('[data-loader-hint]', m).textContent = hints[loader];
            fillVersions();
          })
        );
        $('[data-snapshots]', m).addEventListener('click', (e) => {
          showSnapshots = !showSnapshots;
          e.currentTarget.classList.toggle('on', showSnapshots);
          fillVersions();
        });
        versionSel.addEventListener('change', () => {
          nameInput.placeholder = `Minecraft ${versionSel.value}`;
          fillLoaderVersions();
        });

        $('[data-create]', m).addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          if (!versionSel.value || versionSel.disabled) return;
          btn.disabled = true;
          try {
            const inst = await window.api.instances.create({
              name: nameInput.value.trim() || nameInput.placeholder,
              version: versionSel.value,
              loader,
              loaderVersion: loader === 'vanilla' ? '' : lvSel.value,
              hue,
            });
            await loadInstances();
            close();
            toast('Сборка создана', 'Файлы игры скачаются при первом запуске.', 'success');
            navigate(`/instance/${inst.id}`);
          } catch (err) {
            $('[data-error]', m).textContent = err.message;
            btn.disabled = false;
          }
        });

        fillVersions();
      },
    }
  );
}

// ---------- Аккаунты ----------
let popover = null;

export function closeAccounts() {
  if (popover) {
    popover.remove();
    popover = null;
    document.removeEventListener('mousedown', outside, true);
  }
}

function outside(e) {
  if (popover && !popover.contains(e.target) && !e.target.closest('[data-accounts-btn]')) closeAccounts();
}

export function openAccounts() {
  if (popover) return closeAccounts();
  popover = document.createElement('div');
  popover.className = 'popover';
  const anchor = $('[data-accounts-btn]');
  const r = anchor.getBoundingClientRect();
  popover.style.left = `${r.right + 12}px`;
  popover.style.bottom = `${Math.max(12, window.innerHeight - r.bottom)}px`;
  popover.style.maxHeight = `${window.innerHeight - 24}px`;
  popover.style.overflowY = 'auto';
  document.body.appendChild(popover);
  renderAccounts();
  document.addEventListener('mousedown', outside, true);
}

function renderAccounts(mode = 'list') {
  if (!popover) return;
  const { list, selected } = state.accounts;
  const cur = list.find((a) => a.id === selected);
  const form =
    mode === 'offline'
      ? `<div class="offline-form">
            <label class="label" for="off-name">Ник игрока</label>
            <input id="off-name" class="input" maxlength="16" autocomplete="off" placeholder="Например, Steve_2024" />
            <span class="hint faint" style="font-size:12px" data-off-hint>3–16 символов: латиница, цифры и _</span>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn sm" data-back>Отмена</button>
              <button class="btn sm primary" data-off-save>Добавить профиль</button>
            </div>
          </div>`
      : mode === 'ely'
        ? `<div class="offline-form">
            <label class="label" for="ely-user">Логин или e-mail Ely.by</label>
            <input id="ely-user" class="input" autocomplete="off" />
            <label class="label" for="ely-pass">Пароль</label>
            <input id="ely-pass" class="input" type="password" autocomplete="off" />
            <label class="label" for="ely-code">Код двухфакторной защиты (если включена)</label>
            <input id="ely-code" class="input" inputmode="numeric" maxlength="8" autocomplete="off" />
            <span class="hint faint" style="font-size:12px" data-ely-hint>Пароль уходит только на сервер Ely.by и не сохраняется.</span>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn sm" data-back>Отмена</button>
              <button class="btn sm primary" data-ely-save>Войти</button>
            </div>
          </div>`
        : `<div class="pop-actions">
            ${cur ? `<button class="btn" data-skin>${icon('shirt')}Сменить скин</button>` : ''}
            <button class="btn" data-ms>${msLogo()}Войти через Microsoft (лицензия)</button>
            <button class="btn" data-ely>${icon('key')}Войти через Ely.by (скины)</button>
            <button class="btn" data-offline>${icon('wifiOff')}Офлайн-аккаунт (только ник)</button>
          </div>`;

  popover.innerHTML = `
    <div class="pop-title">Аккаунты</div>
    ${
      list.length
        ? list
            .map(
              (a) => `<div class="acc ${a.id === selected ? 'active' : ''}" data-select="${esc(a.id)}" tabindex="0">
          ${avatar(a)}
          <div class="who"><b>${esc(a.name)}</b><span>${ACCOUNT_KIND[a.type] || ''}</span></div>
          ${a.id === selected ? `<span style="color:var(--accent);display:grid" aria-label="Активный">${icon('check')}</span>` : ''}
          <button class="btn ghost sm icon-only rm" data-remove="${esc(a.id)}" aria-label="Удалить аккаунт ${esc(a.name)}">${icon('logout')}</button>
        </div>`
            )
            .join('')
        : `<div class="acc" style="cursor:default"><div class="avatar">${icon('user')}</div><div class="who"><b>Нет аккаунтов</b><span>Добавьте, чтобы играть</span></div></div>`
    }
    <div class="pop-sep"></div>
    ${form}`;

  $$('[data-select]', popover).forEach((el) =>
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-remove]')) return;
      state.accounts = await window.api.accounts.select(el.dataset.select);
      renderAccounts();
      loadAccounts();
    })
  );
  $$('[data-remove]', popover).forEach((b) =>
    b.addEventListener('click', async () => {
      state.accounts = await window.api.accounts.remove(b.dataset.remove);
      renderAccounts();
      loadAccounts();
    })
  );
  $$('[data-back]', popover).forEach((b) => b.addEventListener('click', () => renderAccounts()));

  const skin = $('[data-skin]', popover);
  if (skin)
    skin.addEventListener('click', () => {
      closeAccounts();
      navigate('/skin');
    });

  const ms = $('[data-ms]', popover);
  if (ms)
    ms.addEventListener('click', async () => {
      ms.disabled = true;
      ms.innerHTML = `${msLogo()}Ожидание входа…`;
      try {
        const acc = await window.api.accounts.loginMicrosoft();
        await loadAccounts();
        toast(`Добро пожаловать, ${acc.name}!`, 'Аккаунт Microsoft подключён.', 'success');
      } catch (err) {
        toast('Не получилось войти', err.message, 'error');
      }
      renderAccounts();
    });
  const off = $('[data-offline]', popover);
  if (off)
    off.addEventListener('click', () => {
      renderAccounts('offline');
      $('#off-name', popover).focus();
    });
  const ely = $('[data-ely]', popover);
  if (ely)
    ely.addEventListener('click', () => {
      renderAccounts('ely');
      $('#ely-user', popover).focus();
    });

  const input = $('#off-name', popover);
  if (input) {
    const valid = () => /^[A-Za-z0-9_]{3,16}$/.test(input.value.trim());
    input.addEventListener('input', () => {
      input.classList.remove('invalid');
      $('[data-off-hint]', popover).style.color = '';
    });
    input.addEventListener('blur', () => {
      if (input.value && !valid()) {
        input.classList.add('invalid');
        $('[data-off-hint]', popover).style.color = 'var(--danger)';
      }
    });
    const save = async () => {
      try {
        await window.api.accounts.addOffline(input.value);
        await loadAccounts();
        renderAccounts();
      } catch (err) {
        input.classList.add('invalid');
        $('[data-off-hint]', popover).textContent = err.message;
        $('[data-off-hint]', popover).style.color = 'var(--danger)';
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') renderAccounts();
    });
    $('[data-off-save]', popover).addEventListener('click', save);
  }

  const elySave = $('[data-ely-save]', popover);
  if (elySave) {
    const login = async () => {
      elySave.disabled = true;
      const hint = $('[data-ely-hint]', popover);
      hint.style.color = '';
      hint.textContent = 'Вход…';
      try {
        const acc = await window.api.accounts.loginEly($('#ely-user', popover).value, $('#ely-pass', popover).value, $('#ely-code', popover).value);
        await loadAccounts();
        toast(`Добро пожаловать, ${acc.name}!`, 'Аккаунт Ely.by подключён: скин подтянется в игре.', 'success');
        renderAccounts();
      } catch (err) {
        hint.textContent = err.message;
        hint.style.color = 'var(--danger)';
        elySave.disabled = false;
      }
    };
    elySave.addEventListener('click', login);
    $('#ely-pass', popover).addEventListener('keydown', (e) => e.key === 'Enter' && login());
  }
}

export { currentAccount };
