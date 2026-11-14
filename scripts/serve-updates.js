// Локальный тестовый сервер обновлений: node scripts/serve-updates.js [порт]. Отдаёт папку release/.
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'release');
const port = Number(process.argv[2]) || 8080;
http
  .createServer((req, res) => {
    const file = path.join(dir, path.basename(decodeURIComponent(req.url.split('?')[0])));
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(port, () => console.log(`Обновления доступны по адресу http://localhost:${port}/`));
