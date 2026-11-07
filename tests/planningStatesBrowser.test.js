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

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });

    // Seed activities and completion entries of each status
    const seeded = await page.evaluate(async () => {
      const now = new Date();
      const format = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const today = format(now);
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

        // 1. Musculação
        actStore.put({
          id: 'act_musculacao',
          name: 'Musculação',
          icon: 'barbell',
          color: '#007aff',
          groups: [],
          allowsNote: true,
          createdAt: 1000,
        });

        // 2. Corrida
        actStore.put({
          id: 'act_corrida',
          name: 'Corrida',
          icon: 'person-simple-run',
          color: '#34c759',
          groups: [],
          allowsNote: false,
          createdAt: 2000,
        });

        // 3. Alongamento
        actStore.put({
          id: 'act_alongamento',
          name: 'Alongamento',
          icon: 'flower-lotus',
          color: '#ff9500',
          groups: [],
          allowsNote: false,
          createdAt: 3000,
        });

        // 4. Caminhada (unplanned)
        actStore.put({
          id: 'act_caminhada',
          name: 'Caminhada',
          icon: 'person-simple-walk',
          color: '#ff2d55',
          groups: [],
          allowsNote: false,
          createdAt: 4000,
        });

        const compStore = tx.objectStore('completions');

        // Today: Musculação feita (done) with note
        compStore.put({
          id: `${today}:act_musculacao`,
          date: today,
          activityId: 'act_musculacao',
          status: 'done',
          wasPlanned: true,
          completedAt: Date.now(),
          optionIds: [],
          note: 'Treino de pernas concluído',
        });

        // Today: Corrida planejada (planned)
        compStore.put({
          id: `${today}:act_corrida`,
          date: today,
          activityId: 'act_corrida',
          status: 'planned',
          wasPlanned: true,
          optionIds: [],
          note: '',
        });

        // Today: Alongamento não feita (missed)
        compStore.put({
          id: `${today}:act_alongamento`,
          date: today,
          activityId: 'act_alongamento',
          status: 'missed',
          wasPlanned: true,
          optionIds: [],
          note: '',
        });

        // Yesterday: Corrida planned and pending (past)
        compStore.put({
          id: `${yesterday}:act_corrida`,
          date: yesterday,
          activityId: 'act_corrida',
          status: 'planned',
          wasPlanned: true,
          optionIds: [],
          note: '',
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });

      localStorage.removeItem('calendar_view_mode');
      return { today, yesterday };
    });

    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cal-day[data-date]');

    console.log('\n--- 1. Testing Month Cell Markers and Legend ---');
    const monthCellInfo = await page.evaluate((todayStr) => {
      const cell = document.querySelector(`.cal-day[data-date="${todayStr}"]`);
      const markers = Array.from(cell.querySelectorAll('.cal-dot'));
      const legend = document.querySelector('#cal-legend');

      return {
        hasCompletionsClass: cell.classList.contains('cal-day--has-completions'),
        markersCount: markers.length,
        doneMarker: {
          exists: Boolean(cell.querySelector('.cal-dot[data-status="done"], .cal-dot--done')),
          bgColor: getComputedStyle(cell.querySelector('.cal-dot--done') || {}).backgroundColor,
        },
        plannedMarker: {
          exists: Boolean(cell.querySelector('.cal-dot[data-status="planned"], .cal-dot--planned')),
          borderStyle: getComputedStyle(cell.querySelector('.cal-dot--planned') || {}).borderStyle,
        },
        missedMarker: {
          exists: Boolean(cell.querySelector('.cal-dot[data-status="missed"], .cal-dot--missed')),
          hasSvg: Boolean(cell.querySelector('.cal-dot--missed svg')),
        },
        legendText: legend ? legend.textContent.trim() : '',
      };
    }, seeded.today);

    assert(monthCellInfo.hasCompletionsClass, 'Célula de hoje tem classe cal-day--has-completions');
    assert(monthCellInfo.markersCount === 3, `Célula de hoje tem 3 marcadores (obtido: ${monthCellInfo.markersCount})`);
    assert(monthCellInfo.doneMarker.exists, 'Marcador de feita (feita = filled dot) está presente');
    assert(monthCellInfo.plannedMarker.exists, 'Marcador de planejada (planejada = hollow ring) está presente');
    assert(monthCellInfo.missedMarker.exists && monthCellInfo.missedMarker.hasSvg, 'Marcador de não feita (não feita = pequeno ×) está presente');
    assert(
      monthCellInfo.legendText.includes('● feita') &&
      monthCellInfo.legendText.includes('○ planejada') &&
      monthCellInfo.legendText.includes('× não feita'),
      `Legenda presente no cartão do calendário: "${monthCellInfo.legendText}"`
    );

    console.log('\n--- 2. Testing Hoje Card Sections and Inline Actions ---');
    const hojeCardInfo = await page.evaluate(() => {
      const plannedHead = Array.from(document.querySelectorAll('.today-subhead')).find((el) => el.textContent.includes('Planejadas'));
      const actHead = Array.from(document.querySelectorAll('.today-subhead')).find((el) => el.textContent.includes('Atividades'));

      const plannedRows = Array.from(document.querySelectorAll('#today-card-content .planned-check-row'));
      const unplannedRows = Array.from(document.querySelectorAll('#today-card-content .unplanned-check-row'));

      const musculacaoRow = document.querySelector('#today-card-content .activity-check-row[data-id="act_musculacao"]');
      const musculacaoDoneActive = musculacaoRow?.querySelector('.btn-inline-status--done')?.classList.contains('is-active');

      const alongamentoRow = document.querySelector('#today-card-content .activity-check-row[data-id="act_alongamento"]');
      const alongamentoMissedActive = alongamentoRow?.querySelector('.btn-inline-status--missed')?.classList.contains('is-active');

      const corridaRow = document.querySelector('#today-card-content .activity-check-row[data-id="act_corrida"]');
      const corridaDoneBtn = Boolean(corridaRow?.querySelector('.btn-inline-status--done'));
      const corridaMissedBtn = Boolean(corridaRow?.querySelector('.btn-inline-status--missed'));

      const caminhadaRow = document.querySelector('#today-card-content .activity-check-row[data-id="act_caminhada"]');
      const caminhadaCheckCircle = Boolean(caminhadaRow?.querySelector('.activity-checkbox-circle'));
      const caminhadaPlanBtn = Boolean(caminhadaRow?.querySelector('.btn-plan-activity'));

      return {
        hasPlannedHead: Boolean(plannedHead),
        hasActHead: Boolean(actHead),
        plannedRowsCount: plannedRows.length,
        unplannedRowsCount: unplannedRows.length,
        musculacaoDoneActive,
        alongamentoMissedActive,
        corridaHasInlineButtons: corridaDoneBtn && corridaMissedBtn,
        caminhadaCheckCircle,
        caminhadaPlanBtn,
      };
    });

    assert(hojeCardInfo.hasPlannedHead && hojeCardInfo.hasActHead, 'Hoje card possui as duas seções: Planejadas e Atividades');
    assert(hojeCardInfo.plannedRowsCount === 3, 'Seção Planejadas contém as 3 atividades planejadas');
    assert(hojeCardInfo.unplannedRowsCount === 1, 'Seção Atividades contém a atividade não planejada (Caminhada)');
    assert(hojeCardInfo.musculacaoDoneActive, 'Entrada feita tem botão inline "Feita" ativo');
    assert(hojeCardInfo.alongamentoMissedActive, 'Entrada não feita tem botão inline "Não feita" ativo');
    assert(hojeCardInfo.corridaHasInlineButtons, 'Entrada planejada pendente tem botões inline "Feita" e "Não feita"');
    assert(hojeCardInfo.caminhadaCheckCircle && hojeCardInfo.caminhadaPlanBtn, 'Atividade em Atividades tem check circle e botão "Planejar"');

    console.log('\n--- 3. Testing Week View Badges, Note Icon, and Pendente ---');
    // Switch to week view
    await page.click('#seg-btn-week');
    await page.waitForFunction(() => document.querySelector('#cal-week-view').style.display !== 'none');
    await page.waitForSelector('.cal-week-row[data-date]');

    const weekRowsInfo = await page.evaluate((seededDates) => {
      const todayRow = document.querySelector(`.cal-week-row[data-date="${seededDates.today}"]`);
      const yesterdayRow = document.querySelector(`.cal-week-row[data-date="${seededDates.yesterday}"]`);

      const todayDoneBadge = Boolean(todayRow?.querySelector('.activity-icon-badge--done'));
      const todayPlannedBadge = Boolean(todayRow?.querySelector('.activity-icon-badge--planned'));
      const todayMissedBadge = Boolean(todayRow?.querySelector('.activity-icon-badge--missed'));
      const todayMissedX = Boolean(todayRow?.querySelector('.activity-icon-badge--missed .badge-missed-x'));

      const noteIcon = todayRow?.querySelector('.cal-week-note-icon svg');
      const noteIconWidth = noteIcon ? noteIcon.getBoundingClientRect().width : 0;

      const yesterdayPending = yesterdayRow?.querySelector('.pending-badge-text')?.textContent.trim();

      return {
        todayDoneBadge,
        todayPlannedBadge,
        todayMissedBadge,
        todayMissedX,
        hasNoteIcon: Boolean(noteIcon),
        noteIconWidth,
        yesterdayPending,
      };
    }, seeded);

    assert(weekRowsInfo.todayDoneBadge, 'Visão semanal: entrada feita renderiza badge preenchido (filled icon badge)');
    assert(weekRowsInfo.todayPlannedBadge, 'Visão semanal: entrada planejada renderiza badge contornado (outlined badge)');
    assert(weekRowsInfo.todayMissedBadge && weekRowsInfo.todayMissedX, 'Visão semanal: entrada não feita renderiza badge desbotado com × (faded badge with small × mark)');
    assert(weekRowsInfo.hasNoteIcon, 'Visão semanal: entrada com nota exibe ícone de nota Phosphor note-pencil');
    assert(weekRowsInfo.noteIconWidth >= 12 && weekRowsInfo.noteIconWidth <= 16, `Ícone de nota renderizado em tamanho ~14px (obtido: ${weekRowsInfo.noteIconWidth}px)`);
    assert(weekRowsInfo.yesterdayPending === 'Pendente', `Entrada planejada pendente no passado exibe "Pendente" no texto secundário (obtido: "${weekRowsInfo.yesterdayPending}")`);

    console.log('\n✅ All planning states headless assertions passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    await browser?.close();
    server.close();
  }
});
