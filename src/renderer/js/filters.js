// Боковая панель фильтров каталога: версия игры, загрузчик, категория, среда, лицензия.
import { icon } from './icons.js';
import { esc, $, $$ } from './ui.js';

const CAT_RU = {
  adventure: 'Приключения', cursed: 'Странные', decoration: 'Оформление', economy: 'Экономика', equipment: 'Снаряжение', food: 'Еда',
  'game-mechanics': 'Игровые механики', library: 'Библиотеки', magic: 'Магия', management: 'Управление', minigame: 'Мини-игры', mobs: 'Мобы',
  optimization: 'Оптимизация', social: 'Социальные', storage: 'Хранение', technology: 'Технологии', transportation: 'Передвижение', utility: 'Утилиты', worldgen: 'Генерация мира',
  // ресурспаки
  combat: 'Бой', modded: 'Для модов', realistic: 'Реализм', simplistic: 'Минимализм', themed: 'Тематические', tweaks: 'Мелкие правки', 'vanilla-like': 'Как ваниль',
  audio: 'Звуки', blocks: 'Блоки', 'core-shaders': 'Основные шейдеры', entities: 'Существа', environment: 'Окружение', fonts: 'Шрифты', gui: 'Интерфейс', items: 'Предметы', locale: 'Перевод', models: 'Модели',
  // шейдеры
  cartoon: 'Мультяшные', fantasy: 'Фэнтези', 'semi-realistic': 'Полуреализм', atmosphere: 'Атмосфера', bloom: 'Свечение', 'colored-lighting': 'Цветной свет', foliage: 'Растительность', 'path-tracing': 'Трассировка путей', pbr: 'PBR', reflections: 'Отражения', shadows: 'Тени',
  // загрузка
  low: 'Низкая', medium: 'Средняя', high: 'Высокая', potato: 'Слабое железо', screenshot: 'Для скриншотов',
};
const HEADER_RU = { categories: '', resolutions: 'Разрешение', features: 'Особенности', 'performance impact': 'Нагрузка на ПК' };
const LOADER_RU = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt', babric: 'Babric', 'bta-babric': 'BTA (Babric)', 'java-agent': 'Java Agent', 'legacy-fabric': 'Legacy Fabric', liteloader: 'LiteLoader', modloader: "Risugami's ModLoader", nilloader: 'NilLoader', ornithe: 'Ornithe', rift: 'Rift', iris: 'Iris', optifine: 'OptiFine', canvas: 'Canvas', vanilla: 'Ванильные' };
const LOADER_COLOR = { fabric: '#dbb69b', forge: '#959aef', neoforge: '#f99e6b', quilt: '#c796f9', 'bta-babric': '#7ac943', liteloader: '#6aa7e8', nilloader: '#e8456e', ornithe: '#6aaef0', iris: '#a5d6a7', optifine: '#e8b04a', canvas: '#6ab0f0' };
const CAT_ICON = {
  library: 'layers', worldgen: 'globe', food: 'heart', 'game-mechanics': 'settings', magic: 'sparkles', minigame: 'gamepad', mobs: 'user', optimization: 'zap',
  decoration: 'home', transportation: 'compass', adventure: 'compass', equipment: 'shield', social: 'heart', cursed: 'alert', technology: 'cpu', management: 'server', utility: 'wrench', storage: 'box', economy: 'key',
};

