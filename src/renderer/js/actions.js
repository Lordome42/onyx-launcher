// Общие действия и «живые» элементы (кнопки запуска, прогресс), которые обновляются без перерисовки страницы.
import { state, notify, currentAccount, loadInstances, pushLog } from './state.js';
import { icon } from './icons.js';
import { esc, toast, $$ } from './ui.js';

let openAccountsHook = () => {};
export function setOpenAccounts(fn) {
  openAccountsHook = fn;
}

export async function togglePlay(id, quickPlay = null) {
  if (state.running.has(id)) {
    await window.api.instances.stop(id);
    return;
  }
  if (state.progress[id]) return;
  if (!currentAccount()) {
    toast('Сначала добавьте аккаунт', 'Войдите через Microsoft или создайте офлайн-профиль.');
    openAccountsHook();
    return;
  }
  state.progress[id] = { stage: 'Подготовка', done: 0, total: 0 };
  state.logs[id] = [];
  notify('progress');
  try {
    await window.api.instances.launch(id, { quickPlay });
  } catch (err) {
    delete state.progress[id];
    notify('progress');
    toast('Не удалось запустить игру', err.message, 'error');
  }
}

export function playButton(id, variant = 'big') {
  const running = state.running.has(id);
  const busy = !!state.progress[id] && !running;
  if (variant === 'fab') {
    return `<button class="play-fab ${running ? 'running' : ''}" data-action="play" data-id="${esc(id)}" aria-label="${running ? 'Остановить' : 'Играть'}" ${busy ? 'disabled' : ''}>${icon(running ? 'stop' : 'play')}</button>`;
  }
  if (running) return `<button class="btn play danger solid" data-action="play" data-id="${esc(id)}" style="background:var(--danger);color:#fff">${icon('stop')}Остановить</button>`;
  if (busy) return `<button class="btn play" disabled>${icon('download')}Подготовка…</button>`;
  return `<button class="btn play" data-action="play" data-id="${esc(id)}">${icon('play')}Играть</button>`;
}

export function progressBlock(id) {
  const p = state.progress[id];
  if (!p || state.running.has(id)) return '';
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return `<div class="launch-status">
    <div class="row"><span>${esc(p.stage)}</span><span>${p.total ? `${p.done} / ${p.total}` : ''}</span></div>
    <div class="progress ${p.total ? '' : 'indeterminate'}"><i style="width:${pct}%"></i></div>
  </div>`;
}

// Перерисовывает элементы с data-live-* на текущей странице.
export function updateLive() {
  $$('[data-live-play]').forEach((el) => (el.innerHTML = playButton(el.dataset.livePlay, el.dataset.variant)));
  $$('[data-live-progress]').forEach((el) => (el.innerHTML = progressBlock(el.dataset.liveProgress)));
}

export function wireGameEvents() {
  const ev = window.api.events;
  ev.onProgress((p) => {
    state.progress[p.id] = p;
    notify('progress');
  });
  ev.onStarted(({ id }) => {
    state.running.add(id);
    document.body.classList.add('game-running');
    delete state.progress[id];
    notify('progress');
    notify('running');
  });
  ev.onLogs((batch) => {
    for (const { id, line } of batch) pushLog(id, line);
    notify({ logs: batch });
  });
  ev.onVisibility(({ hidden }) => document.body.classList.toggle('win-hidden', hidden));
  ev.onExit(async ({ id, code, playedMs }) => {
    state.running.delete(id);
    document.body.classList.toggle('game-running', state.running.size > 0);
    delete state.progress[id];
    notify('progress');
    notify('running');
    if (code !== 0 && code !== null && playedMs < 20000) {
      toast('Игра завершилась с ошибкой', `Код выхода ${code}. Подробности во вкладке «Журнал».`, 'error');
    }
    await loadInstances();
  });
}

// Делегирование кликов по кнопкам запуска во всём приложении.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="play"]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  togglePlay(btn.dataset.id);
});
