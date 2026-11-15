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
