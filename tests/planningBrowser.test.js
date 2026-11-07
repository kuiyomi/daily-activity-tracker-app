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

    // Seed 3 activities: Academia (with option groups), Caminhada, Corrida
    // Also seed a past date with an unresolved planned activity to test "Pendente"
    const dates = await page.evaluate(async () => {
      const now = new Date();
      const format = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const today = format(now);
      const tomorrow = format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      const yesterday = format(new Date(now.getTime() - 24 * 60 * 60 * 1000));

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
          groups: [
            {
              id: 'grp_muscles',
              name: 'Grupos musculares',
              multiple: true,
              archived: false,
              options: [
                { id: 'opt_superiores', name: 'Superiores', archived: false },
                { id: 'opt_inferiores', name: 'Inferiores', archived: false },
              ],
            },
          ],
          createdAt: 1000,
        });

        actStore.put({
          id: 'act_caminhada',
          name: 'Caminhada',
          icon: 'person-simple-walk',
          color: '#34c759',
          groups: [],
          createdAt: 2000,
        });

        actStore.put({
          id: 'act_corrida',
          name: 'Corrida',
          icon: 'person-simple-run',
          color: '#ff9500',
          groups: [],
          createdAt: 3000,
        });

        // Seed unresolved planned activity on yesterday to verify "Pendente"
        const compStore = tx.objectStore('completions');
        compStore.put({
          id: `${yesterday}:act_caminhada`,
          date: yesterday,
          activityId: 'act_caminhada',
          status: 'planned',
          wasPlanned: true,
          optionIds: [],
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      return { today, tomorrow, yesterday };
    });

    const { today: todayStr, tomorrow: futureStr, yesterday: pastStr } = dates;

    // Reload page to reflect seeded activities
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cal-grid');

    // ── 0. Check past date: unresolved planned entry shows "Pendente" in orange ──
    const pastDayBtn = await page.waitForSelector(`.cal-day[data-date="${pastStr}"]`);
    await pastDayBtn.click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    const pastSubtitle = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_caminhada"] .pending-badge-text',
      (el) => el.textContent.trim()
    );
    assertEqual(pastSubtitle, 'Pendente', 'Planned unresolved entry on past date shows "Pendente"');

    // Return to calendar
    await (await page.waitForSelector('#btn-back')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));

    // ── 1. Plan an activity on a future day ──────────────────
    const futureDayBtn = await page.waitForSelector(`.cal-day[data-date="${futureStr}"]`);
    await futureDayBtn.click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    // On future dates, check circles are hidden in Atividades
    const checkCircleCount = await page.$$eval('#section-activities .activity-checkbox-circle', (els) => els.length);
    assertEqual(checkCircleCount, 0, 'Check circles are hidden on future date');

    // Plan Caminhada on future day
    const planCaminhadaBtn = await page.waitForSelector('.btn-plan-activity[data-act-id="act_caminhada"]');
    await planCaminhadaBtn.click();

    // Verify Caminhada is now in Planejadas with planned status (clock)
    await page.waitForSelector('#section-planned .activity-item-wrapper[data-act-id="act_caminhada"]');
    const futureStatusIndicator = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_caminhada"] .plan-status-badge',
      (el) => el.className
    );
    assert(futureStatusIndicator.includes('plan-status--planned'), 'Future Caminhada has planned status indicator');

    // Return to calendar
    await (await page.waitForSelector('#btn-back')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));

    // ── 2. Plan another today and mark it "Feita" ────────────
    const todayDayBtn = await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`);
    await todayDayBtn.click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Plan Academia today
    const planAcademiaBtn = await page.waitForSelector('.btn-plan-activity[data-act-id="act_academia"]');
    await planAcademiaBtn.click();
    await page.waitForSelector('#section-planned .activity-item-wrapper[data-act-id="act_academia"]');

    // Option chips appear for planned entry and are editable
    await page.waitForSelector('#section-planned #chips-container-act_academia:not(.hidden)');
    const optSuperioresChip = await page.waitForSelector('.group-chip[data-opt-id="opt_superiores"]');
    await optSuperioresChip.click();

    // Subtitle lists selected option name
    const subtitleAfterOption = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(subtitleAfterOption, 'Superiores', 'Option chip click updates subtitle to option name');

    // Tap the row for Academia in Planejadas to open sheet
    await page.click('#section-planned .activity-item-wrapper[data-act-id="act_academia"] .planned-check-row');
    await page.waitForSelector('#plan-action-sheet');
    await new Promise((r) => setTimeout(r, 350));

    // Mark it "Feita"
    await (await page.waitForSelector('#sheet-btn-done')).click();
    await page.waitForFunction(() => !document.querySelector('#plan-action-sheet'));
    await new Promise((r) => setTimeout(r, 350));

    // Status indicator becomes green check
    const academiaStatus = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_academia"] .plan-status-badge',
      (el) => el.className
    );
    assert(academiaStatus.includes('plan-status--done'), 'Academia is marked done (Feita)');

    // Option chips remain visible for done entry
    const isChipsVisibleForDone = await page.$eval(
      '#section-planned #chips-container-act_academia',
      (el) => !el.classList.contains('hidden')
    );
    assert(isChipsVisibleForDone, 'Option chips appear and remain editable for done entry');

    // ── 3. Mark a third "Não feita" ──────────────────────────
    // Plan Corrida today
    const planCorridaBtn = await page.waitForSelector('.btn-plan-activity[data-act-id="act_corrida"]');
    await planCorridaBtn.click();
    await page.waitForSelector('#section-planned .activity-item-wrapper[data-act-id="act_corrida"]');

    // Tap the row for Corrida to open sheet
    await page.click('#section-planned .activity-item-wrapper[data-act-id="act_corrida"] .planned-check-row');
    await page.waitForSelector('#plan-action-sheet');
    await new Promise((r) => setTimeout(r, 350));

    // Mark it "Não feita"
    await (await page.waitForSelector('#sheet-btn-missed')).click();
    await page.waitForFunction(() => !document.querySelector('#plan-action-sheet'));
    await new Promise((r) => setTimeout(r, 350));

    // Status indicator becomes red ×
    const corridaStatus = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_corrida"] .plan-status-badge',
      (el) => el.className
    );
    assert(corridaStatus.includes('plan-status--missed'), 'Corrida is marked missed (Não feita)');

    // ── 4. Everything persists after reload ───────────────────
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cal-grid');

    // Verify Future Day after reload
    await (await page.waitForSelector(`.cal-day[data-date="${futureStr}"]`)).click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));
    await page.waitForSelector('#section-planned .activity-item-wrapper[data-act-id="act_caminhada"]');

    const futureCaminhadaReload = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_caminhada"] .plan-status-badge',
      (el) => el.className
    );
    assert(futureCaminhadaReload.includes('plan-status--planned'), 'Future Caminhada persists as planned after reload');

    // Return to calendar
    await (await page.waitForSelector('#btn-back')).click();
    await page.waitForSelector('.calendar-screen');
    await new Promise((r) => setTimeout(r, 350));

    // Verify Today after reload
    await (await page.waitForSelector(`.cal-day[data-date="${todayStr}"]`)).click();
    await page.waitForSelector('.day-detail-screen');
    await new Promise((r) => setTimeout(r, 350));

    const todayAcademiaReload = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_academia"] .plan-status-badge',
      (el) => el.className
    );
    assert(todayAcademiaReload.includes('plan-status--done'), 'Today Academia persists as Feita (done) after reload');

    const todayAcademiaSubtitleReload = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(todayAcademiaSubtitleReload, 'Superiores', 'Selected option persisted in subtitle after reload');

    const todayCorridaReload = await page.$eval(
      '#section-planned .activity-item-wrapper[data-act-id="act_corrida"] .plan-status-badge',
      (el) => el.className
    );
    assert(todayCorridaReload.includes('plan-status--missed'), 'Today Corrida persists as Não feita (missed) after reload');

    // Verify Caminhada is in Atividades on today
    const todayCaminhadaUnplanned = await page.$('#section-activities .activity-item-wrapper[data-act-id="act_caminhada"]');
    assert(Boolean(todayCaminhadaUnplanned), 'Caminhada is in Atividades (unplanned) on today');

    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join('; ')}`);
    console.log('✅ Headless planning flow test passed completely!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
