import { state, notify } from '../state.js';
import { icon } from '../icons.js';
import { esc, $, $$, toast, confirmDialog, progressModal } from '../ui.js';
import { THEMES, applyTheme, themePreview } from '../themes.js';

async function save(patch) {
  try {
    state.settings = await window.api.settings.set(patch);
    notify('settings');
  } catch (err) {
    toast('Не удалось сохранить настройку', err.message, 'error');
  }
}

const row = (title, text, ctl) => `<div class="setting"><div class="txt"><b>${title}</b><span>${text}</span></div><div class="ctl">${ctl}</div></div>`;

export async function renderSettings(view) {
  const s = state.settings;
  const toggle = (key, def) => `<button class="toggle ${(s[key] === undefined ? def : s[key]) ? 'on' : ''}" data-flag="${key}" aria-label="${key}"></button>`;
  const range = (key, min, max, def, unit) => {
    const v = Number.isFinite(Number(s[key])) && s[key] !== undefined ? Number(s[key]) : def;
    return `<div class="range-row"><input type="range" data-range="${key}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${v}" aria-label="${key}" /><b data-range-val="${key}">${v}${unit}</b></div>`;
  };
  let info = { version: '0.1.0', dataDir: '' };
  try {
    info = await window.api.app.info();
  } catch {
    /* ignore */
  }

  const sections = [
    ['appearance', 'Оформление', 'palette'],
    ['features', 'Возможности', 'sparkles'],
    ['confirm', 'Подтверждения', 'shield'],
    ['java', 'Java и память', 'cpu'],
    ['game', 'Игра', 'gamepad'],
    ['cf', 'CurseForge', 'download'],
    ['accounts', 'Вход Microsoft', 'key'],
    ['storage', 'Хранилище', 'box'],
    ['about', 'О лаунчере', 'info'],
  ];

  view.innerHTML = `<div class="view-inner">
    <h1 style="margin-bottom:22px">Настройки</h1>
    <div class="settings-layout">
      <nav class="settings-nav">${sections.map(([id, n, ic], i) => `<button data-sec="${id}" class="${i === 0 ? 'active' : ''}">${icon(ic)}${n}</button>`).join('')}</nav>
      <div>
        <section id="sec-appearance">
          <h2 style="margin-bottom:12px">Оформление</h2>
          <div class="settings-group">
            <div class="setting stack" style="padding-bottom:0">
              <div class="txt"><b>Тема</b><span>Меняется мгновенно и сохраняется между запусками.</span></div>
            </div>
            <div class="themes">${THEMES.map(
              (t) => `<button class="theme-card ${s.theme === t.id ? 'active' : ''}" data-theme-id="${t.id}">
                ${themePreview(t)}<div class="name">${esc(t.name)}${s.theme === t.id ? icon('check') : ''}</div></button>`
            ).join('')}</div>
          </div>
        </section>


        <section id="sec-features" style="margin-top:12px">
          <h2 style="margin-bottom:12px">Возможности</h2>
          <div class="settings-group">
            <div class="setting stack" style="padding-bottom:0"><div class="txt"><b>Сборки</b><span>Какие вкладки показывать на странице сборки.</span></div></div>
            ${row('Вкладка «Контент»', 'Моды, ресурспаки и шейдеры сборки.', toggle('showTabContent', true))}
            ${row('Вкладка «Миры»', 'Список миров с быстрым запуском.', toggle('showTabWorlds', true))}
            ${row('Вкладка «Скриншоты»', 'Снимки экрана из игры.', toggle('showTabShots', true))}
            <div class="setting stack" style="padding-bottom:0"><div class="txt"><b>Боковая панель</b><span>Что показывать в узкой панели слева.</span></div></div>
            ${row('Кнопка всех скриншотов', 'Одна страница со снимками из всех сборок.', toggle('railShots', true))}
            ${row('Кнопка выбора скина', 'Быстрый переход к смене скина.', toggle('railSkin', true))}
            ${row('Количество сборок на панели', 'Закреплённые сборки идут первыми. 0 скрывает список.', range('railCount', 0, 20, 6, ''))}
            <div class="setting stack" style="padding-bottom:0"><div class="txt"><b>Главная и контент</b><span>Внешний вид главной страницы и библиотеки.</span></div></div>
            ${row('Недавние сборки и миры', 'Блок «Последние сервера и сборки» на главной.', toggle('showRecent', true))}
            ${row('Компактный список в библиотеке', 'Сборки отображаются строками вместо карточек.', toggle('compactLibrary', false))}
            ${row('Время игры в сборках', 'Показывать, сколько вы наиграли, на карточке сборки.', toggle('showPlayTime', true))}
            ${row('Скрывать имя на странице скина', 'Убирает ник над скином, например для скриншотов.', toggle('hideSkinName', false))}
          </div>
        </section>

        <section id="sec-confirm" style="margin-top:12px">
          <h2 style="margin-bottom:12px">Подтверждения</h2>
          <div class="settings-group">
            ${row('Предупреждать о сторонних сборках', 'Показывать предупреждение при импорте .mrpack не из каталога Modrinth.', toggle('warnForeignPacks', true))}
            ${row('Только опасные предупреждения', 'Скрывает мелкие подтверждения: удаление обычного контента, дубликаты, массовые обновления. Удаление сборок и миров всё равно спросит.', toggle('onlyDangerConfirms', false))}
          </div>
        </section>

        <section id="sec-java" style="margin-top:12px">
          <h2 style="margin-bottom:12px">Java и память</h2>
          <div class="settings-group">
            <div class="setting stack">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div class="txt"><b>Максимум оперативной памяти</b><span>Для сборок с большим количеством модов ставьте 6–8 ГБ.</span></div>
                <b data-mem-label style="font-size:16px">${(s.memoryMax / 1024).toFixed(1).replace('.0', '')} ГБ</b>
              </div>
              <input type="range" id="st-mem" min="1024" max="16384" step="512" value="${s.memoryMax}" aria-label="Максимум памяти" />
              <div style="display:flex;justify-content:space-between" class="faint"><span>1 ГБ</span><span>16 ГБ</span></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Путь к Java</b><span>По умолчанию лаунчер сам скачивает нужную версию Java от Mojang для каждой версии игры.</span></div>
              <div class="ctl"><label for="st-java" style="position:absolute;left:-9999px">Путь к Java</label><input id="st-java" class="input" style="width:300px" placeholder="Автоматически" value="${esc(s.javaPath)}" /></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Аргументы JVM</b><span>Для опытных пользователей. Применяются ко всем сборкам.</span></div>
              <div class="ctl"><label for="st-jvm" style="position:absolute;left:-9999px">Аргументы JVM</label><input id="st-jvm" class="input" style="width:300px" placeholder="-XX:+UseG1GC" value="${esc(s.jvmArgs)}" /></div>
            </div>
          </div>
        </section>

        <section id="sec-game" style="margin-top:12px">
          <h2 style="margin-bottom:12px">Игра</h2>
          <div class="settings-group">
            <div class="setting">
              <div class="txt"><b>Размер окна игры</b><span>Ширина и высота при запуске в оконном режиме.</span></div>
              <div class="ctl">
                <label for="st-w" style="position:absolute;left:-9999px">Ширина</label><input id="st-w" class="input" type="number" min="640" style="width:100px" value="${s.gameWidth}" />
                <span class="faint">×</span>
                <label for="st-h" style="position:absolute;left:-9999px">Высота</label><input id="st-h" class="input" type="number" min="480" style="width:100px" value="${s.gameHeight}" />
              </div>
            </div>
            <div class="setting">
              <div class="txt"><b>Полноэкранный режим</b><span>Запускать игру сразу на весь экран.</span></div>
              <div class="ctl"><button class="toggle ${s.fullscreen ? 'on' : ''}" data-flag="fullscreen" aria-label="Полноэкранный режим"></button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Экономный режим</b><span>Отключает анимации и эффекты интерфейса. Во время игры и при свёрнутом окне лаунчер и так почти ничего не потребляет.</span></div>
              <div class="ctl"><button class="toggle ${s.lowPower ? 'on' : ''}" data-flag="lowPower" aria-label="Экономный режим"></button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Скрывать лаунчер во время игры</b><span>Окно вернётся, когда игра закроется.</span></div>
              <div class="ctl"><button class="toggle ${s.closeOnLaunch ? 'on' : ''}" data-flag="closeOnLaunch" aria-label="Скрывать лаунчер"></button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Снапшоты по умолчанию</b><span>Показывать тестовые версии при создании сборки.</span></div>
              <div class="ctl"><button class="toggle ${s.showSnapshots ? 'on' : ''}" data-flag="showSnapshots" aria-label="Показывать снапшоты"></button></div>
            </div>
          </div>
        </section>

        <section id="sec-cf" style="margin-top:12px">
          <h2 style="margin-bottom:12px">CurseForge</h2>
          <div class="settings-group">
            <div class="setting">
              <div class="txt"><b>Ключ API CurseForge</b><span>Нужен для поиска и скачивания модов и сборок с CurseForge. Ключ бесплатный: создайте его на console.curseforge.com. Он хранится только на этом компьютере.</span></div>
              <div class="ctl"><label for="st-cf" style="position:absolute;left:-9999px">Ключ API CurseForge</label><input id="st-cf" class="input" type="password" style="width:300px" placeholder="$2a$10$…" value="${esc(s.curseforgeKey)}" autocomplete="off" />
                <button class="btn" data-cf-site>${icon('external')}Получить ключ</button></div>
            </div>
          </div>
        </section>

        <section id="sec-accounts" style="margin-top:12px">
          <h2 style="margin-bottom:12px">Вход Microsoft</h2>
          <div class="settings-group">
            <div class="setting">
              <div class="txt"><b>Свой Client ID приложения Azure</b><span>Необязательно. По умолчанию вход идёт через стандартный OAuth Microsoft. Если вы зарегистрировали своё приложение в Azure и получили одобрение Mojang, укажите его ID здесь.</span></div>
              <div class="ctl"><label for="st-client" style="position:absolute;left:-9999px">Client ID</label><input id="st-client" class="input" style="width:300px" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${esc(s.msClientId)}" /></div>
            </div>
          </div>
        </section>


        <section id="sec-storage" style="margin-top:12px">
          <h2 style="margin-bottom:12px">Хранилище и загрузки</h2>
          <div class="settings-group">
            <div class="setting stack">
              <div class="txt"><b>Использование места</b><span data-st-total>Считаю…</span></div>
              <div class="storage-bar" data-st-bar></div>
              <div class="storage-legend" data-st-legend></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Удалить лишнее</b><span>Загруженные установщики и временные файлы. Сборки, миры и игра не затрагиваются.</span></div>
              <div class="ctl"><button class="btn" data-st-clean>${icon('trash')}Удалить лишнее</button></div>
            </div>
            ${row('Лимит кеша лишних файлов', 'Самые старые временные файлы удаляются, когда объём превышает лимит.', range('cacheLimitGB', 1, 50, 5, ' ГиБ'))}
            <div class="setting">
              <div class="txt"><b>Каталог приложения</b><span data-dd-info>${esc(info.dataDir || '')}</span></div>
              <div class="ctl"><button class="btn" data-dd-copy>${icon('link')}Копировать</button><button class="btn" data-datadir>${icon('folder')}Открыть</button><button class="btn" data-dd-change>${icon('folder')}Изменить…</button></div>
            </div>
            ${row('Одновременных скачиваний', 'Больше значит быстрее на хорошем канале, но выше нагрузка. Применяется к следующей загрузке.', range('downloadLimit', 1, 10, 10, ''))}
            ${row('Одновременных записей на диск', 'Уменьшите на медленных HDD. Применяется к следующей загрузке.', range('writeLimit', 1, 50, 10, ''))}
            <div class="setting">
              <div class="txt"><b>Очистить кеш</b><span>Удаляет весь кеш лаунчера: значки, списки версий, установщики. Он создастся заново.</span></div>
              <div class="ctl"><button class="btn" data-st-clear>${icon('trash')}Очистить кеш</button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Резервные копии</b><span>Раз в день лаунчер копирует настройки, аккаунты и параметры сборок (последние 7 копий). Сами миры не копируются.</span></div>
              <div class="ctl"><button class="btn" data-bk-now>${icon('refresh')}Создать копию</button><button class="btn" data-bk-open>${icon('folder')}Открыть папку</button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Экспорт отладочной информации</b><span>ZIP с версиями, настройками (без ключей и токенов), списком сборок и последними журналами. Приложите его к сообщению об ошибке.</span></div>
              <div class="ctl"><button class="btn" data-dbg>${icon('download')}Экспортировать</button></div>
            </div>
          </div>
        </section>

        <section id="sec-about" style="margin-top:12px">
          <h2 style="margin-bottom:12px">О лаунчере</h2>
          <div class="settings-group">
            <div class="setting">
              <div class="txt"><b>Оникс ${esc(info.version)}</b><span>Версии игры, библиотеки, Java и сборки хранятся в папке данных.</span></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Обновления лаунчера</b><span data-upd-status>Новые версии берутся из релизов на GitHub, проверяются при запуске и скачиваются только с вашего согласия.</span></div>
              <div class="ctl"><button class="toggle ${s.autoUpdate !== false ? 'on' : ''}" data-flag="autoUpdate" aria-label="Проверять обновления при запуске"></button>
                <button class="btn" data-upd-check>${icon('refresh')}Проверить</button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Источники</b><span>Версии игры и Java — официальные серверы Mojang. Fabric и Quilt — их официальные мета-серверы. Контент — API Modrinth. Оникс не связан с Mojang, Microsoft или Modrinth.</span></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>`;

  $$('[data-theme-id]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      applyTheme(b.dataset.themeId);
      await save({ theme: b.dataset.themeId });
      $$('[data-theme-id]', view).forEach((x) => {
        const on = x === b;
        x.classList.toggle('active', on);
        const name = THEMES.find((t) => t.id === x.dataset.themeId).name;
        $('.name', x).innerHTML = esc(name) + (on ? icon('check') : '');
      });
    })
  );

  const mem = $('#st-mem', view);
  const paintMem = () => {
    const pct = ((mem.value - mem.min) / (mem.max - mem.min)) * 100;
    mem.style.setProperty('--fill', pct + '%');
    $('[data-mem-label]', view).textContent = `${(mem.value / 1024).toFixed(1).replace('.0', '')} ГБ`;
  };
  paintMem();
  mem.addEventListener('input', paintMem);
  mem.addEventListener('change', () => save({ memoryMax: Number(mem.value), memoryMin: Math.min(1024, Number(mem.value)) }));

  $('#st-java', view).addEventListener('change', (e) => save({ javaPath: e.target.value.trim() }));
  $('#st-jvm', view).addEventListener('change', (e) => save({ jvmArgs: e.target.value.trim() }));
  $('#st-w', view).addEventListener('change', (e) => save({ gameWidth: Math.max(640, Number(e.target.value) || 1280) }));
  $('#st-h', view).addEventListener('change', (e) => save({ gameHeight: Math.max(480, Number(e.target.value) || 720) }));
  $('#st-cf', view).addEventListener('change', (e) => save({ curseforgeKey: e.target.value.trim() }));
  $('[data-cf-site]', view).addEventListener('click', () => window.api.app.openExternal('https://console.curseforge.com/'));
  $('[data-upd-check]', view).addEventListener('click', async () => {
    const st = $('[data-upd-status]', view);
    st.textContent = 'Проверяю…';
    try {
      const r = await window.api.update.check();
      st.textContent = { none: 'У вас последняя версия.', available: `Доступна версия ${r.version}. Предложение обновить появится внизу окна.`, downloading: 'Обновление скачивается…', ready: `Версия ${r.version} готова к установке.`, error: r.error, dev: r.error, disabled: r.error, checking: 'Проверяю…', idle: 'Проверка не выполнялась.' }[r.status] || '';
    } catch (err) {
      st.textContent = err.message;
    }
  });
  $('#st-client', view).addEventListener('change', (e) => save({ msClientId: e.target.value.trim() }));
  $$('[data-flag]', view).forEach((t) =>
    t.addEventListener('click', () => {
      const key = t.dataset.flag;
      const on = !t.classList.contains('on');
      t.classList.toggle('on', on);
      save({ [key]: on });
    })
  );
  $$('[data-range]', view).forEach((r) => {
    const key = r.dataset.range;
    const paint = () => {
      r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
      $(`[data-range-val="${key}"]`, view).textContent = r.value + r.dataset.unit;
    };
    paint();
    r.addEventListener('input', paint);
    r.addEventListener('change', async () => {
      await save({ [key]: Number(r.value) });
      if (key === 'cacheLimitGB') window.api.storage.prune().then(loadStorage).catch(() => {});
    });
  });

  const gb = (n) => (n / 1024 ** 3 >= 0.1 ? (n / 1024 ** 3).toFixed(1).replace('.0', '') + ' ГиБ' : Math.round(n / 1024 ** 2) + ' МиБ');
  async function loadStorage() {
    try {
      const d = await window.api.storage.info();
      const total = Math.max(1, d.own + d.shared + d.extra);
      const parts = [['Свой контент', d.own, 'var(--accent)'], ['Общие файлы игры', d.shared, 'var(--accent-2, #888)'], ['Лишнее', d.extra, 'var(--warning, #d9a441)']];
      $('[data-st-total]', view).textContent = `Всего занято ${gb(d.own + d.shared + d.extra)} в ${d.dir}`;
      $('[data-st-bar]', view).innerHTML = parts.map(([, n, c]) => `<i style="width:${(n / total) * 100}%;background:${c}"></i>`).join('');
      $('[data-st-legend]', view).innerHTML = parts.map(([n, v, c]) => `<span style="--c:${c}">${n}: ${gb(v)}</span>`).join('');
    } catch {
      const el = $('[data-st-total]', view);
      if (el) el.textContent = 'Не удалось посчитать занятое место.';
    }
  }
  loadStorage();
  $('[data-st-clean]', view).addEventListener('click', async () => {
    try {
      const r = await window.api.storage.cleanExtra();
      toast('Лишнее удалено', `Освобождено ${gb(r.freed)}.`, 'success');
    } catch (err) {
      toast('Не удалось удалить', err.message, 'error');
    }
    loadStorage();
  });
  $('[data-st-clear]', view).addEventListener('click', async () => {
    try {
      const r = await window.api.storage.clearCache();
      toast('Кеш очищен', `Освобождено ${gb(r.freed)}.`, 'success');
    } catch (err) {
      toast('Не удалось очистить кеш', err.message, 'error');
    }
    loadStorage();
  });
  $('[data-bk-now]', view).addEventListener('click', async () => {
    try {
      const r = await window.api.storage.backupNow();
      toast('Копия создана', r.dir, 'success');
    } catch (err) {
      toast('Не удалось создать копию', err.message, 'error');
    }
  });
  $('[data-bk-open]', view).addEventListener('click', () => window.api.storage.openBackups().catch((e) => toast('Не удалось открыть папку', e.message, 'error')));
  $('[data-dbg]', view).addEventListener('click', async () => {
    try {
      const r = await window.api.storage.exportDebug();
      if (r) toast('Отладочная информация сохранена', r.path, 'success');
    } catch (err) {
      toast('Не удалось экспортировать', err.message, 'error');
    }
  });
  $('[data-dd-copy]', view).addEventListener('click', async () => {
    try {
      const d = await window.api.datadir.info();
      await navigator.clipboard.writeText(d.dir);
      toast('Путь скопирован', d.dir, 'success');
    } catch {
      toast('Не удалось скопировать путь', '', 'error');
    }
  });
  window.api.datadir.info().then((d) => {
    const el = $('[data-dd-info]', view);
    if (!el) return;
    el.textContent = `${d.dir}${d.free != null ? ` · свободно на диске ${gb(d.free)}` : ''}. Если на диске C: не хватает места, перенесите данные на другой диск.`;
  }).catch(() => {});
  $('[data-dd-change]', view).addEventListener('click', async () => {
    const dir = await window.api.datadir.choose();
    if (!dir) return;
    const ok = await confirmDialog({ title: 'Перенести данные?', text: `Все файлы Оникса (игра, Java, сборки, настройки) будут перенесены в выбранную папку: ${dir}. После переноса лаунчер перезапустится. Это может занять несколько минут.`, action: 'Перенести', danger: false });
    if (!ok) return;
    const stop = progressModal('Переносим данные', 'datadir');
    try {
      await window.api.datadir.move(dir);
    } catch (err) {
      stop();
      toast('Не удалось перенести', err.message, 'error');
    }
  });
  $('[data-datadir]', view).addEventListener('click', () => window.api.settings.openDataDir());

  // Подсветка пункта меню следует за разделом, к которому прокручена страница.
  const navBtns = $$('[data-sec]', view);
  const secEls = navBtns.map((b) => $(`#sec-${b.dataset.sec}`, view));
  let locked = 0;
  const setActive = (id) => navBtns.forEach((x) => x.classList.toggle('active', x.dataset.sec === id));
  const spy = () => {
    if (Date.now() < locked) return;
    const top = view.getBoundingClientRect().top + 90;
    let cur = secEls[0];
    for (const el of secEls) if (el.getBoundingClientRect().top <= top) cur = el;
    if (view.scrollTop + view.clientHeight >= view.scrollHeight - 4) cur = secEls[secEls.length - 1];
    setActive(cur.id.replace('sec-', ''));
  };
  let raf = 0;
  view.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
  navBtns.forEach((b) =>
    b.addEventListener('click', () => {
      setActive(b.dataset.sec);
      locked = Date.now() + 700; // пока идёт плавная прокрутка, не перебиваем выбор
      $(`#sec-${b.dataset.sec}`, view).scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
  );
  spy();
}
