// Собирает установщик и кладёт всё, что нужно для автообновления, в папку release/.
// Содержимое папки выгружается на любой статический хостинг по адресу из настроек лаунчера.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const crypto = require('crypto');
const url = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.env.ONYX_UPDATE_URL;
const flag = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : ''; };
// Для Dropbox и подобных хранилищ: прямая ссылка на выгруженный установщик Onyx-Setup.exe.
const installerUrl = flag('--installer-url') || process.env.ONYX_INSTALLER_URL || '';
const args = ['electron-builder', '--win', '--publish', 'never'];
if (url) args.push(`-c.publish.url=${url.endsWith('/') ? url : url + '/'}`);

console.log(`Собираю Оникс ${pkg.version}…`);
const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status || 1);

const out = path.join(root, 'release');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const dist = path.join(root, 'dist');
const files = fs.readdirSync(dist).filter((f) => /^Onyx-Setup-.*\.exe(\.blockmap)?$/.test(f) || f === 'latest.yml');
for (const f of files) fs.copyFileSync(path.join(dist, f), path.join(out, f));
// Вариант без папки на сервере (Dropbox и т.п.): один файл onyx-update.json со ссылкой на установщик.
const exe = files.find((f) => /\.exe$/.test(f));
fs.copyFileSync(path.join(out, exe), path.join(out, 'Onyx-Setup.exe'));
const buf = fs.readFileSync(path.join(out, exe));
fs.writeFileSync(
  path.join(out, 'onyx-update.json'),
  JSON.stringify({ version: pkg.version, url: installerUrl || 'ВСТАВЬТЕ_ПРЯМУЮ_ССЫЛКУ_НА_Onyx-Setup.exe', sha512: crypto.createHash('sha512').update(buf).digest('base64'), size: buf.length, notes: flag('--notes') || '' }, null, 2) + '\n'
);
files.push('Onyx-Setup.exe', 'onyx-update.json');
console.log(`\nГотово. Выгрузите всё из папки release на хостинг:\n  ${files.map((f) => '- ' + f).join('\n  ')}`);
console.log(url ? `\nАдрес обновлений: ${url}` : '\nАдрес обновлений укажите в настройках лаунчера (или в package.json, поле onyxUpdateSource).');
