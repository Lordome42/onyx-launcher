// Применяет сохранённую тему и акцент до отрисовки, чтобы окно не мигало.
try {
  var t = localStorage.getItem('onyx-theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
  var a = localStorage.getItem('onyx-accent');
  var m = a && /^#([0-9a-f]{6})$/i.exec(a);
  if (m) {
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var st = document.documentElement.style;
    var mx = function (v) { return Math.round(v + (255 - v) * 0.35).toString(16).padStart(2, '0'); };
    st.setProperty('--accent', a);
    st.setProperty('--accent-2', '#' + mx(r) + mx(g) + mx(b));
    st.setProperty('--accent-contrast', (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.58 ? '#14100a' : '#ffffff');
    st.setProperty('--accent-soft', 'rgba(' + r + ',' + g + ',' + b + ', 0.16)');
  }
} catch (e) {}
