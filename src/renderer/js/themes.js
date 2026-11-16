// Темы оформления. Цвета превью повторяют переменные из styles.css.
export const THEMES = [
  { id: 'samurai', name: 'Самурай', bg: '#0b0807', panel: '#130d0c', card: '#251a18', accent: '#e23a3f', hero: 'radial-gradient(circle at 82% 50%,#e23a3f 0 22%,#1d1210 23%)' },
  { id: 'midnight', name: 'Полночь', bg: '#0c0d12', panel: '#12141b', card: '#20242f', accent: '#8b7cff', hero: 'linear-gradient(120deg,#3b2f8f,#13616b)' },
  { id: 'light', name: 'День', bg: '#e9ebf1', panel: '#f5f6fa', card: '#ffffff', accent: '#6d5cf0', hero: 'linear-gradient(120deg,#cfc8ff,#bdeef0)' },
  { id: 'oled', name: 'OLED', bg: '#000000', panel: '#050505', card: '#161618', accent: '#f2f2f5', hero: 'linear-gradient(120deg,#1c1c20,#050505)' },
  { id: 'aurora', name: 'Северное сияние', bg: '#071114', panel: '#0b181c', card: '#152b31', accent: '#3ee6c1', hero: 'linear-gradient(120deg,#1b7a6a,#4b2f8f)' },
  { id: 'sunset', name: 'Закат', bg: '#120c10', panel: '#191116', card: '#2b1d25', accent: '#ff8a4c', hero: 'linear-gradient(120deg,#a4402b,#6b1f5d)' },
  { id: 'sakura', name: 'Сакура', bg: '#f4e9ee', panel: '#fbf4f7', card: '#ffffff', accent: '#e5487d', hero: 'linear-gradient(120deg,#ffc6da,#ffe1c7)' },
  { id: 'forest', name: 'Лес', bg: '#0b100c', panel: '#101711', card: '#1c281f', accent: '#9be15d', hero: 'linear-gradient(120deg,#2f6b2a,#5b4a1d)' },
  { id: 'skulk', name: 'Скалк', bg: '#050b10', panel: '#08131a', card: '#12262f', accent: '#2fe0d6', hero: 'radial-gradient(circle at 80% 50%,#2fe0d6 0 14%,#08161e 60%)' },
  { id: 'lush', name: 'Пышные пещеры', bg: '#08110a', panel: '#0d1a0f', card: '#1b3122', accent: '#ff9a4d', hero: 'linear-gradient(120deg,#5ea83a,#0e2012 55%,#ff9a4d)' },
  { id: 'cherry', name: 'Вишнёвая роща', bg: '#fbe6ee', panel: '#fff3f7', card: '#ffffff', accent: '#e0668f', hero: 'linear-gradient(120deg,#ffb7d0,#ffd6be)' },
  { id: 'end', name: 'Энд', bg: '#09050f', panel: '#10091b', card: '#201334', accent: '#c77dff', hero: 'radial-gradient(circle at 80% 50%,#c77dff 0 12%,#1a0d2e 55%,#09050f)' },
  { id: 'nightsky', name: 'Ночное небо', bg: '#050813', panel: '#0a1022', card: '#141d3a', accent: '#8fb4ff', hero: 'radial-gradient(circle at 82% 40%,#dfe9ff 0 9%,#16224a 40%,#050813)' },
  { id: 'nether', name: 'Незер', bg: '#120706', panel: '#1b0b09', card: '#331510', accent: '#ff6a1f', hero: 'radial-gradient(circle at 80% 60%,#ff6a1f 0 14%,#3a110a 50%,#120706)' },
  { id: 'neon', name: 'Неон', bg: '#07060f', panel: '#0d0b1c', card: '#1a1535', accent: '#ff3df2', hero: 'linear-gradient(120deg,#ff3df2,#2de2ff)' },
  { id: 'mocha', name: 'Мокко', bg: '#14100d', panel: '#1c1612', card: '#30251d', accent: '#d9a066', hero: 'linear-gradient(120deg,#5a3b25,#241913)' },
  { id: 'deepslate', name: 'Глубинный сланец', bg: '#0d0f12', panel: '#14171b', card: '#22272d', accent: '#5fd0c3', hero: 'linear-gradient(120deg,#2b333b,#10151a)' },
  { id: 'glacier', name: 'Ледник', bg: '#e6eef5', panel: '#f3f8fc', card: '#ffffff', accent: '#2a8fd6', hero: 'linear-gradient(120deg,#c9e6f8,#e9f4ff)' },
  { id: 'mint', name: 'Мята', bg: '#e8f3ec', panel: '#f4faf6', card: '#ffffff', accent: '#25a36b', hero: 'linear-gradient(120deg,#c7ecd6,#eaf7d9)' },
  { id: 'ocean', name: 'Океан', bg: '#080d18', panel: '#0c1322', card: '#172238', accent: '#4da3ff', hero: 'linear-gradient(120deg,#1d4f9a,#0f6f7c)' },
];

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) ? id : 'samurai';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('onyx-theme', theme);
  } catch {
    /* хранилище недоступно */
  }
}

