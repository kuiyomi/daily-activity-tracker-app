import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`  ✅ ${message}`);
};
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
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

    for (const reduced of [false, true]) {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
      await page.evaluate(() => {
        document.querySelector('.cal-day')?.click();
        document.querySelector('[data-tab="atividades"]')?.click();
        document.querySelector('[data-tab="ajustes"]')?.click();
      });
      await new Promise((resolve) => setTimeout(resolve, reduced ? 80 : 500));
      const state = await page.evaluate(() => ({
        current: document.querySelectorAll('.view-layer--current').length,
        screens: document.querySelectorAll('.view-layer--current .screen-view').length,
        settings: Boolean(document.querySelector('.settings-screen')),
        tabVisible: !document.querySelector('.ios-tab-bar')?.classList.contains('hidden'),
      }));
      assert(state.current === 1 && state.screens === 1, `toques rápidos deixam uma tela ativa (movimento reduzido: ${reduced})`);
      assert(state.settings && state.tabVisible, `aba e barra corretas após toques rápidos (movimento reduzido: ${reduced})`);
    }

    await page.click('[data-tab="calendario"]');
    await page.waitForSelector('.calendar-screen');
    await page.click('.cal-day');
    await page.waitForSelector('.day-detail-screen');
    await page.click('#btn-back');
    await page.waitForSelector('.calendar-screen');
    assert(true, 'detalhe do dia retorna ao calendário');
  } finally {
    await browser?.close();
    server.close();
  }
});
