// Плашка обновления лаунчера: новая версия → скачивание → перезапуск.
import { icon } from './icons.js';
import { esc } from './ui.js';

let dismissed = '';

export function wireUpdates() {
  const box = document.createElement('div');
  box.className = 'update-banner';
  box.hidden = true;
  document.body.appendChild(box);
  const draw = (s) => {
    const show = ['available', 'downloading', 'ready'].includes(s.status) && !(s.status === 'available' && dismissed === s.version);
    box.hidden = !show;
    if (!show) return;
    if (s.status === 'available') {
      box.innerHTML = `<div class="u-ic">${icon('download')}</div><div class="u-tx"><b>Доступна версия ${esc(s.version)}</b><span>${esc(s.notes || 'Обновление скачается в фоне, игре это не мешает.')}</span></div>
        <button class="btn sm" data-later>Позже</button><button class="btn sm primary" data-go>Обновить</button>`;
      box.querySelector('[data-go]').addEventListener('click', () => window.api.update.download());
      box.querySelector('[data-later]').addEventListener('click', () => { dismissed = s.version; box.hidden = true; });
    } else if (s.status === 'downloading') {
      box.innerHTML = `<div class="u-ic">${icon('download')}</div><div class="u-tx"><b>Скачиваю обновление… ${s.percent}%</b><div class="progress"><i style="width:${s.percent}%"></i></div></div>`;
    } else {
      box.innerHTML = `<div class="u-ic">${icon('check')}</div><div class="u-tx"><b>Версия ${esc(s.version)} готова</b><span>Лаунчер перезапустится и обновится.</span></div>
        <button class="btn sm primary" data-go>Перезапустить</button>`;
      box.querySelector('[data-go]').addEventListener('click', () => window.api.update.install());
    }
  };
  window.api.events.onUpdate(draw);
  window.api.update.state().then(draw).catch(() => {});
}