// Применяем сохранённую тему до загрузки настроек, чтобы не мигало.
try {
  const saved = localStorage.getItem('onyx-theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch {
  /* ignore */
}

export function themePreview(t) {
  return `<div class="preview" style="background:${t.bg}">
    <div class="pr-rail"><i style="background:${t.accent}"></i><i style="background:${t.card}"></i><i style="background:${t.card}"></i></div>
    <div class="pr-main" style="background:${t.panel}">
      <div class="pr-hero" style="background:${t.hero}"></div>
      <div class="pr-cards"><i style="background:${t.card}"></i><i style="background:${t.card}"></i><i style="background:${t.accent};opacity:.85"></i></div>
    </div></div>`;
}

// ---------- Акцент ----------
export const ACCENTS = [
  ['#e23a3f', 'Алый'], ['#ff7a2f', 'Оранжевый'], ['#f2b83a', 'Золотой'], ['#7bd45a', 'Салатовый'], ['#25c28b', 'Изумруд'],
  ['#2fd6d0', 'Бирюзовый'], ['#4da3ff', 'Небесный'], ['#7b6cff', 'Индиго'], ['#c77dff', 'Сиреневый'], ['#ff4fa3', 'Розовый'],
];

const hexToRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

// Свой цвет акцента поверх любой темы. Пустое значение возвращает акцент темы.
export function applyAccent(hex) {
  const st = document.documentElement.style;
  const names = ['--accent', '--accent-2', '--accent-contrast', '--accent-soft'];
  const rgb = hexToRgb(hex);
  try {
    if (rgb) localStorage.setItem('onyx-accent', hex);
    else localStorage.removeItem('onyx-accent');
  } catch {
    /* хранилище недоступно */
  }
  if (!rgb) {
    names.forEach((n) => st.removeProperty(n));
    return;
  }
  st.setProperty('--accent', toHex(rgb));
  st.setProperty('--accent-2', toHex(mix(rgb, [255, 255, 255], 0.35)));
  st.setProperty('--accent-contrast', lum(rgb) > 0.58 ? '#14100a' : '#ffffff');
  st.setProperty('--accent-soft', `rgba(${rgb.join(',')}, 0.16)`);
}

// Уровень анимаций: off, normal, rich. Экономный режим всё равно отключает их.
export function applyAnim(level) {
  const l = ['off', 'rich'].includes(level) ? level : 'normal';
  document.body.classList.toggle('anim-off', l === 'off');
  document.body.classList.toggle('anim-rich', l === 'rich');
  try {
    localStorage.setItem('onyx-anim', l);
  } catch {
    /* хранилище недоступно */
  }
}
