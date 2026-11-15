// Точка входа интерфейса: каркас окна, боковая панель, маршрутизация.
import { state, subscribe, loadInstances, loadAccounts, currentAccount } from './state.js';
import { icon, logo } from './icons.js';
import { $, $$, esc, instIcon, avatar } from './ui.js';
import { applyTheme } from './themes.js';
import { startRouter, navigate, parseRoute } from './router.js';
import { openCreateInstance, openAccounts } from './modals.js';
import { updateLive, wireGameEvents, setOpenAccounts } from './actions.js';
import { renderHome } from './pages/home.js';
import { renderLibrary } from './pages/library.js';
import { renderInstance } from './pages/instance.js';
import { renderBrowse } from './pages/browse.js';
import { renderSettings } from './pages/settings.js';
import { renderAllShots } from './pages/all-shots.js';
import { renderSkin } from './pages/skin.js';
import { renderProject } from './pages/project.js';
import { wireUpdates } from './updater-ui.js';

const PAGES = {
  home: { render: renderHome, title: 'Главная', live: true },
  library: { render: renderLibrary, title: 'Библиотека', live: true },
  instance: { render: renderInstance, title: 'Сборка', live: true },
  browse: { render: renderBrowse, title: 'Каталог' },
  settings: { render: renderSettings, title: 'Настройки' },
  shots: { render: renderAllShots, title: 'Скриншоты' },
  skin: { render: renderSkin, title: 'Скин' },
  project: { render: renderProject, title: 'Каталог' },
};

let route = parseRoute();

function shell() {
  document.body.classList.add(`platform-${window.api.platform}`);
  $('#app').innerHTML = `
    <header class="titlebar">
      <div class="brand">${logo()}<span>Оникс</span></div>
      <div class="crumbs" data-crumbs></div>
      <div class="titlebar-spacer"></div>
      <div data-running></div>
      <div class="win-controls">
        <button data-win="minimize" aria-label="Свернуть">${icon('minus')}</button>
        <button data-win="maximize" aria-label="Развернуть">${icon('square')}</button>
        <button data-win="close" class="close" aria-label="Закрыть">${icon('x')}</button>
      </div>
    </header>
    <nav class="rail" data-rail></nav>
    <div class="content"><main class="view" id="view"></main></div>`;
  $$('[data-win]').forEach((b) => b.addEventListener('click', () => window.api.window[b.dataset.win]()));
}

function renderRail() {
  const railCount = Math.max(0, Math.min(20, Number.isFinite(Number(state.settings.railCount)) ? Number(state.settings.railCount) : 6));
  const pinned = state.instances.filter((i) => i.pinned);
  const rest = state.instances.filter((i) => !i.pinned).slice(0, Math.max(0, railCount - pinned.length));
  const recent = [...pinned, ...rest];
  const acc = currentAccount();
  const is = (name, id) => route.name === name && (!id || route.parts[0] === id);
  $('[data-rail]').innerHTML = `
    <button class="rail-btn nav ${is('home') ? 'active' : ''}" data-go="/home" data-tip="Главная" aria-label="Главная">${icon('home')}</button>
    <button class="rail-btn nav ${is('browse') || is('project') ? 'active' : ''}" data-go="/browse" data-tip="Каталог" aria-label="Каталог">${icon('compass')}</button>
    ${state.settings.railSkin !== false ? `<button class="rail-btn nav ${is('skin') ? 'active' : ''}" data-go="/skin" data-tip="Скин" aria-label="Скин">${icon('shirt')}</button>` : ''}
    ${state.settings.railShots !== false ? `<button class="rail-btn nav ${is('shots') ? 'active' : ''}" data-go="/shots" data-tip="Все скриншоты" aria-label="Все скриншоты">${icon('image')}</button>` : ''}
    <button class="rail-btn nav ${is('library') ? 'active' : ''}" data-go="/library" data-tip="Библиотека" aria-label="Библиотека">${icon('library')}</button>
    ${recent.length ? '<div class="rail-sep"></div>' : ''}
    ${recent
      .map(
        (i) => `<button class="rail-btn instance ${is('instance', i.id) ? 'active' : ''}" data-go="/instance/${esc(i.id)}" data-tip="${esc(i.name)}${i.pinned ? ' · закреплена' : ''}" aria-label="${esc(i.name)}">
          ${instIcon(i)}${state.running.has(i.id) ? '<span class="running-dot"></span>' : ''}</button>`
      )
      .join('')}
    <div class="rail-spacer"></div>
    <div class="rail-sep"></div>
    <button class="rail-btn nav" data-new data-tip="Новая сборка" aria-label="Новая сборка">${icon('plus')}</button>
    <button class="rail-btn nav ${is('settings') ? 'active' : ''}" data-go="/settings" data-tip="Настройки" aria-label="Настройки">${icon('settings')}</button>
    <button class="rail-btn" data-accounts-btn data-tip="${acc ? esc(acc.name) : 'Добавить аккаунт'}" aria-label="Аккаунты">${avatar(acc)}</button>`;
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.go)));
  $('[data-rail] [data-new]').addEventListener('click', openCreateInstance);
  $('[data-accounts-btn]').addEventListener('click', openAccounts);
}

