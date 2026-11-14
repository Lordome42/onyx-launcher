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

export async function renderSettings(view) {
  const s = state.settings;
  let info = { version: '0.1.0', dataDir: '' };
  try {
    info = await window.api.app.info();
  } catch {
    /* ignore */
  }

  const sections = [
    ['appearance', 'Оформление', 'palette'],
    ['java', 'Java и память', 'cpu'],
    ['game', 'Игра', 'gamepad'],
    ['cf', 'CurseForge', 'download'],
    ['accounts', 'Вход Microsoft', 'shield'],
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

        <section id="sec-about" style="margin-top:12px">
          <h2 style="margin-bottom:12px">О лаунчере</h2>
          <div class="settings-group">
            <div class="setting">
              <div class="txt"><b>Оникс ${esc(info.version)}</b><span>Версии игры, библиотеки, Java и сборки хранятся в папке данных.</span></div>
              <div class="ctl"><button class="btn" data-datadir>${icon('folder')}Открыть папку</button></div>
            </div>
            <div class="setting">
              <div class="txt"><b>Папка данных</b><span data-dd-info>${esc(info.dataDir || '')}</span></div>
              <div class="ctl"><button class="btn" data-dd-change>${icon('folder')}Изменить…</button></div>
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
  window.api.datadir.info().then((d) => {
    const el = $('[data-dd-info]', view);
    if (!el) return;
    const gb = (n) => (n / 1024 ** 3).toFixed(1).replace('.0', '');
    el.textContent = `${d.dir} · занято ${gb(d.size)} ГБ${d.free != null ? `, свободно на диске ${gb(d.free)} ГБ` : ''}. Если на диске C: не хватает места, перенесите данные на другой диск.`;
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

  $$('[data-sec]', view).forEach((b) =>
    b.addEventListener('click', () => {
      $$('[data-sec]', view).forEach((x) => x.classList.toggle('active', x === b));
      $(`#sec-${b.dataset.sec}`, view).scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
  );
}
