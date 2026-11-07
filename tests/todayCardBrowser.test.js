import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
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
    browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle0' });

    // Seed database with a known activity and ensure clean state for today
    await page.evaluate(async () => {
      const { getDB, saveActivity, setCompletion, setDayRained } = await import('./src/storage/storage.js');
      const { todayString } = await import('./src/logic/dateUtils.js');
      const db = await getDB();
      const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
      tx.objectStore('activities').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('dayEntries').clear();
      await new Promise((r) => { tx.oncomplete = r; });

      await saveActivity({
        id: 'act_academia',
        name: 'Academia',
        icon: 'barbell',
        color: '#007aff',
        groups: [
          {
            id: 'grp_muscles',
            name: 'Grupos musculares',
            multiple: true,
            archived: false,
            options: [
              { id: 'opt_peito', name: 'Peito', archived: false },
            ],
          },
        ],
      });

      const today = todayString();
      await setCompletion(today, 'act_academia', false, []);
      await setDayRained(today, false);
    });

    // Reload page to start with fresh seeded data
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.cal-day').length > 30);
    await page.waitForSelector('#today-section');
    await page.waitForSelector('#today-card-content .activity-check-row[data-id="act_academia"]');

    // Verify today cell initial state (no completion dot, no rain icon)
    const initialCell = await page.evaluate(() => {
      const todayEl = document.querySelector('.cal-day--today');
      return {
        hasCompletions: todayEl?.classList.contains('cal-day--has-completions'),
        hasRained: todayEl?.classList.contains('cal-day--rained'),
        dotsCount: todayEl?.querySelectorAll('.cal-dot').length || 0,
        rainIcon: Boolean(todayEl?.querySelector('.cal-day-rain svg')),
      };
    });
    assert(!initialCell.hasCompletions && initialCell.dotsCount === 0, 'Célula de hoje inicia sem bolinhas');
    assert(!initialCell.hasRained && !initialCell.rainIcon, 'Célula de hoje inicia sem chuva');

    // Toggle activity row in "Hoje" card
    console.log('Toggling activity in Hoje card...');
    await page.click('#today-card-content .activity-check-row[data-id="act_academia"]');
    await page.waitForFunction(() =>
      document.querySelector('#today-card-content .activity-check-row[data-id="act_academia"]')?.classList.contains('activity-check-row--done')
    );
    await page.waitForFunction(() =>
      document.querySelector('.cal-day--today')?.classList.contains('cal-day--has-completions')
    );

    // Verify today cell immediately updated with dot, with NO page reload
    const afterActToggle = await page.evaluate(() => {
      const todayEl = document.querySelector('.cal-day--today');
      return {
        hasCompletions: todayEl?.classList.contains('cal-day--has-completions'),
        dotsCount: todayEl?.querySelectorAll('.cal-dot').length || 0,
      };
    });
    assert(afterActToggle.hasCompletions && afterActToggle.dotsCount === 1, 'Célula de hoje atualizou com bolinha imediatamente sem reload');

    // Toggle "Choveu" switch in "Hoje" card
    console.log('Toggling Choveu switch in Hoje card...');
    await page.click('#today-card-rained-switch');
    await page.waitForFunction(() =>
      document.querySelector('#today-card-rained-switch')?.checked === true
    );
    await page.waitForFunction(() =>
      document.querySelector('.cal-day--today')?.classList.contains('cal-day--rained')
    );
    // Give async IndexedDB write time to complete
    await new Promise((r) => setTimeout(r, 200));

    // Verify today cell immediately updated with rain icon, with NO page reload
    const afterRainToggle = await page.evaluate(() => {
      const todayEl = document.querySelector('.cal-day--today');
      return {
        hasRained: todayEl?.classList.contains('cal-day--rained'),
        rainIcon: Boolean(todayEl?.querySelector('.cal-day-rain svg')),
      };
    });
    assert(afterRainToggle.hasRained && afterRainToggle.rainIcon, 'Célula de hoje atualizou com ícone de chuva imediatamente sem reload');

    // Reload page to verify persistence
    console.log('Reloading to verify persistence...');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.cal-day').length > 30);
    await page.waitForSelector('#today-section');
    await page.waitForSelector('#today-card-content .activity-check-row[data-id="act_academia"]');

    // Verify card state persisted
    const cardPersisted = await page.evaluate(() => {
      const row = document.querySelector('#today-card-content .activity-check-row[data-id="act_academia"]');
      const sw = document.querySelector('#today-card-rained-switch');
      return {
        rowDone: row?.classList.contains('activity-check-row--done'),
        swChecked: Boolean(sw?.checked),
      };
    });
    assert(cardPersisted.rowDone, 'Atividade continua marcada no card Hoje após reload');
    assert(cardPersisted.swChecked, 'Choveu continua ligado no card Hoje após reload');

    // Verify today cell state persisted
    const cellPersisted = await page.evaluate(() => {
      const todayEl = document.querySelector('.cal-day--today');
      return {
        hasCompletions: todayEl?.classList.contains('cal-day--has-completions'),
        dotsCount: todayEl?.querySelectorAll('.cal-dot').length || 0,
        hasRained: todayEl?.classList.contains('cal-day--rained'),
        rainIcon: Boolean(todayEl?.querySelector('.cal-day-rain svg')),
      };
    });
    assert(cellPersisted.hasCompletions && cellPersisted.dotsCount === 1, 'Bolinha de hoje persiste na célula após reload');
    assert(cellPersisted.hasRained && cellPersisted.rainIcon, 'Ícone de chuva persiste na célula após reload');

    console.log('\ntodayCardBrowser check: all assertions passed!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    await browser?.close();
    server.close();
  }
});
