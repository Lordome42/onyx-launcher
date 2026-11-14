// Новые версии npm блокируют postinstall у electron. Если бинарник не скачан, докачиваем его сами.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let dir;
try {
  dir = path.dirname(require.resolve('electron/package.json'));
} catch {
  process.exit(0); // electron ещё не установлен: npm install сам разберётся
}
const ok = () => fs.existsSync(path.join(dir, 'path.txt')) && fs.existsSync(path.join(dir, 'dist'));
if (!ok()) {
  console.log('[Оникс] Скачиваю Electron (его установку заблокировал npm)…');
  const r = spawnSync(process.execPath, [path.join(dir, 'install.js')], { stdio: 'inherit' });
  if (r.status !== 0 || !ok()) {
    console.error('[Оникс] Не удалось скачать Electron. Выполните вручную: node node_modules/electron/install.js');
    process.exit(1);
  }
}
