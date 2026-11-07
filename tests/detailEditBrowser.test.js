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
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected "${expected}", got "${actual}")`);
  }
}

async function waitForScreen(page, selector) {
  const el = await page.waitForSelector(selector);
  await new Promise((r) => setTimeout(r, 300));
  return el;
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

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });

    // Reset IndexedDB
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open('DadsCalendarDB');
          req.onsuccess = () => {
            try {
              const db = req.result;
              const storeNames = Array.from(db.objectStoreNames);
              const tx = db.transaction(storeNames, 'readwrite');
              for (const name of storeNames) {
                tx.objectStore(name).clear();
              }
              tx.oncomplete = () => resolve();
              tx.onerror = (e) => reject(e.target.error);
            } catch (err) {
              reject(err);
            }
          };
          req.onerror = (e) => reject(e.target.error);
        } catch (err) {
          reject(err);
        }
      });
    });

    console.log('1. Navigating to Atividades tab...');
    // 1. Navigate to Atividades tab
    await (await page.waitForSelector('[data-tab="atividades"]')).click();
    await page.waitForSelector('.activities-screen');

    console.log('2. Clicking + Nova...');
    // 2. Click "+ Nova"
    await (await page.waitForSelector('#btn-new-activity')).click();
    await page.waitForSelector('#activity-form');

    // Verify Salvar button is disabled when name is empty
    const isSaveDisabledInitial = await page.$eval('#btn-submit-header', (el) => el.disabled);
    assert(isSaveDisabledInitial, 'Salvar button starts disabled for empty name');

    console.log('3. Typing name Treino A...');
    // Type activity name
    await page.type('#form-act-name', 'Treino A');
    const isSaveEnabled = await page.$eval('#btn-submit-header', (el) => !el.disabled);
    assert(isSaveEnabled, 'Salvar button is enabled after valid name');

    // Tab bar must remain visible on pushed form screen
    const isTabBarVisible = await page.$eval('.ios-tab-bar', (el) => !el.classList.contains('hidden'));
    assert(isTabBarVisible, 'Tab bar remains visible on pushed activity form');

    console.log('4. Adding detail group...');
    // 3. Add a detail group
    await (await page.waitForSelector('#btn-add-detail-group')).click();
    await page.waitForSelector('.detail-edit-screen');

    console.log('5. Typing Intensidade and selecting Uma opção...');
    // Type group name
    await page.type('#detail-group-name-input', 'Intensidade');

    // Select "Uma opção"
    await (await page.waitForSelector('#btn-seg-single')).click();
    const isSingleActive = await page.$eval('#btn-seg-single', (el) => el.classList.contains('active'));
    assert(isSingleActive, 'Segmented control switched to "Uma opção"');

    console.log('6. Adding option Leve...');
    // Add option 1: "Leve"
    const input1 = await page.waitForSelector('#input-add-option');
    await input1.type('Leve');
    await input1.press('Enter');
    await page.waitForFunction(() => {
      const names = Array.from(document.querySelectorAll('.detail-option-name')).map((el) => el.textContent.trim());
      return names.includes('Leve');
    });

    console.log('7. Adding option Pesado...');
    // Add option 2: "Pesado"
    const input2 = await page.waitForSelector('#input-add-option');
    await input2.type('Pesado');
    await input2.press('Enter');
    await page.waitForFunction(() => {
      const names = Array.from(document.querySelectorAll('.detail-option-name')).map((el) => el.textContent.trim());
      return names.includes('Pesado');
    });

    console.log('8. Returning to activity form...');
    // 4. Tap back to return to the activity form
    await (await page.waitForSelector('#btn-back-detail')).click();
    await page.waitForSelector('.activity-form-screen.activities-subscreen--current');

    // Verify group row and count in Detalhes section
    const groupNameText = await page.$eval('.detail-group-name', (el) => el.textContent.trim());
    assertEqual(groupNameText, 'Intensidade', 'Group name rendered in Detalhes section');
    const groupCountText = await page.$eval('.detail-group-count', (el) => el.textContent.trim());
    assertEqual(groupCountText, '2 opções', 'Option count rendered in Detalhes section');

    console.log('9. Saving activity...');
    // 5. Save activity
    await (await page.waitForSelector('#btn-submit-header')).click();
    await page.waitForSelector('.activity-item-card');

    const cardNames = await page.$$eval('.activity-card-name', (els) => els.map((el) => el.textContent.trim()));
    assert(cardNames.includes('Treino A'), 'Created activity "Treino A" appears in the list');

    console.log('10. Navigating to Calendário tab...');
    // 6. Go to Calendário tab and select a day
    await (await page.waitForSelector('[data-tab="calendario"]')).click();
    await page.waitForFunction(() => document.querySelectorAll('.cal-day[data-date]').length >= 28);

    const firstDay = await page.waitForSelector('.cal-day:not(.other-month)');
    const selectedDate = await firstDay.evaluate((el) => el.dataset.date);
    await firstDay.click();

    // 7. On day detail screen, check the activity
    await page.waitForSelector('.day-detail-screen');
    const actRow = await page.waitForSelector('.activity-check-row');
    await actRow.click();

    // Wait for chips to appear
    await page.waitForSelector('.group-chips-container');
    const chips = await page.$$('.group-chip');
    assertEqual(chips.length, 2, 'Two option chips rendered for the activity');

    // 8. Select option 1 ("Leve")
    const chipLeve = chips[0];
    await chipLeve.click();

    const isLeveSelected = await chipLeve.evaluate((el) => el.classList.contains('selected'));
    assert(isLeveSelected, 'Option "Leve" is selected');

    // 9. Select option 2 ("Pesado") -> verifies "Uma opção" allows only one selection
    const chipPesado = chips[1];
    await chipPesado.click();

    // Wait for subtitle text to update to "Pesado"
    await page.waitForFunction(() => {
      const sub = document.querySelector('.activity-subtitle-text')?.textContent || '';
      return sub.includes('Pesado');
    });
    // Brief tick to ensure IndexedDB write transaction is committed
    await new Promise((r) => setTimeout(r, 100));

    const isPesadoSelected = await chipPesado.evaluate((el) => el.classList.contains('selected'));
    const isLeveSelectedAfter = await chipLeve.evaluate((el) => el.classList.contains('selected'));
    assert(isPesadoSelected, 'Option "Pesado" is now selected');
    assert(!isLeveSelectedAfter, 'Option "Leve" was unselected because group is "Uma opção"');

    // 10. Reload and verify persistence
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.cal-day[data-date]').length >= 28);

    const sameDay = await page.waitForSelector(`.cal-day[data-date="${selectedDate}"]`);
    await sameDay.click();
    await page.waitForSelector('.day-detail-screen');

    const actRowAfterReload = await page.waitForSelector('.activity-check-row--done');
    assert(Boolean(actRowAfterReload), 'Activity remains checked after reload');

    const chipsAfterReload = await page.$$('.group-chip');
    const leveAfterReload = await chipsAfterReload[0].evaluate((el) => el.classList.contains('selected'));
    const pesadoAfterReload = await chipsAfterReload[1].evaluate((el) => el.classList.contains('selected'));

    assert(!leveAfterReload, 'Option "Leve" is not selected after reload');
    assert(pesadoAfterReload, 'Option "Pesado" remains selected after reload');

    // 11. Test template button, rename option, remove option (archiving), and remove detail group
    console.log('11. Testing template button, option rename/removal, and group removal...');
    await (await page.waitForSelector('[data-tab="atividades"]')).click();
    await page.waitForSelector('.activities-screen');

    // Click on "Treino A" to edit it
    const treinoCard = await page.waitForSelector('.activity-item-card');
    await treinoCard.click();
    await page.waitForSelector('.activity-form-screen.activities-subscreen--current');

    // Click on "Intensidade" group
    await (await page.waitForSelector('.detail-group-row')).click();
    await waitForScreen(page, '.detail-edit-screen');

    // Tap option "Leve" row to open option edit dialog
    const optRows = await page.$$('.detail-option-row');
    await optRows[0].click();
    await page.waitForSelector('#option-dialog-backdrop');

    // Rename "Leve" to "Muito Leve"
    await page.$eval('#dialog-opt-name', (el) => { el.value = ''; });
    await page.type('#dialog-opt-name', 'Muito Leve');
    await (await page.waitForSelector('#dialog-btn-save-opt')).click();
    await page.waitForFunction(() => !document.querySelector('#option-dialog-backdrop'));

    const updatedOptNames = await page.$$eval('.detail-option-name', (els) => els.map((el) => el.textContent.trim()));
    assert(updatedOptNames.includes('Muito Leve'), 'Renamed option "Muito Leve" appears in options list');

    // Tap "Pesado" row and remove option (archives it)
    const optPesadoRow = await page.waitForSelector('.detail-option-row:nth-child(2)');
    await optPesadoRow.click();
    await page.waitForSelector('#option-dialog-backdrop');
    await (await page.waitForSelector('#dialog-btn-remove-opt')).click();
    await page.waitForFunction(() => !document.querySelector('#option-dialog-backdrop'));

    const remainingOptNames = await page.$$eval('.detail-option-name', (els) => els.map((el) => el.textContent.trim()));
    assertEqual(remainingOptNames.length, 1, 'Only 1 active option remains after removing Pesado');
    assertEqual(remainingOptNames[0], 'Muito Leve', 'Remaining option is Muito Leve');

    // Go back to activity form
    await (await page.waitForSelector('#btn-back-detail')).click();
    await waitForScreen(page, '.activity-form-screen.activities-subscreen--current');

    // Add another group to test "Usar modelo: grupos musculares"
    await (await page.waitForSelector('#btn-add-detail-group')).click();
    await waitForScreen(page, '.detail-edit-screen');

    // Template button must be visible for empty group
    const templateBtn = await page.waitForSelector('#btn-use-muscle-template');
    assert(Boolean(templateBtn), 'Template button is offered for new empty group');
    await templateBtn.click();

    // Verify 9 muscle group options populated
    await page.waitForFunction(() => document.querySelectorAll('.detail-option-name').length === 9);
    const mgNames = await page.$$eval('.detail-option-name', (els) => els.map((el) => el.textContent.trim()));
    assert(mgNames.includes('Superiores'), 'Template populated Superiores');
    assert(mgNames.includes('Cardio'), 'Template populated Cardio');

    // Verify template button disappeared once options were filled
    const templateBtnAfter = await page.$('#btn-use-muscle-template');
    assert(templateBtnAfter === null, 'Template button disappears once options are populated');

    // Test "Remover detalhe" with confirmation
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await (await page.waitForSelector('#btn-delete-group')).click();
    await page.waitForSelector('.activity-form-screen.activities-subscreen--current');

    // Verify only the first group remains in the form
    const detailGroupRows = await page.$$('.detail-group-row');
    assertEqual(detailGroupRows.length, 1, 'Only the active group remains after removing template group');

    // Save changes
    await (await page.waitForSelector('#btn-submit-header')).click();
    await page.waitForSelector('.activity-item-card');

    if (pageErrors.length > 0) {
      throw new Error(`Page errors encountered: ${pageErrors.join(', ')}`);
    }

    console.log('detailEditBrowser check: all assertions passed.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
