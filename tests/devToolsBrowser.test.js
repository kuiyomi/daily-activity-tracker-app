import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const PROJECT_ROOT = process.cwd();
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected "${expected}", got "${actual}")`);
  }
  console.log(`  ✅ ${message}`);
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(PROJECT_ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Mock Date with reference "today" as 2026-11-15
    await page.evaluateOnNewDocument(() => {
      const FIXED_TIME = new Date(2026, 10, 15, 12, 0, 0).getTime();
      const OriginalDate = Date;
      class MockDate extends OriginalDate {
        constructor(...args) {
          if (args.length === 0) {
            super(FIXED_TIME);
          } else {
            super(...args);
          }
        }
        static now() {
          return FIXED_TIME;
        }
      }
      globalThis.Date = MockDate;
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });

    // Seed initial real user data
    await page.evaluate(async () => {
      localStorage.clear();
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('DadsCalendarDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      await new Promise((resolve, reject) => {
        const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
        tx.objectStore('activities').clear();
        tx.objectStore('completions').clear();
        tx.objectStore('dayEntries').clear();

        const actStore = tx.objectStore('activities');
        // Real Academia activity
        actStore.put({
          id: 'act_academia',
          name: 'Academia',
          icon: 'barbell',
          color: '#007aff',
          allowsNote: false,
          groups: [],
          demo: false,
        });

        // Real custom activity
        actStore.put({
          id: 'act_real_corrida',
          name: 'Corrida Matinal Real',
          icon: 'person-simple-run',
          color: '#ff9500',
          allowsNote: false,
          groups: [],
          demo: false,
        });

        const compStore = tx.objectStore('completions');
        // Real completion on 2026-11-10
        compStore.put({
          id: '2026-11-10:act_academia',
          date: '2026-11-10',
          activityId: 'act_academia',
          status: 'done',
          wasPlanned: true,
          note: 'Treino real do usuário',
          demo: false,
        });

        const dayStore = tx.objectStore('dayEntries');
        // Real day entry on 2026-11-10
        dayStore.put({
          date: '2026-11-10',
          rained: true,
          notes: 'Anotação real de chuva',
          demo: false,
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    });

    console.log('\n--- 1. Navegar até a aba Ajustes ---');
    const ajustesTabBtn = await page.waitForSelector('[data-tab="ajustes"]');
    await ajustesTabBtn.click();
    await page.waitForSelector('.settings-screen');

    // Confirm dev tools section is NOT present initially (no visual hint beforehand)
    const initialDevTools = await page.$('#dev-tools-section');
    assert(initialDevTools === null, 'Seção "Ferramentas de teste" está oculta inicialmente (sem dica visual)');

    console.log('\n--- 2. Tocar 7 vezes em Versão dentro de 3 segundos revela Ferramentas de teste ---');
    const versionRow = await page.waitForSelector('#about-row-version');
    assert(versionRow, 'Linha "Versão" existe na seção Sobre');

    for (let i = 0; i < 7; i++) {
      await versionRow.click();
      await new Promise((r) => setTimeout(r, 60));
    }

    await page.waitForSelector('#dev-tools-section');
    const devToolsTitle = await page.$eval('#dev-tools-section .inset-section-header', (el) => el.textContent.trim());
    assertEqual(devToolsTitle, 'Ferramentas de teste', 'Seção "Ferramentas de teste" revelada com sucesso');

    // Verify localStorage persistence
    const isUnlockedInStorage = await page.evaluate(() => localStorage.getItem('agenda_dev_tools_unlocked'));
    assertEqual(isUnlockedInStorage, 'true', 'Desbloqueio foi persistido no localStorage');

    // Verify the three rows
    const loadBtn = await page.waitForSelector('#btn-load-demo-data');
    assert(loadBtn, 'Botão "Carregar dados de exemplo" está presente');

    const removeBtn = await page.waitForSelector('#btn-remove-demo-data');
    assert(removeBtn, 'Botão "Remover dados de exemplo" está presente');

    const clearAllBtn = await page.waitForSelector('#btn-clear-all-data');
    assert(clearAllBtn, 'Botão "Apagar todos os dados" está presente');

    const clearLabelColor = await page.$eval('#btn-clear-all-data .row-label-destructive', (el) => {
      return window.getComputedStyle(el).color;
    });
    assert(Boolean(clearLabelColor), 'Rótulo "Apagar todos os dados" possui estilo destrutivo em vermelho');

    console.log('\n--- 3. Carregar dados de exemplo via confirmation sheet ---');
    await loadBtn.click();

    // Sheet should open and hide tab bar
    const sheet = await page.waitForSelector('.ios-sheet-backdrop');
    assert(sheet, 'Confirmation sheet abriu');

    const isTabBarHidden = await page.$eval('.ios-tab-bar', (el) => el.classList.contains('hidden'));
    assert(isTabBarHidden, 'Aba inferior (tab bar) foi ocultada com o sheet aberto');

    const sheetMsg = await page.$eval('.ios-action-sheet-message', (el) => el.textContent.trim());
    assert(sheetMsg.includes('exemplo'), `Mensagem em plain pt-BR explica o que vai acontecer: "${sheetMsg}"`);

    // Confirm sheet action
    await new Promise((r) => setTimeout(r, 300));
    const confirmLoadBtn = await page.waitForSelector('#sheet-action-confirm');
    await confirmLoadBtn.click();

    await page.waitForFunction(() => !document.querySelector('.ios-sheet-backdrop'));
    const isTabBarRestored = await page.$eval('.ios-tab-bar', (el) => !el.classList.contains('hidden'));
    assert(isTabBarRestored, 'Tab bar restaurada após fechar o sheet');

    console.log('\n--- 4. Verificar dados após carregamento (seed + safety) ---');
    const dbCountsAfterSeed = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('DadsCalendarDB');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise((res, rej) => {
        const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readonly');
        const actReq = tx.objectStore('activities').getAll();
        const compReq = tx.objectStore('completions').getAll();
        const dayReq = tx.objectStore('dayEntries').getAll();

        tx.oncomplete = () => {
          const acts = actReq.result || [];
          const comps = compReq.result || [];
          const days = dayReq.result || [];
          res({
            totalActivities: acts.length,
            demoActivities: acts.filter((a) => a.demo).length,
            realActivities: acts.filter((a) => !a.demo),
            totalCompletions: comps.length,
            demoCompletions: comps.filter((c) => c.demo).length,
            realCompletions: comps.filter((c) => !c.demo),
            totalDayEntries: days.length,
            demoDayEntries: days.filter((d) => d.demo).length,
            realDayEntries: days.filter((d) => !d.demo),
          });
        };
        tx.onerror = (e) => rej(e.target.error);
      });
    });

    assertEqual(dbCountsAfterSeed.demoActivities, 3, '3 atividades de exemplo carregadas');
    assertEqual(dbCountsAfterSeed.realActivities.length, 2, '2 atividades reais preservadas');
    assert(dbCountsAfterSeed.demoCompletions > 20, `Completions de exemplo criadas (${dbCountsAfterSeed.demoCompletions})`);
    assertEqual(dbCountsAfterSeed.realCompletions.length, 1, '1 completion real preservada intacta');
    assertEqual(dbCountsAfterSeed.realCompletions[0].note, 'Treino real do usuário', 'Conteúdo da completion real intacto');
    assertEqual(dbCountsAfterSeed.realDayEntries.length, 1, '1 day entry real preservada intacta');
    assertEqual(dbCountsAfterSeed.realDayEntries[0].notes, 'Anotação real de chuva', 'Conteúdo da day entry real intacto');

    console.log('\n--- 5. Remover dados de exemplo via confirmation sheet ---');
    await removeBtn.click();

    await page.waitForSelector('.ios-sheet-backdrop');
    await new Promise((r) => setTimeout(r, 300));
    const confirmRemoveBtn = await page.waitForSelector('#sheet-action-confirm');
    await confirmRemoveBtn.click();
    await page.waitForFunction(() => !document.querySelector('.ios-sheet-backdrop'));

    const dbCountsAfterRemove = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('DadsCalendarDB');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise((res, rej) => {
        const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readonly');
        const actReq = tx.objectStore('activities').getAll();
        const compReq = tx.objectStore('completions').getAll();
        const dayReq = tx.objectStore('dayEntries').getAll();

        tx.oncomplete = () => {
          const acts = actReq.result || [];
          const comps = compReq.result || [];
          const days = dayReq.result || [];
          res({
            demoActivities: acts.filter((a) => a.demo).length,
            realActivities: acts.filter((a) => !a.demo),
            demoCompletions: comps.filter((c) => c.demo).length,
            realCompletions: comps.filter((c) => !c.demo),
            demoDayEntries: days.filter((d) => d.demo).length,
            realDayEntries: days.filter((d) => !d.demo),
          });
        };
        tx.onerror = (e) => rej(e.target.error);
      });
    });

    assertEqual(dbCountsAfterRemove.demoActivities, 0, 'Todos os registros demo de atividades foram removidos (0)');
    assertEqual(dbCountsAfterRemove.demoCompletions, 0, 'Todos os registros demo de completions foram removidos (0)');
    assertEqual(dbCountsAfterRemove.demoDayEntries, 0, 'Todos os registros demo de day entries foram removidos (0)');
    assertEqual(dbCountsAfterRemove.realActivities.length, 2, 'Atividades reais permanecem intactas (2)');
    assertEqual(dbCountsAfterRemove.realCompletions.length, 1, 'Completion real permanece intacta (1)');
    assertEqual(dbCountsAfterRemove.realDayEntries.length, 1, 'Day entry real permanece intacta (1)');

    console.log('\n--- 6. Apagar todos os dados e restaurar Academia ---');
    await clearAllBtn.click();

    await page.waitForSelector('.ios-sheet-backdrop');
    await new Promise((r) => setTimeout(r, 300));
    const confirmClearBtn = await page.waitForSelector('#sheet-action-confirm');
    await confirmClearBtn.click();
    await page.waitForFunction(() => !document.querySelector('.ios-sheet-backdrop'));

    const dbCountsAfterClearAll = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('DadsCalendarDB');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise((res, rej) => {
        const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readonly');
        const actReq = tx.objectStore('activities').getAll();
        const compReq = tx.objectStore('completions').getAll();
        const dayReq = tx.objectStore('dayEntries').getAll();

        tx.oncomplete = () => {
          res({
            activities: actReq.result || [],
            completions: compReq.result || [],
            dayEntries: dayReq.result || [],
          });
        };
        tx.onerror = (e) => rej(e.target.error);
      });
    });

    assertEqual(dbCountsAfterClearAll.activities.length, 1, 'Apenas 1 atividade após apagar tudo');
    assertEqual(dbCountsAfterClearAll.activities[0].id, 'act_academia', 'Atividade padrão Academia restaurada');
    assertEqual(dbCountsAfterClearAll.completions.length, 0, 'Todas as completions apagadas (0)');
    assertEqual(dbCountsAfterClearAll.dayEntries.length, 0, 'Todas as day entries apagadas (0)');

    console.log('\nTodos os testes headless das ferramentas de teste passaram com sucesso!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
