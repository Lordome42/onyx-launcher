// Локальная сборка установщика для проверки: node scripts/release.js. Результат в папке release/.
// Настоящий релиз делает GitHub Actions по тегу (см. README, раздел «Выпуск обновления»).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
console.log(`Собираю Оникс ${pkg.version}…`);
const r = spawnSync('npx', ['electron-builder', '--win', '--publish', 'never'], { cwd: root, stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status || 1);

const out = path.join(root, 'release');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const dist = path.join(root, 'dist');
const files = fs.readdirSync(dist).filter((f) => /^Onyx-Setup-.*\.exe(\.blockmap)?$/.test(f) || f === 'latest.yml');
for (const f of files) fs.copyFileSync(path.join(dist, f), path.join(out, f));
console.log(`\nГотово, файлы в папке release:\n${files.map((f) => '  - ' + f).join('\n')}`);