const FALLBACK = {
  mod: {
    categories: ['library', 'worldgen', 'food', 'game-mechanics', 'magic', 'minigame', 'mobs', 'optimization', 'decoration', 'transportation', 'adventure', 'equipment', 'social', 'cursed', 'technology', 'management', 'utility', 'storage', 'economy'].map((n) => ({ name: n })),
    loaders: ['fabric', 'forge', 'neoforge', 'quilt', 'babric', 'bta-babric', 'java-agent', 'legacy-fabric', 'liteloader', 'modloader', 'nilloader', 'ornithe', 'rift'],
  },
  modpack: {
    categories: ['adventure', 'challenging', 'combat', 'kitchen-sink', 'lightweight', 'magic', 'multiplayer', 'optimization', 'quests', 'technology'].map((n) => ({ name: n })),
    loaders: ['fabric', 'forge', 'neoforge', 'quilt'],
  },
  resourcepack: {
    categories: [['combat', 'categories'], ['cursed', 'categories'], ['decoration', 'categories'], ['modded', 'categories'], ['realistic', 'categories'], ['simplistic', 'categories'], ['themed', 'categories'], ['tweaks', 'categories'], ['utility', 'categories'], ['vanilla-like', 'categories'],
      ['8x-', 'resolutions'], ['16x', 'resolutions'], ['32x', 'resolutions'], ['48x', 'resolutions'], ['64x', 'resolutions'], ['128x', 'resolutions'], ['256x', 'resolutions'], ['512x+', 'resolutions'],
      ['audio', 'features'], ['blocks', 'features'], ['core-shaders', 'features'], ['entities', 'features'], ['environment', 'features'], ['fonts', 'features'], ['gui', 'features'], ['items', 'features'], ['locale', 'features'], ['models', 'features']].map(([name, header]) => ({ name, header })),
    loaders: [],
  },
  shader: {
    categories: [['cartoon', 'categories'], ['cursed', 'categories'], ['fantasy', 'categories'], ['realistic', 'categories'], ['semi-realistic', 'categories'], ['vanilla-like', 'categories'],
      ['atmosphere', 'features'], ['bloom', 'features'], ['colored-lighting', 'features'], ['foliage', 'features'], ['path-tracing', 'features'], ['pbr', 'features'], ['reflections', 'features'], ['shadows', 'features'],
      ['high', 'performance impact'], ['low', 'performance impact'], ['medium', 'performance impact'], ['potato', 'performance impact'], ['screenshot', 'performance impact']].map(([name, header]) => ({ name, header })),
    loaders: ['iris', 'optifine', 'canvas', 'vanilla'],
  },
};

// SVG-иконки из API Modrinth пропускаем через белый список элементов.
const SVG_OK = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g']);
const ATTR_OK = new Set(['d', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'rx', 'ry', 'points', 'transform']);
function cleanSvg(src) {
  try {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'svg') return '';
    const walk = (node) => {
      let out = '';
      for (const el of node.children) {
        const tag = el.nodeName.toLowerCase();
        if (!SVG_OK.has(tag)) continue;
        const attrs = [...el.attributes].filter((a) => ATTR_OK.has(a.name)).map((a) => `${a.name}="${esc(a.value)}"`).join(' ');
        out += `<${tag} ${attrs}>${walk(el)}</${tag}>`;
      }
      return out;
    };
    return walk(root);
  } catch {
    return '';
  }
}
const svgIcon = (inner) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

