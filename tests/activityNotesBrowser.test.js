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

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });

    // Seed 2 activities with allowsNote: false
    const todayStr = await page.evaluate(async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const today = `${y}-${m}-${d}`;

      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('DadsCalendarDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      await new Promise((resolve, reject) => {
        const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
        tx.objectStore('completions').clear();
        tx.objectStore('dayEntries').clear();
        const actStore = tx.objectStore('activities');
        actStore.clear();

        actStore.put({
          id: 'act_academia',
          name: 'Academia',
          icon: 'barbell',
          color: '#007aff',
          groups: [],
          allowsNote: false,
          createdAt: 1000,
        });

        actStore.put({
          id: 'act_caminhada',
          name: 'Caminhada',
          icon: 'person-simple-walk',
          color: '#34c759',
          groups: [],
          allowsNote: false,
          createdAt: 2000,
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      return today;
    });

    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cal-grid');

    // ── 1. Enable the switch on one activity in Atividades tab ────────────────
    const tabActivities = await page.waitForSelector('[data-tab="atividades"]');
    await tabActivities.click();
    await page.waitForSelector('.activities-screen');

    // Open "Academia"
    const actRow = await page.waitForSelector('.activity-item-card[data-id="act_academia"]');
    await actRow.click();
    await page.waitForSelector('.activity-form-screen');

    // Verify switch is present and toggle it on
    const allowsNoteSwitch = await page.waitForSelector('#form-act-allows-note');
    const initialChecked = await page.evaluate((el) => el.checked, allowsNoteSwitch);
    assertEqual(initialChecked, false, 'Switch "Permitir observação" starts unchecked');

    await allowsNoteSwitch.click();
    const checkedAfter = await page.evaluate((el) => el.checked, allowsNoteSwitch);
    assertEqual(checkedAfter, true, 'Switch "Permitir observação" is now checked');

    // Save activity
    await (await page.waitForSelector('#btn-submit-header')).click();
    await page.waitForSelector('.activities-screen');
    await new Promise((r) => setTimeout(r, 350));

    // ── 2. Confirm other activity shows no field; activity with switch shows field when entry exists ──
    const tabCalendar = await page.waitForSelector('[data-tab="calendario"]');
    await tabCalendar.click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Open today's detail
    const todayCell = await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`);
    await todayCell.click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Plan both Academia and Caminhada
    const planAcademiaBtn = await page.waitForSelector('.btn-plan-activity[data-act-id="act_academia"]');
    await planAcademiaBtn.click();
    await page.waitForSelector('#section-planned .activity-item-wrapper[data-act-id="act_academia"]');

    const planCaminhadaBtn = await page.waitForSelector('.btn-plan-activity[data-act-id="act_caminhada"]');
    await planCaminhadaBtn.click();
    await page.waitForSelector('#section-planned .activity-item-wrapper[data-act-id="act_caminhada"]');

    // Academia (allowsNote: true) has observation field
    const academiaNoteInput = await page.$(
      '#section-planned .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input'
    );
    assert(Boolean(academiaNoteInput), 'Academia shows observation field when planned');

    // Caminhada (allowsNote: false) shows NO observation field
    const caminhadaNoteInput = await page.$(
      '#section-planned .activity-item-wrapper[data-act-id="act_caminhada"] .activity-note-input'
    );
    assert(!caminhadaNoteInput, 'Caminhada (allowsNote: false) shows NO observation field');

    // ── 3. Write a note in status sheet while marking "Não feita" ─────────────
    await page.click('#section-planned .activity-item-wrapper[data-act-id="act_academia"] .planned-check-row');
    await page.waitForSelector('#plan-action-sheet');
    await new Promise((r) => setTimeout(r, 200));

    // Confirm sheet note field is visible
    const sheetNoteInput = await page.waitForSelector('#sheet-note-input');
    await sheetNoteInput.type('Sentiu dor no joelho');

    // Click "Não feita"
    await (await page.waitForSelector('#sheet-btn-missed')).click();
    await page.waitForFunction(() => !document.querySelector('#plan-action-sheet'));
    await new Promise((r) => setTimeout(r, 200));

    // Confirm Academia status is missed
    const academiaStatus = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_academia"] .plan-status-badge',
      (el) => el.className
    );
    assert(academiaStatus.includes('plan-status--missed'), 'Academia is marked Não feita (missed)');

    // Confirm field under activity displays the note
    const noteValBeforeReload = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input',
      (el) => el.value
    );
    assertEqual(noteValBeforeReload, 'Sentiu dor no joelho', 'Note field displays written observation');

    // Reload and confirm it persists
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cal-grid');
    await new Promise((r) => setTimeout(r, 350));

    const todayCellAfterReload = await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`);
    await todayCellAfterReload.click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    const noteValAfterReload = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input',
      (el) => el.value
    );
    assertEqual(noteValAfterReload, 'Sentiu dor no joelho', 'Observation persisted after reload');

    // ── 4. Confirm an entry created with the check circle also shows the field ──
    // Return to calendar
    await (await page.waitForSelector('#btn-back')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));

    // In Hoje card, uncheck Caminhada (no note field) and verify
    const caminhadaCardNote = await page.$('#today-card-content .activity-note-row[data-act-id="act_caminhada"]');
    assert(!caminhadaCardNote, 'Hoje card: Caminhada shows no note field');

    // In day detail view, unplan or remove Academia and test check circle in Atividades section
    await (await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`)).click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Remove Academia from plan to place it into Atividades section
    await page.click('#section-planned .activity-item-wrapper[data-act-id="act_academia"] .planned-check-row');
    await page.waitForSelector('#plan-action-sheet');
    await new Promise((r) => setTimeout(r, 350));
    await (await page.waitForSelector('#sheet-btn-remove')).click();
    await page.waitForFunction(() => !document.querySelector('#plan-action-sheet'));
    await new Promise((r) => setTimeout(r, 350));

    // Academia is now in Atividades (unplanned, undone). Verify no note field is shown yet
    const academiaUndoneNote = await page.$(
      '#section-activities .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input'
    );
    assert(!academiaUndoneNote, 'Unplanned undone activity shows no note field before check');

    // Click the check circle for Academia
    await page.click('#section-activities .activity-item-wrapper[data-act-id="act_academia"] .unplanned-check-row');
    const noteInputAfterCheck = await page.waitForSelector(
      '#section-activities .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input'
    );
    assert(Boolean(noteInputAfterCheck), 'Entry created with check circle shows the observation field');

    // Type a note and blur to autosave
    await noteInputAfterCheck.type('Treino concluído com sucesso');
    await page.evaluate(() => document.activeElement?.blur());
    await new Promise((r) => setTimeout(r, 700));

    // ── 5. Turning the switch off hides the field but keeps saved notes; turning it on again shows them ──
    await (await page.waitForSelector('#btn-back')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));

    await (await page.waitForSelector('[data-tab="atividades"]')).click();
    await page.waitForSelector('.activities-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Edit Academia -> turn switch OFF
    await (await page.waitForSelector('.activity-item-card[data-id="act_academia"]')).click();
    await page.waitForSelector('.activity-form-screen');
    await new Promise((r) => setTimeout(r, 350));
    const swOff = await page.waitForSelector('#form-act-allows-note');
    await swOff.click();
    const swOffAfter = await page.evaluate((el) => el.checked, swOff);
    assertEqual(swOffAfter, false, 'Switch "Permitir observação" is now unchecked');
    await (await page.waitForSelector('#btn-submit-header')).click();
    await page.waitForSelector('.activities-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Go to calendar -> open today
    await (await page.waitForSelector('[data-tab="calendario"]')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));
    await (await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`)).click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    const noteHiddenWhenSwitchOff = await page.$(
      '#section-activities .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input'
    );
    assert(!noteHiddenWhenSwitchOff, 'Turning switch off hides the field');

    // Go to Atividades -> turn switch ON again
    await (await page.waitForSelector('#btn-back')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));
    await (await page.waitForSelector('[data-tab="atividades"]')).click();
    await page.waitForSelector('.activities-screen');
    await new Promise((r) => setTimeout(r, 350));

    await (await page.waitForSelector('.activity-item-card[data-id="act_academia"]')).click();
    await page.waitForSelector('.activity-form-screen');
    await new Promise((r) => setTimeout(r, 350));
    const swOn = await page.waitForSelector('#form-act-allows-note');
    await swOn.click();
    const swOnAfter = await page.evaluate((el) => el.checked, swOn);
    assertEqual(swOnAfter, true, 'Switch "Permitir observação" is checked again');
    await (await page.waitForSelector('#btn-submit-header')).click();
    await page.waitForSelector('.activities-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Go back to today -> confirm field shows again with saved note
    await (await page.waitForSelector('[data-tab="calendario"]')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));
    await (await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`)).click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    const noteShownWhenSwitchOn = await page.$eval(
      '#section-activities .activity-item-wrapper[data-act-id="act_academia"] .activity-note-input',
      (el) => el.value
    );
    assertEqual(noteShownWhenSwitchOn, 'Treino concluído com sucesso', 'Turning switch on again restores saved note');

    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join('; ')}`);
    console.log('✅ activityNotesBrowser check: all assertions passed!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
