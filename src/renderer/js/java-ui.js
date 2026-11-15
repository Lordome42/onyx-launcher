// Интерфейс профилей Java: выбор в списке и управление в настройках.
import { icon } from './icons.js';
import { esc, $, $$, toast, progressModal } from './ui.js';

// Варианты для <select>: «авто», среды Mojang и свои профили.
export function javaOptions(list, current, { withDefault = false } = {}) {
  const sel = (v) => (v === current ? 'selected' : '');
  return [
    withDefault ? `<option value="default" ${sel('default')}>Как в общих настройках</option>` : '',
    `<option value="auto" ${sel('auto')}>Автоматически (подходящая для версии)</option>`,
    `<optgroup label="Среды Mojang">${list.mojang.map((c) => `<option value="mojang:${c.id}" ${sel('mojang:' + c.id)}>${esc(c.label)}${c.installed ? '' : ' (будет скачана)'}</option>`).join('')}</optgroup>`,
    list.custom.length ? `<optgroup label="Свои">${list.custom.map((p) => `<option value="custom:${esc(p.id)}" ${sel('custom:' + p.id)}>${esc(p.name)}</option>`).join('')}</optgroup>` : '',
  ].join('');
}

// Блок управления профилями Java внутри настроек. onChange вызывается после любого изменения списка.
export function mountJavaProfiles(root, onChange = () => {}) {
  let list = null;
  let found = null;

  const draw = () => {
    if (!list) return;
    root.innerHTML = `
      <div class="java-list">
        ${list.mojang
          .map(
            (c) => `<div class="java-row"><div><b>${esc(c.label)}</b><span>${esc(c.hint)}</span></div>
              ${c.installed ? `<span class="chip ok">${icon('check')}Установлена</span>` : `<button class="btn sm" data-install="${esc(c.id)}">${icon('download')}Скачать</button>`}</div>`
          )
          .join('')}
        ${list.custom
          .map(
            (p) => `<div class="java-row"><div><b>${esc(p.name)}</b><span title="${esc(p.path)}">${esc(p.path)}</span></div>
              <button class="btn sm ghost" data-remove="${esc(p.id)}" aria-label="Убрать профиль">${icon('trash')}Убрать</button></div>`
          )
          .join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn" data-detect>${icon('search')}Найти Java в системе</button>
        <button class="btn" data-add>${icon('folder')}Добавить вручную…</button>
      </div>
      ${found ? `<div class="java-list" style="margin-top:10px">${found.length ? found.map((f, i) => `<div class="java-row"><div><b>${esc(f.vendor)} ${f.major}</b><span title="${esc(f.path)}">${esc(f.path)}</span></div><button class="btn sm" data-use="${i}">${icon('plus')}Добавить</button></div>`).join('') : '<div class="faint" style="padding:6px 2px">Установленных Java не найдено. Лаунчер скачает нужную сам.</div>'}</div>` : ''}`;

    $$('[data-install]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        const stop = progressModal('Загрузка Java', 'java');
        try {
          list = await window.api.java.install(b.dataset.install);
          stop();
          toast('Java установлена', '', 'success');
          draw();
          onChange(list);
        } catch (err) {
          stop();
          toast('Не удалось скачать Java', err.message, 'error');
        }
      })
    );
    $$('[data-remove]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        await window.api.java.removeCustom(b.dataset.remove);
        await load();
        onChange(list);
      })
    );
    $('[data-detect]', root).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        found = await window.api.java.detect();
      } catch (err) {
        toast('Поиск не удался', err.message, 'error');
      }
      draw();
    });
    $$('[data-use]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        const f = found[Number(b.dataset.use)];
        await window.api.java.addCustom({ name: `${f.vendor} ${f.major}`, path: f.path });
        found = null;
        await load();
        onChange(list);
      })
    );
    $('[data-add]', root).addEventListener('click', async () => {
      try {
        const f = await window.api.java.pick();
        if (!f) return;
        await window.api.java.addCustom({ name: `${f.vendor} ${f.major}`, path: f.path });
        await load();
        onChange(list);
      } catch (err) {
        toast('Не удалось добавить Java', err.message, 'error');
      }
    });
  };

  async function load() {
    try {
      list = await window.api.java.list();
    } catch (err) {
      root.textContent = err.message;
      return;
    }
    draw();
  }
  load();
}
