// Простой hash-роутер: #/home, #/library, #/instance/<id>/<tab>, #/browse?type=mod&instance=<id>, #/settings
let onChange = () => {};

export function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [pathPart, query = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'home', parts: parts.slice(1), query: Object.fromEntries(new URLSearchParams(query)) };
}

export function navigate(path) {
  if (location.hash === '#' + path) onChange(parseRoute());
  else location.hash = path;
}

export function startRouter(fn) {
  onChange = fn;
  window.addEventListener('hashchange', () => onChange(parseRoute()));
  onChange(parseRoute());
}
