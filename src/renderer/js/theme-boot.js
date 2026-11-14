// Применяет сохранённую тему до отрисовки, чтобы окно не мигало.
try {
  var t = localStorage.getItem('onyx-theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
