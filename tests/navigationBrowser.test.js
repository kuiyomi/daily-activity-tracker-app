import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

let total = 0;
let failures = 0;

function check(condition, message) {
  total++;
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const url = `http://127.0.0.1:${server.address().port}/`;
    const expected = {
      calendario: 'Calendário',
      atividades: 'Atividades',
      resumo: 'Resumo',
      ajustes: 'Ajustes',
    };
    const tabs = Object.keys(expected);

    // Seed IndexedDB once on origin before running navigation matrix
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const { getDB, saveActivity, setCompletion, setDayRained, setDayNotes } = await import('./src/storage/storage.js');
      const db = await getDB();
      const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
      tx.objectStore('activities').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('dayEntries').clear();
      await new Promise((r) => {
        tx.oncomplete = r;
      });
      await saveActivity({
        id: 'act_academia',
        name: 'Academia',
        icon: 'barbell',
        color: '#007aff',
        usesMuscleGroups: true,
      });
      const firstDay = document.querySelector('.cal-day')?.getAttribute('data-date') || '2026-11-01';
      await setCompletion(firstDay, 'act_academia', true, ['mg_peito']);
      await setDayRained(firstDay, true);
      await setDayNotes(firstDay, 'Treino semeado');
    });

    const fresh = async () => {
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelectorAll('.cal-day').length > 30);
    };

    const getVisibleState = () =>
      page.evaluate(() => ({
        title: document.querySelector('.view-layer--current h1')?.textContent.trim() || null,
        activeTab: document.querySelector('.ios-tab-item.active')?.dataset.tab || null,
        currentLayers: document.querySelectorAll('.view-layer--current').length,
      }));

    const tapTab = async (tab) => {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForFunction(
        (expectedTitle, expectedTab) =>
          document.querySelector('.view-layer--current h1')?.textContent.trim() === expectedTitle &&
          document.querySelector('.ios-tab-item.active')?.dataset.tab === expectedTab,
        { timeout: 3000 },
        expected[tab],
        tab
      );
    };

    const screens = [
      {
        name: 'Calendário',
        open: async () => {},
      },
      {
        name: 'detalhe do dia',
        open: async () => {
          await page.click('.cal-day');
          await page.waitForSelector('.day-detail-screen');
        },
      },
      {
        name: 'lista de atividades',
        open: async () => {
          await tapTab('atividades');
        },
      },
      {
        name: 'Ajustes',
        open: async () => {
          await tapTab('ajustes');
        },
      },
      {
        name: 'grupos musculares',
        open: async () => {
          await tapTab('ajustes');
          await page.click('#btn-goto-muscle-groups');
          await page.waitForSelector('.muscle-groups-screen');
        },
      },
    ];

    for (const screen of screens) {
      // 1. Normal taps: every tab is reachable directly from this screen
      for (const targetTab of tabs) {
        await fresh();
        await screen.open();
        await tapTab(targetTab);
        const state = await getVisibleState();
        check(
          state.title === expected[targetTab] && state.activeTab === targetTab && state.currentLayers === 1,
          `toque normal de "${screen.name}" para "${targetTab}" (título="${state.title}", aba="${state.activeTab}")`
        );
      }

      // 2. Rapid taps: every tab is reachable with rapid multi-tab taps starting from this screen
      for (const targetTab of tabs) {
        await fresh();
        await screen.open();
        const otherTabs = tabs.filter((t) => t !== targetTab);
        const sequence = [otherTabs[0], otherTabs[1], targetTab];
        await page.evaluate((seq) => {
          for (const t of seq) {
            document.querySelector(`[data-tab="${t}"]`)?.click();
          }
        }, sequence);
        await page.waitForFunction(
          (expectedTitle, expectedTab) =>
            document.querySelector('.view-layer--current h1')?.textContent.trim() === expectedTitle &&
            document.querySelector('.ios-tab-item.active')?.dataset.tab === expectedTab,
          { timeout: 3000 },
          expected[targetTab],
          targetTab
        );
        const state = await getVisibleState();
        check(
          state.title === expected[targetTab] && state.activeTab === targetTab && state.currentLayers === 1,
          `toques rápidos (${sequence.join(' -> ')}) de "${screen.name}" para "${targetTab}" (título="${state.title}", aba="${state.activeTab}")`
        );
      }
    }

    // 3. Render failure restores previous screen & tab highlight and logs with console.error
    await fresh();
    const consoleErrors = [];
    const onConsole = (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    page.on('console', onConsole);

    await page.evaluate(() => {
      const origQS = Element.prototype.querySelector;
      let failOnce = true;
      Element.prototype.querySelector = function (sel) {
        if (failOnce && sel === '.screen-view' && this.classList?.contains('view-layer')) {
          failOnce = false;
          throw new Error('Falha simulada de montagem');
        }
        return origQS.call(this, sel);
      };
    });
    await page.click('[data-tab="atividades"]');
    await new Promise((r) => setTimeout(r, 100));
    const afterFail = await getVisibleState();
    check(
      afterFail.title === 'Calendário' && afterFail.activeTab === 'calendario' && consoleErrors.some((e) => e.includes('Falha ao renderizar tela')),
      `falha ao renderizar restaura tela e destaque anteriores e registra console.error (título="${afterFail.title}", aba="${afterFail.activeTab}")`
    );

    // 4. Stalled mount (>500ms) releases lock and subsequent tab tap navigates normally
    await page.evaluate(async () => {
      const origOpen = indexedDB.open.bind(indexedDB);
      let stallOnce = true;
      indexedDB.open = function (...args) {
        if (stallOnce) {
          stallOnce = false;
          const req = origOpen(...args);
          const descriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
          Object.defineProperty(req, 'onsuccess', {
            set(fn) {
              setTimeout(() => descriptor.set.call(this, fn), 700);
            },
          });
          return req;
        }
        return origOpen(...args);
      };
    });
    await page.click('[data-tab="atividades"]');
    await new Promise((r) => setTimeout(r, 550));
    await tapTab('ajustes');
    const afterStall = await getVisibleState();
    check(
      afterStall.title === 'Ajustes' && afterStall.activeTab === 'ajustes',
      `bloqueio >500ms é liberado e permite navegar para Ajustes (título="${afterStall.title}", aba="${afterStall.activeTab}")`
    );
    page.off('console', onConsole);
  } catch (err) {
    failures++;
    console.error(`FAIL: ${err.message}`);
  } finally {
    await browser?.close();
    server.close();
    const passed = total - failures;
    console.log(`Resumo navegação: ${passed}/${total} verificações passaram, ${failures} falharam.`);
    if (failures > 0) process.exitCode = 1;
  }
});
