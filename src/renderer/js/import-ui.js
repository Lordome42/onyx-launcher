// Импорт сборки одним действием: ссылка Modrinth или CurseForge, прямая ссылка, файл .mrpack/.zip (в том числе перетаскиванием).
import { state, loadInstances } from './state.js';
import { icon } from './icons.js';
import { esc, $, $$, toast, openModal, confirmDialog, progressModal } from './ui.js';
import { navigate } from './router.js';

const KIND_LABEL = {
  modrinth: 'Сборка Modrinth',
  curseforge: 'Сборка CurseForge',
  direct: 'Файл по ссылке',
  file: 'Файл на компьютере',
};

// Запускает импорт: предупреждение о сторонних файлах, прогресс, результат.
export async function runImport(input, kind) {
  const foreign = kind === 'file' || kind === 'direct';
  if (foreign && state.settings.warnForeignPacks !== false) {
    const ok = await confirmDialog({
      title: 'Импортировать сборку не из каталога?',
      text: 'Эта сборка пришла не с Modrinth или CurseForge. В ней могут быть неизвестные файлы и моды. Импортируйте только то, чему доверяете.',
      action: 'Импортировать',
      danger: false,
    });
    if (!ok) return false;
  }
  const stop = progressModal('Импорт сборки', 'import');
  try {
    const res = await window.api.packs.importFrom(input);
    stop();
    await loadInstances();
    const manual = (res.manual || []).length;
    toast(`Сборка «${res.instance.name}» импортирована`, manual ? `${manual} файл(ов) нужно добавить вручную.` : 'Всё скачано, можно играть.', 'success');
    navigate(`/instance/${res.instance.id}`);
    if (manual) showManual(res.manual);
    return true;
  } catch (err) {
    stop();
    toast('Не удалось импортировать', err.message, 'error');
    return false;
  }
}

// Список модов, которые автор запретил скачивать вне сайта CurseForge.
function showManual(list) {
  openModal(
    `<div class="modal-head"><h2>Нужно скачать вручную</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
     <div class="modal-body"><p class="muted" style="margin-top:0">Авторы этих модов не разрешают скачивание вне сайта CurseForge. Скачайте файлы и перетащите их на страницу сборки.</p>
     <div class="java-list">${list
       .map((m) => `<div class="java-row"><div><b>${esc(m.name)}</b></div>${m.url ? `<button class="btn sm" data-ext="${esc(m.url)}">${icon('external')}Открыть</button>` : ''}</div>`)
       .join('')}</div></div>
     <div class="modal-foot"><button class="btn primary" data-close>Готово</button></div>`,
    { onMount: (m) => $$('[data-ext]', m).forEach((b) => b.addEventListener('click', () => window.api.app.openExternal(b.dataset.ext))) }
  );
}

// Окно импорта. Можно передать готовый текст или путь к файлу.
export function openImport(prefill = '') {
  openModal(
    `<div class="modal-head"><h2>Импорт сборки</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
     <div class="modal-body" style="display:grid;gap:12px">
       <div><label for="imp-in" style="display:block;font-weight:600;margin-bottom:6px">Ссылка на сборку</label>
         <input id="imp-in" class="input" style="width:100%" placeholder="https://modrinth.com/modpack/… или https://www.curseforge.com/minecraft/modpacks/…" value="${esc(prefill)}" autocomplete="off" spellcheck="false" />
         <div class="faint" style="font-size:12.5px;margin-top:6px;min-height:18px" data-hint></div></div>
       <div class="import-drop" data-drop>${icon('upload')}<div><b>Или перетащите файл сюда</b><span>.mrpack (Modrinth) или .zip с manifest.json (CurseForge)</span></div>
         <button class="btn" data-file>${icon('folder')}Выбрать файл…</button></div>
     </div>
     <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" data-go disabled>${icon('download')}Импортировать</button></div>`,
    {
      onMount: (m, close) => {
        const input = $('#imp-in', m);
        const hint = $('[data-hint]', m);
        const go = $('[data-go]', m);
        let kind = null;
        let seq = 0;
        const check = async () => {
          const my = ++seq;
          const text = input.value.trim();
          if (!text) {
            kind = null;
            hint.textContent = '';
            go.disabled = true;
            return;
          }
          let c = null;
          try {
            c = await window.api.packs.classify(text);
          } catch {
            /* оставим без подсказки */
          }
          if (my !== seq) return;
          kind = c && c.kind !== 'unsupported' ? c.kind : null;
          hint.style.color = c && !kind ? 'var(--danger)' : '';
          hint.textContent = kind ? `Распознано: ${KIND_LABEL[kind]}` : c && c.why ? c.why : 'Не похоже на ссылку на сборку или путь к файлу.';
          go.disabled = !kind;
        };
        input.addEventListener('input', check);
        const start = async () => {
          if (go.disabled) return;
          const text = input.value.trim();
          close();
          await runImport(text, kind);
        };
        go.addEventListener('click', start);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && start());
        $('[data-file]', m).addEventListener('click', async () => {
          const f = await window.api.packs.pickFile();
          if (!f) return;
          close();
          await runImport(f, 'file');
        });
        const drop = $('[data-drop]', m);
        drop.addEventListener('dragover', (e) => {
          e.preventDefault();
          drop.classList.add('over');
        });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          drop.classList.remove('over');
          const f = e.dataTransfer.files[0];
          const p = f && window.api.pathForFile(f);
          if (!p || !/\.(mrpack|zip)$/i.test(p)) return toast('Нужен файл .mrpack или .zip', '', 'error');
          close();
          await runImport(p, 'file');
        });
        check();
      },
    }
  );
}

// Перетаскивание .mrpack или .zip на любую страницу (кроме страницы сборки, где файлы добавляются как моды).
export function wireGlobalDrop() {
  let depth = 0;
  const overlay = document.createElement('div');
  overlay.className = 'drop-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `${icon('upload')}<b>Отпустите, чтобы импортировать сборку</b><span>.mrpack или .zip CurseForge</span>`;
  document.body.appendChild(overlay);
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const onInstance = () => location.hash.startsWith('#/instance/');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || onInstance()) return;
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    if (onInstance()) return;
    depth = Math.max(0, depth - 1);
    if (!depth) overlay.hidden = true;
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e) && !onInstance()) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    depth = 0;
    overlay.hidden = true;
    if (!hasFiles(e) || onInstance() || e.defaultPrevented) return;
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    const p = f && window.api.pathForFile(f);
    if (p && /\.(mrpack|zip)$/i.test(p)) await runImport(p, 'file');
    else toast('Нужен файл .mrpack или .zip', 'Для модов откройте страницу сборки и перетащите файл туда.', 'error');
  });
}