function renderTitlebar() {
  const crumbs = [`<span>${PAGES[route.name] ? PAGES[route.name].title : ''}</span>`];
  if (route.name === 'instance') {
    const inst = state.instances.find((i) => i.id === route.parts[0]);
    crumbs[0] = `<span style="cursor:pointer" data-crumb-lib>Библиотека</span>`;
    if (inst) crumbs.push(icon('chevronRight'), `<b>${esc(inst.name)}</b>`);
  } else {
    crumbs[0] = `<b>${PAGES[route.name] ? PAGES[route.name].title : ''}</b>`;
  }
  $('[data-crumbs]').innerHTML = crumbs.join('');
  const lib = $('[data-crumb-lib]');
  if (lib) lib.addEventListener('click', () => navigate('/library'));

  const running = state.instances.filter((i) => state.running.has(i.id));
  const preparing = state.instances.filter((i) => state.progress[i.id] && !state.running.has(i.id));
  const box = $('[data-running]');
  if (running.length) {
    box.innerHTML = `<button class="running-pill" data-go-run="${esc(running[0].id)}"><span class="dot"></span>Играет: ${esc(running[0].name)}${running.length > 1 ? ` +${running.length - 1}` : ''}</button>`;
  } else if (preparing.length) {
    box.innerHTML = `<button class="running-pill" data-go-run="${esc(preparing[0].id)}"><span class="dot" style="background:var(--warning);box-shadow:none"></span>Подготовка: ${esc(preparing[0].name)}</button>`;
  } else {
    box.innerHTML = `<div class="running-pill idle"><span class="dot"></span>Ничего не запущено</div>`;
  }
  const go = $('[data-go-run]');
  if (go) go.addEventListener('click', () => navigate(`/instance/${go.dataset.goRun}/logs`));
}

function renderView() {
  const view = $('#view');
  const fresh = view.cloneNode(false); // перезапуск анимации появления
  view.replaceWith(fresh);
  const page = PAGES[route.name] || PAGES.home;
  page.render(fresh, route);
}

function onRoute(r) {
  route = r;
  renderRail();
  renderTitlebar();
  renderView();
}

subscribe((what) => {
  if (what === 'instances' || what === 'accounts') {
    renderRail();
    renderTitlebar();
    const page = PAGES[route.name];
    // Страницу сборки во вкладке журнала не перерисовываем, чтобы не сбивать прокрутку.
    const isLogs = route.name === 'instance' && route.parts[1] === 'logs';
    if (page && page.live && !isLogs) renderView();
  } else if (what === 'settings') {
    renderRail();
    document.body.classList.toggle('low-power', !!state.settings.lowPower);
  } else if (what === 'progress' || what === 'running') {
    updateLive();
    renderTitlebar();
    if (what === 'running') renderRail();
  }
});

async function boot() {
  shell();
  setOpenAccounts(openAccounts);
  try {
    state.settings = await window.api.settings.get();
    applyTheme(state.settings.theme);
    document.body.classList.toggle('low-power', !!state.settings.lowPower);
  } catch {
    /* настройки по умолчанию */
  }
  await Promise.all([loadInstances().catch(() => {}), loadAccounts().catch(() => {})]);
  wireGameEvents();
  wireUpdates();
  startRouter(onRoute);
}

boot();
