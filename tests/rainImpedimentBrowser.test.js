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

    // Seed test data in IndexedDB:
    // 1. On 2026-11-15 (today): planned entry for act_academia with option 'opt_peito', day rained: false
    // 2. On 2026-11-10 (past): pending planned entry for act_academia with option 'opt_costas'
    await page.evaluate(async () => {
      const dbRequest = indexedDB.open('DadsCalendarDB', 3);
      await new Promise((resolve) => {
        dbRequest.onsuccess = async () => {
          const db = dbRequest.result;
          const tx = db.transaction(['completions', 'dayEntries'], 'readwrite');
          const compStore = tx.objectStore('completions');
          const dayStore = tx.objectStore('dayEntries');

          compStore.put({
            id: '2026-11-15:act_academia',
            date: '2026-11-15',
            activityId: 'act_academia',
            status: 'planned',
            wasPlanned: true,
            optionIds: ['opt_peito'],
            note: 'Treino de domingo',
          });

          compStore.put({
            id: '2026-11-10:act_academia',
            date: '2026-11-10',
            activityId: 'act_academia',
            status: 'planned',
            wasPlanned: true,
            optionIds: ['opt_costas'],
            note: 'Pendente de terça',
          });

          dayStore.put({
            date: '2026-11-15',
            rained: false,
            notes: '',
          });

          tx.oncomplete = resolve;
        };
      });
    });

    // Reload page to reflect seeded data
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cal-day');

    console.log('\n--- Step 1: Open day detail for today and mark planned entry Não feita with rain switch ---');
    // Click on today cell (2026-11-15)
    const todayCell = await page.waitForSelector('.cal-day[data-date="2026-11-15"]');
    await todayCell.click();

    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));
    await page.waitForSelector('#section-planned .planned-check-row[data-id="act_academia"]');

    // Confirm day Choveu switch is initially OFF
    const initialRained = await page.$eval('#day-rained-switch', (el) => el.checked);
    assertEqual(initialRained, false, 'Choveu switch is initially false');

    // Tap planned row to open action sheet
    const elInfo = await page.evaluate(() => {
      const el = document.querySelector('#section-planned .planned-check-row[data-id="act_academia"]');
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        found: true,
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
      };
    });
    console.log('Planned row element info:', elInfo);

    await page.evaluate(() => {
      document.querySelector('#section-planned .planned-check-row[data-id="act_academia"]').click();
    });
    await page.waitForSelector('#plan-action-sheet');
    await new Promise((r) => setTimeout(r, 300));
    await page.waitForSelector('#sheet-rain-switch');

    // Switch "Impedida pela chuva" ON
    await page.click('#sheet-rain-switch');
    const isRainSwitchedOn = await page.$eval('#sheet-rain-switch', (el) => el.checked);
    assertEqual(isRainSwitchedOn, true, 'Impedida pela chuva switch toggled ON');

    // Tap "Não feita"
    await page.click('#sheet-btn-missed');
    await page.waitForFunction(() => !document.querySelector('#plan-action-sheet'));
    await new Promise((r) => setTimeout(r, 200));

    // Verify Choveu switch is now ON
    const updatedRained = await page.$eval('#day-rained-switch', (el) => el.checked);
    assertEqual(updatedRained, true, 'Day Choveu switch automatically turned ON');

    // Verify missed entry keeps chips and subtitle
    const missedRow = await page.waitForSelector('.activity-check-row--missed[data-id="act_academia"]');
    assert(Boolean(missedRow), 'Row is now marked as missed');
    const chipsVisible = await page.$eval('#chips-container-act_academia', (el) => !el.classList.contains('hidden'));
    assertEqual(chipsVisible, true, 'Chips container is visible for missed entry');
    const subtitleText = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assert(subtitleText.includes('Peito'), `Subtitle includes option Peito (got "${subtitleText}")`);

    console.log('\n--- Step 2: Open Resumo, verify rain count and Por opção card in Registros ---');
    // Navigate to Resumo tab
    await page.click('.ios-tab-item[data-tab="resumo"]');
    await page.waitForSelector('.summary-screen');
    await new Promise((r) => setTimeout(r, 350));
    await page.waitForSelector('#summary-section-rain');

    // Verify Atividades impedidas count is 1
    const blockedCount = await page.$eval('#stat-blocked-rain-count', (el) => el.textContent.trim());
    assertEqual(blockedCount, '1', 'Atividades impedidas count in Resumo is 1');

    // Tap Atividades impedidas row to push Registros
    await page.click('#rain-row-blocked');
    await page.waitForSelector('.records-screen');
    await new Promise((r) => setTimeout(r, 350));

    const recordsTitle = await page.$eval('#records-screen-title', (el) => el.textContent.trim());
    assertEqual(recordsTitle, 'Atividades impedidas', 'Registros title is Atividades impedidas');

    const totalCountText = await page.$eval('#records-total-count', (el) => el.textContent.trim().toLowerCase());
    assertEqual(totalCountText, '1 registro', 'Header count shows 1 registro');

    // Check "Por opção" card
    const byOptionCard = await page.waitForSelector('#records-by-option-card');
    assert(Boolean(byOptionCard), 'Por opção card is displayed');
    const optRowText = await page.$eval('.records-option-row', (el) => el.textContent.trim());
    assert(optRowText.includes('Peito'), `Por opção lists Peito (got "${optRowText}")`);

    // Check row details
    const recordRowText = await page.$eval('.record-item-row', (el) => el.textContent.trim());
    assert(recordRowText.includes('Academia'), 'Record row has Academia');
    assert(recordRowText.includes('Peito'), 'Record row has Peito secondary text');

    console.log('\n--- Step 3: Open Pendentes from Resumo and resolve pending entry from the list ---');
    // Go back to Resumo
    await page.click('#btn-back-records');
    await page.waitForSelector('.summary-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Tap Pendentes row in Planejamento card
    await page.click('#plan-row-pending');
    await page.waitForSelector('.records-screen');
    await new Promise((r) => setTimeout(r, 350));

    const pendingTitle = await page.$eval('#records-screen-title', (el) => el.textContent.trim());
    assertEqual(pendingTitle, 'Pendentes', 'Registros title is Pendentes');

    // Check that pending item from 2026-11-10 is shown
    const pendingRow = await page.waitForSelector('.record-item-row[data-date="2026-11-10"]');
    assert(Boolean(pendingRow), 'Pending entry from 2026-11-10 is in list');

    // Tap pending row right in the list -> should open status sheet
    await page.click('.record-item-row[data-date="2026-11-10"]');
    await page.waitForSelector('#plan-action-sheet');
    await new Promise((r) => setTimeout(r, 300));

    // Mark as Feita
    await page.click('#sheet-btn-done');
    await page.waitForFunction(() => !document.querySelector('#plan-action-sheet'));
    await new Promise((r) => setTimeout(r, 200));

    // Confirm the list updates in place: pending item is resolved, empty state or updated count shown
    await page.waitForSelector('#records-empty-text');
    const emptyText = await page.$eval('#records-empty-text', (el) => el.textContent.trim());
    assertEqual(emptyText, 'Nenhuma atividade pendente.', 'Pending list refreshed in place and shows empty state');

    console.log('\n✅ All headless browser checks for rain impediment and records list passed!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
