// Инструменты сборки: обновление модов, проверка совместимости, скриншоты, журналы.
import { state, subscribe, loadInstances } from '../state.js';
import { icon } from '../icons.js';
import { esc, $, $$, toast, openModal, progressModal, formatSize, timeAgo } from '../ui.js';
import { navigate } from '../router.js';

// ---------- Обновление модов ----------
export async function openUpdates(inst, onDone) {
  const stop = progressModal('Проверяем обновления', `update:${inst.id}`);
  let res;
  try {
    res = await window.api.updates.check(inst.id);
  } catch (err) {
    stop();
    toast('Не удалось проверить обновления', err.message, 'error');
    return;
  }
  stop();
  if (!res.updates.length) {
    openModal(
      `<div class="modal-head"><h2>Обновления</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
       <div class="modal-body"><div class="empty" style="padding:18px 0"><div class="icon-wrap">${icon('check')}</div><h3>Всё актуально</h3><p>Проверено файлов: ${res.checked} из ${res.total}. Новых версий для «${esc(inst.name)}» нет.</p></div></div>
       <div class="modal-foot"><button class="btn primary" data-close>Готово</button></div>`
    );
    return;
  }
  openModal(
    `<div class="modal-head"><h2>Доступно обновлений: ${res.updates.length}</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
     <div class="modal-body">
       <div class="update-list">${res.updates
         .map(
           (u, i) => `<label class="update-row">
             <input type="checkbox" data-u="${i}" ${u.blocked ? 'disabled' : 'checked'} />
             <span class="t"><b>${esc(u.title)}</b><span class="s">${esc(u.current || '—')} → <i>${esc(u.latest || 'новая')}</i>${u.enabled === false ? ' · выключен' : ''}</span></span>
             <span class="chip">${u.source === 'curseforge' ? 'CurseForge' : 'Modrinth'}</span>
             ${u.blocked ? `<span class="chip warn" title="Автор запретил скачивание вне своего сайта">вручную</span>` : ''}
           </label>`
         )
         .join('')}</div>
       <p class="faint" style="margin:10px 0 0">Старый файл заменяется новым. Если мод был выключен, он останется выключенным.</p>
     </div>
     <div class="modal-foot"><button class="btn" data-close>Позже</button><button class="btn primary" data-go>${icon('download')}Обновить выбранное</button></div>`,
    {
      onMount: (m, close) => {
        $('[data-go]', m).addEventListener('click', async () => {
          const chosen = $$('[data-u]:checked', m).map((c) => res.updates[Number(c.dataset.u)]);
          if (!chosen.length) return toast('Ничего не выбрано', '', 'info');
          close();
          const stop2 = progressModal('Обновляем моды', `update:${inst.id}`);
          try {
            const r = await window.api.updates.apply(inst.id, chosen);
            stop2();
            toast(`Обновлено: ${r.updated}`, r.failed && r.failed.length ? `Не удалось: ${r.failed.map((f) => f.title || f).join(', ')}` : 'Всё прошло без ошибок', r.failed && r.failed.length ? 'error' : 'success');
          } catch (err) {
            stop2();
            toast('Не удалось обновить', err.message, 'error');
          }
          if (onDone) onDone();
        });
      },
    }
  );
}

// ---------- Проверка совместимости ----------
export async function openAnalysis(inst, onDone) {
  const close = openModal(
    `<div class="modal-head"><h2>Проверка сборки</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
     <div class="modal-body" data-body><div class="skeleton" style="height:120px"></div></div>
     <div class="modal-foot"><button class="btn primary" data-close>Закрыть</button></div>`
  );
  const body = $('[data-body]');
  const KIND = { loader: 'Не тот загрузчик', version: 'Не та версия игры', missing: 'Нет зависимости', conflict: 'Конфликт', duplicate: 'Дубликат' };
  const draw = async () => {
    let res;
    try {
      res = await window.api.analyze.run(inst.id);
    } catch (err) {
      if (body.isConnected) body.innerHTML = `<div class="empty"><h3>Не удалось проверить</h3><p>${esc(err.message)}</p></div>`;
      return;
    }
    if (!body.isConnected) return;
    if (!res.issues.length) {
      body.innerHTML = `<div class="empty" style="padding:18px 0"><div class="icon-wrap">${icon('shield')}</div><h3>Проблем не найдено</h3><p>Проверено модов: ${res.checked}. Конфликтов, дубликатов и недостающих зависимостей нет.</p></div>`;
      return;
    }
    const errs = res.issues.filter((i) => i.severity === 'error').length;
    body.innerHTML = `<p class="muted" style="margin:0 0 12px">Проверено модов: ${res.checked}. Ошибок: ${errs}, предупреждений: ${res.issues.length - errs}.</p>
      <div class="issue-list">${res.issues
        .map(
          (i, n) => `<div class="issue ${i.severity}">
            <span class="dot"></span>
            <div class="txt"><b>${esc(i.mod)}</b><span class="faint"> · ${KIND[i.kind] || i.kind}</span><p>${esc(i.text)}</p></div>
            ${i.fix ? `<button class="btn sm primary" data-fix="${n}">${icon('download')}Установить «${esc(i.fix.modid)}»</button>` : ''}
          </div>`
        )
        .join('')}</div>`;
    $$('[data-fix]', body).forEach((b) =>
      b.addEventListener('click', async () => {
        const issue = res.issues[Number(b.dataset.fix)];
        b.disabled = true;
        b.textContent = 'Устанавливаю…';
        try {
          await window.api.analyze.installDep(inst.id, issue.fix.modid);
          toast(`«${issue.fix.modid}» установлен`, '', 'success');
          if (onDone) onDone();
          await draw();
        } catch (err) {
          toast('Не удалось установить', err.message, 'error');
          b.disabled = false;
          b.textContent = `Установить «${issue.fix.modid}»`;
        }
      })
    );
  };
  draw();
  return close;
}

