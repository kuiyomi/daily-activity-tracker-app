import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`  ✅ ${message}`);
};
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

server.listen(0, '127.0.0.1', async () => {
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.cal-day').length > 30);
    const current = await page.evaluate(() => ({
      header: document.querySelector('.ios-nav-bar').getBoundingClientRect().top,
      card: document.querySelector('.calendar-card').getBoundingClientRect().top,
      hidden: document.querySelector('#btn-today').matches('.is-visually-hidden'),
    }));
    await page.click('#btn-prev');
    await page.waitForFunction(() => !document.querySelector('#btn-today').matches('.is-visually-hidden'));
    const other = await page.evaluate(() => ({
      header: document.querySelector('.ios-nav-bar').getBoundingClientRect().top,
      card: document.querySelector('.calendar-card').getBoundingClientRect().top,
      visible: !document.querySelector('#btn-today').matches('.is-visually-hidden'),
      interactive: document.querySelector('#btn-today').tabIndex === 0,
    }));
    assert(current.header === other.header && current.card === other.card, 'topos do cabeçalho e cartão não mudam entre meses');
    assert(current.hidden && other.visible && other.interactive, 'Hoje permanece reservado, mas só interage fora do mês atual');
  } finally {
    await browser?.close();
    server.close();
  }
});
