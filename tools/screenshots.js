// Снимает скриншоты интерфейса с демо-данными: node tools/screenshots.js <outDir>
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', 'src', 'renderer');
const out = process.argv[2] || 'shots';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
(async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  const mock = fs.readFileSync(path.join(__dirname, 'mock-api.js'), 'utf8');
  const errors = [];
  async function shot(name, theme, hash, action, qs = '') {
    const ctx = await browser.newContext({ viewport: { width: 1240, height: 780 }, deviceScaleFactor: Number(process.env.DSF || 1), bypassCSP: true });
    await ctx.addInitScript(mock);
    await ctx.addInitScript(`try{localStorage.setItem('onyx-theme','${theme}')}catch(e){}`);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await page.goto(`http://localhost:${port}/?theme=${theme}${qs}${hash}`);
    await page.waitForTimeout(600);
    if (action) { await action(page); await page.waitForTimeout(500); }
    await page.screenshot({ path: path.join(out, name + '.png') });
    await ctx.close();
  }
  await shot('01-library-import', 'samurai', '#/library');
  await shot('02-content-file', 'samurai', '#/instance/survival');
  await shot('03-instance-settings', 'samurai', '#/instance/survival/settings');
  await shot('04-export', 'samurai', '#/instance/survival/settings', (p) => p.click('[data-export]'));
  await shot('05-updates', 'samurai', '#/instance/survival', (p) => p.click('[data-upd]'));
  await shot('06-check', 'samurai', '#/instance/survival', (p) => p.click('[data-check]'));
  await shot('07-screenshots', 'samurai', '#/instance/survival/shots');
  await shot('08-logs', 'samurai', '#/instance/survival/logs', (p) => p.selectOption('#lg-src', 'logs/latest.log'));
  await shot('09-project', 'samurai', '#/project/modrinth/AANobbMI?instance=survival');
  await shot('10-project-versions', 'samurai', '#/project/modrinth/AANobbMI?instance=survival', (p) => p.click('[data-ptab=versions]'));
  await shot('11-filters', 'samurai', '#/browse', async (p) => { await p.click('[data-sec=categories]'); await p.click('[data-f=categories][data-v=magic]'); await p.click('[data-sec=loaders]'); await p.click('[data-sec=versions]'); });
  await shot('12-filters-closed', 'samurai', '#/browse');
  await shot('13-datadir', 'samurai', '#/settings', (p) => p.click('[data-sec=about]'));
  for (const th of ['skulk', 'lush', 'cherry']) await shot('theme-' + th, th, '#/home');
  await shot('theme-picker', 'skulk', '#/settings');
  await shot('14-home', 'samurai', '#/home');
  await shot('15-home-empty', 'samurai', '#/home', null, '&empty=1');
  await shot('16-settings-scroll', 'samurai', '#/settings', async (p) => { await p.evaluate(() => document.querySelector('#view').scrollTo(0, 99999)); });
  await browser.close(); server.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
})();