// ---------- Скриншоты ----------
export async function renderShots(body, inst) {
  body.innerHTML = `<div class="skeleton" style="height:200px"></div>`;
  let shots = [];
  try {
    shots = await window.api.shots.list(inst.id);
  } catch (err) {
    body.innerHTML = `<div class="empty"><h3>Не удалось прочитать скриншоты</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  const draw = () => {
    if (!shots.length) {
      body.innerHTML = `<div class="empty"><div class="icon-wrap">${icon('image')}</div><h3>Скриншотов пока нет</h3><p>Нажмите F2 в игре, и снимок появится здесь.</p><button class="btn" data-folder>${icon('folder')}Открыть папку</button></div>`;
      $('[data-folder]', body).addEventListener('click', () => window.api.instances.openFolder(inst.id));
      return;
    }
    body.innerHTML = `<div class="toolbar" style="margin-bottom:14px;justify-content:space-between"><span class="muted">Скриншотов: ${shots.length}</span></div>
      <div class="shot-grid">${shots.map((s) => `<button class="shot" data-shot="${esc(s.file)}" aria-label="Открыть ${esc(s.file)}"><span class="ph"></span><span class="cap">${esc(s.file.replace(/\.(png|jpe?g)$/i, ''))}</span></button>`).join('')}</div>`;
    // Миниатюры подгружаем только когда карточка попала в область видимости.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const file = e.target.dataset.shot;
          window.api.shots.thumb(inst.id, file).then((url) => {
            if (url && e.target.isConnected) e.target.querySelector('.ph').outerHTML = `<img src="${url}" alt="" decoding="async" />`;
          }).catch(() => {});
        }
      },
      { rootMargin: '200px' }
    );
    $$('.shot', body).forEach((el) => {
      io.observe(el);
      el.addEventListener('click', () => openShot(el.dataset.shot));
    });
  };
  const openShot = (file) => {
    const idx = shots.findIndex((s) => s.file === file);
    openModal(
      `<div class="modal-head"><h2 style="font-size:15px">${esc(file)}</h2><button class="btn ghost icon-only sm" data-close aria-label="Закрыть">${icon('x')}</button></div>
       <div class="modal-body shot-full"><div class="skeleton" style="height:300px" data-img></div><div class="faint" style="margin-top:8px">${formatSize(shots[idx].size)} · ${esc(timeAgo(shots[idx].mtime))}</div></div>
       <div class="modal-foot"><button class="btn" data-copy>Копировать</button><button class="btn" data-reveal>${icon('folder')}Показать в папке</button><button class="btn danger" data-del>${icon('trash')}Удалить</button></div>`,
      {
        onMount: (m, close) => {
          window.api.shots.full(inst.id, file).then((url) => {
            const box = $('[data-img]', m);
            if (box) box.outerHTML = `<img src="${url}" alt="${esc(file)}" />`;
          }).catch(() => {});
          $('[data-copy]', m).addEventListener('click', async () => {
            try {
              await window.api.shots.copy(inst.id, file);
              toast('Скопировано в буфер обмена', '', 'success');
            } catch (err) {
              toast('Не удалось скопировать', err.message, 'error');
            }
          });
          $('[data-reveal]', m).addEventListener('click', () => window.api.shots.reveal(inst.id, file));
          $('[data-del]', m).addEventListener('click', async () => {
            try {
              shots = await window.api.shots.delete(inst.id, file);
              toast('Скриншот перемещён в корзину', '', 'success');
              close();
              draw();
            } catch (err) {
              toast('Не удалось удалить', err.message, 'error');
            }
          });
        },
      }
    );
  };
  draw();
}

// ---------- Журнал ----------
function logLine(line) {
  const cls = /\[Оникс\]/.test(line) ? 'aster' : /ERROR|Exception|FATAL|Caused by|at [\w.$]+\(/.test(line) ? 'err' : /WARN/.test(line) ? 'warn' : '';
  return `<div class="${cls}">${esc(line)}</div>`;
}
const levelOf = (line) => (/\[Оникс\]/.test(line) ? 'info' : /ERROR|Exception|FATAL|Caused by|at [\w.$]+\(/.test(line) ? 'error' : /WARN/.test(line) ? 'warn' : 'info');

export async function renderLogs(body, inst) {
  let files = [];
  try {
    files = await window.api.logs.list(inst.id);
  } catch {
    files = [];
  }
  let source = 'session';
  let level = 'all';
  let q = '';
  let lines = [];
  const sessionLines = () => state.logs[inst.id] || [];

  body.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <label for="lg-src" style="position:absolute;left:-9999px">Источник журнала</label>
      <select class="select" id="lg-src" style="width:240px">
        <option value="session">Текущая сессия</option>
        ${files.map((f) => `<option value="${esc(f.path)}">${f.kind === 'crash' ? 'Краш · ' : ''}${esc(f.name)} (${formatSize(f.size)})</option>`).join('')}
      </select>
      <div class="segmented">${[['all', 'Всё'], ['warn', 'Предупреждения'], ['error', 'Ошибки']].map(([k, v]) => `<button data-lvl="${k}" class="${k === 'all' ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div class="search" style="flex:1;min-width:160px"><label for="lg-q" style="position:absolute;left:-9999px">Поиск по журналу</label>${icon('search')}<input id="lg-q" class="input" placeholder="Поиск по журналу" /></div>
      <button class="btn sm" data-copy>Копировать</button>
      <button class="btn sm primary" data-report title="Версия, список модов и конец журнала: удобно приложить к сообщению об ошибке">${icon('info')}Для отчёта</button>
    </div>
    <div class="console" data-console></div>`;
  const con = $('[data-console]', body);

  const visible = () => {
    const needle = q.trim().toLowerCase();
    return lines.filter((l) => (level === 'all' || (level === 'warn' ? levelOf(l) !== 'info' : levelOf(l) === 'error')) && (!needle || l.toLowerCase().includes(needle)));
  };
  const draw = () => {
    const list = visible();
    const shown = list.slice(-1500);
    con.innerHTML = shown.length
      ? (list.length > shown.length ? `<div class="faint">… показаны последние ${shown.length} из ${list.length} строк …</div>` : '') + shown.map(logLine).join('')
      : `<span class="faint">${lines.length ? 'Ничего не найдено по этому фильтру.' : source === 'session' ? 'Журнал пуст. Запустите игру, и здесь появится её вывод.' : 'Файл пуст.'}</span>`;
    con.scrollTop = con.scrollHeight;
  };
  const load = async () => {
    if (source === 'session') {
      lines = sessionLines().slice();
      return draw();
    }
    con.innerHTML = '<span class="faint">Читаю файл…</span>';
    try {
      const r = await window.api.logs.read(inst.id, source);
      lines = r.text.split(/\r?\n/);
    } catch (err) {
      lines = [];
      con.innerHTML = `<span class="faint">Не удалось прочитать: ${esc(err.message)}</span>`;
      return;
    }
    draw();
  };

  $('#lg-src', body).addEventListener('change', (e) => {
    source = e.target.value;
    load();
  });
  $$('[data-lvl]', body).forEach((b) =>
    b.addEventListener('click', () => {
      level = b.dataset.lvl;
      $$('[data-lvl]', body).forEach((x) => x.classList.toggle('active', x === b));
      draw();
    })
  );
  let timer;
  $('#lg-q', body).addEventListener('input', (e) => {
    q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(draw, 150);
  });
  $('[data-copy]', body).addEventListener('click', () => {
    navigator.clipboard.writeText(visible().join('\n'));
    toast('Скопировано', `Строк: ${visible().length}`, 'success');
  });
  $('[data-report]', body).addEventListener('click', async () => {
    try {
      const text = await window.api.logs.report(inst.id);
      await navigator.clipboard.writeText(text);
      toast('Отчёт скопирован', 'Вставьте его в сообщение об ошибке', 'success');
    } catch (err) {
      toast('Не удалось собрать отчёт', err.message, 'error');
    }
  });

  const unsub = subscribe((what) => {
    if (!con.isConnected) return unsub();
    if (source !== 'session' || !what || !what.logs) return;
    const mine = what.logs.filter((l) => l.id === inst.id).map((l) => l.line);
    if (!mine.length) return;
    lines.push(...mine);
    if (lines.length > 5000) lines = lines.slice(-4000);
    const needle = q.trim().toLowerCase();
    const add = mine.filter((l) => (level === 'all' || (level === 'warn' ? levelOf(l) !== 'info' : levelOf(l) === 'error')) && (!needle || l.toLowerCase().includes(needle)));
    if (!add.length) return;
    const nearBottom = con.scrollHeight - con.scrollTop - con.clientHeight < 60;
    if (con.querySelector('.faint')) con.innerHTML = '';
    con.insertAdjacentHTML('beforeend', add.map(logLine).join(''));
    while (con.childElementCount > 1500) con.firstElementChild.remove();
    if (nearBottom) con.scrollTop = con.scrollHeight;
  });
  load();
}