export function createFilters({ mount, getType, getSource, lockVersionLoader, versionsPromise, onChange }) {
  const st = { versions: new Set(), loaders: new Set(), categories: new Set(), client: false, server: false, openSource: false, showAll: false, verQ: '', allLoaders: false, open: new Set() };
  let tagData = null;
  let mcVersions = [];
  versionsPromise.then((v) => { mcVersions = v; if (mount.isConnected) draw(); }).catch(() => {});
  window.api.modrinth.tags().then((t) => { tagData = t; if (mount.isConnected) draw(); }).catch(() => {});

  const typeData = () => {
    const type = getType();
    const fb = FALLBACK[type] || FALLBACK.mod;
    let categories = fb.categories;
    let loaders = fb.loaders.map((name) => ({ name }));
    if (tagData) {
      const cs = tagData.categories.filter((c) => c.type === type);
      if (cs.length) categories = cs;
      const ls = tagData.loaders.filter((l) => (l.types || []).includes(type));
      if (ls.length) loaders = ls;
    }
    return { categories, loaders };
  };

  const itemHtml = (kind, name, label, iconHtml, color) => {
    const on = st[kind].has(name);
    return `<button type="button" class="f-item ${on ? 'on' : ''}" data-f="${kind}" data-v="${esc(name)}" aria-pressed="${on}" ${color ? `style="--fc:${color}"` : ''}>${iconHtml}<span>${esc(label)}</span></button>`;
  };
  const section = (key, title, body, active) => {
    const open = st.open.has(key);
    return `<div class="f-section ${open ? 'open' : ''}"><button type="button" class="f-head" data-sec="${key}" aria-expanded="${open}"><span>${title}${active ? `<i class="f-badge">${active}</i>` : ''}</span>${icon('chevronDown')}</button>${open ? `<div class="f-body">${body}</div>` : ''}</div>`;
  };

  const versionList = () => {
    const q = st.verQ.trim().toLowerCase();
    const list = mcVersions.filter((v) => (st.showAll || v.type === 'release') && (!q || v.id.toLowerCase().includes(q)));
    return list.length
      ? list.map((v) => `<button type="button" class="f-item ${st.versions.has(v.id) ? 'on' : ''}" data-f="versions" data-v="${esc(v.id)}" aria-pressed="${st.versions.has(v.id)}"><span>${esc(v.id)}</span></button>`).join('')
      : `<div class="faint" style="padding:8px">${mcVersions.length ? 'Ничего не найдено' : 'Загружаю версии…'}</div>`;
  };

  function draw() {
    if (!mount.isConnected) return;
    const type = getType();
    const source = getSource();
    const { categories, loaders } = typeData();
    const parts = [];
    if (!lockVersionLoader()) {
      parts.push(
        section('versions', 'Версия игры', `<div class="search f-search"><label for="f-vq" style="position:absolute;left:-9999px">Поиск версии</label>${icon('search')}<input id="f-vq" class="input" placeholder="Поиск…" value="${esc(st.verQ)}" /></div>
          <div class="f-scroll" data-vlist>${versionList()}</div>
          <label class="f-check"><input type="checkbox" data-showall ${st.showAll ? 'checked' : ''} /><span>Показывать все версии</span></label>`, st.versions.size)
      );
      if (loaders.length) {
        const shown = st.allLoaders ? loaders : loaders.slice(0, 4);
        parts.push(
          section('loaders', 'Загрузчик', shown.map((l) => itemHtml('loaders', l.name, LOADER_RU[l.name] || l.name, l.icon && cleanSvg(l.icon) ? svgIcon(cleanSvg(l.icon)) : icon('puzzle'), LOADER_COLOR[l.name])).join('') +
            (loaders.length > 4 ? `<button type="button" class="f-more" data-moreloaders>${icon(st.allLoaders ? 'chevronUp' : 'chevronDown')}${st.allLoaders ? 'Показать меньше' : 'Показать больше'}</button>` : ''), st.loaders.size)
        );
      }
    }
    if (source === 'modrinth') {
      if (categories.length) {
        const groups = new Map();
        for (const c of categories) {
          const h = c.header || 'categories';
          if (!groups.has(h)) groups.set(h, []);
          groups.get(h).push(c);
        }
        const body = [...groups.entries()]
          .map(([h, list]) => `${HEADER_RU[h] ? `<div class="f-sub">${HEADER_RU[h]}</div>` : ''}${list.map((c) => itemHtml('categories', c.name, CAT_RU[c.name] || c.name.replace(/-/g, ' '), c.icon && cleanSvg(c.icon) ? svgIcon(cleanSvg(c.icon)) : icon(CAT_ICON[c.name] || 'layers'))).join('')}`)
          .join('');
        parts.push(section('categories', 'Категория', body, st.categories.size));
      }
      if (type === 'mod' || type === 'modpack') {
        const flag = (key, label, ic) => `<button type="button" class="f-item ${st[key] ? 'on' : ''}" data-flag="${key}" aria-pressed="${st[key]}">${icon(ic)}<span>${label}</span></button>`;
        parts.push(section('env', 'Среда', flag('client', 'Клиент', 'gamepad') + flag('server', 'Сервер', 'server'), (st.client ? 1 : 0) + (st.server ? 1 : 0)));
      }
      parts.push(section('license', 'Лицензия', `<button type="button" class="f-item ${st.openSource ? 'on' : ''}" data-flag="openSource" aria-pressed="${st.openSource}"><span>Открытый исходный код</span></button>`, st.openSource ? 1 : 0));
    }
    const any = st.versions.size || st.loaders.size || st.categories.size || st.client || st.server || st.openSource;
    mount.innerHTML = `${any ? `<button type="button" class="btn sm ghost f-reset" data-reset>${icon('x')}Сбросить фильтры</button>` : ''}${parts.join('')}${
      source === 'curseforge' ? '<p class="faint f-note">Для CurseForge работают версия и загрузчик. Категории, среда и лицензия есть только у Modrinth.</p>' : ''
    }`;
    wire();
  }

  function wire() {
    $$('[data-sec]', mount).forEach((b) =>
      b.addEventListener('click', () => {
        st.open.has(b.dataset.sec) ? st.open.delete(b.dataset.sec) : st.open.add(b.dataset.sec);
        draw();
      })
    );
    $$('[data-f]', mount).forEach((b) =>
      b.addEventListener('click', () => {
        const set = st[b.dataset.f];
        set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
        const vl = $('[data-vlist]', mount);
        const top = vl ? vl.scrollTop : 0;
        draw();
        const vl2 = $('[data-vlist]', mount);
        if (vl2) vl2.scrollTop = top;
        onChange();
      })
    );
    $$('[data-flag]', mount).forEach((b) =>
      b.addEventListener('click', () => {
        st[b.dataset.flag] = !st[b.dataset.flag];
        draw();
        onChange();
      })
    );
    const vq = $('#f-vq', mount);
    if (vq) vq.addEventListener('input', (e) => { st.verQ = e.target.value; $('[data-vlist]', mount).innerHTML = versionList(); wireVersionItems(); });
    const sa = $('[data-showall]', mount);
    if (sa) sa.addEventListener('change', (e) => { st.showAll = e.target.checked; draw(); });
    const ml = $('[data-moreloaders]', mount);
    if (ml) ml.addEventListener('click', () => { st.allLoaders = !st.allLoaders; draw(); });
    const rs = $('[data-reset]', mount);
    if (rs) rs.addEventListener('click', () => { reset(); draw(); onChange(); });
  }
  function wireVersionItems() {
    $$('[data-vlist] [data-f]', mount).forEach((b) =>
      b.addEventListener('click', () => {
        st.versions.has(b.dataset.v) ? st.versions.delete(b.dataset.v) : st.versions.add(b.dataset.v);
        b.classList.toggle('on', st.versions.has(b.dataset.v));
        b.setAttribute('aria-pressed', st.versions.has(b.dataset.v));
        onChange();
      })
    );
  }
  function reset() {
    st.versions.clear(); st.loaders.clear(); st.categories.clear(); st.client = st.server = st.openSource = false;
  }
  return {
    draw,
    // при смене типа контента выбранные категории и загрузчики теряют смысл
    typeChanged() { st.categories.clear(); st.loaders.clear(); draw(); },
    params() {
      const source = getSource();
      return {
        versions: [...st.versions],
        loaders: [...st.loaders],
        categories: source === 'modrinth' ? [...st.categories] : [],
        client: source === 'modrinth' && st.client,
        server: source === 'modrinth' && st.server,
        openSource: source === 'modrinth' && st.openSource,
      };
    },
  };
}
