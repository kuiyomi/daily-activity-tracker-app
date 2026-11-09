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

    // Mock Date so the test consistently evaluates with reference "today" as 2026-11-15
    await page.evaluateOnNewDocument(() => {
      const FIXED_TIME = new Date(2026, 10, 15, 12, 0, 0).getTime(); // 2026-11-15 12:00
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

    // Seed activities, completions across all statuses, and rainy days in November 2026
    await page.evaluate(async () => {
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
        // Activity 1: Musculação
        actStore.put({
          id: 'act_musculacao',
          name: 'Musculação',
          icon: 'barbell',
          color: '#007aff',
          groups: [],
          allowsNote: true,
        });

        // Activity 2: Caminhada
        actStore.put({
          id: 'act_caminhada',
          name: 'Caminhada',
          icon: 'person-simple-walk',
          color: '#ff2d55',
          groups: [],
          allowsNote: false,
        });

        const compStore = tx.objectStore('completions');
        // 1. Status 'done', wasPlanned: false (unplanned done) -> activeDay 1
        compStore.put({
          id: '2026-11-02:act_musculacao',
          date: '2026-11-02',
          activityId: 'act_musculacao',
          status: 'done',
          wasPlanned: false,
        });

        // 2. Status 'done', wasPlanned: true (planned done) -> activeDay 2, plan.done: 1
        compStore.put({
          id: '2026-11-04:act_musculacao',
          date: '2026-11-04',
          activityId: 'act_musculacao',
          status: 'done',
          wasPlanned: true,
        });

        // 3. Status 'missed', wasPlanned: true on rainy day -> plan.missed: 1, missedOnRainDays: 1
        compStore.put({
          id: '2026-11-06:act_caminhada',
          date: '2026-11-06',
          activityId: 'act_caminhada',
          status: 'missed',
          wasPlanned: true,
        });

        // 4. Status 'planned', wasPlanned: true before today (2026-11-08 < 2026-11-15) -> pending: 1
        compStore.put({
          id: '2026-11-08:act_musculacao',
          date: '2026-11-08',
          activityId: 'act_musculacao',
          status: 'planned',
          wasPlanned: true,
        });

        // 5. Status 'planned', wasPlanned: true today or later (2026-11-20 > 2026-11-15) -> upcoming: 1
        compStore.put({
          id: '2026-11-20:act_caminhada',
          date: '2026-11-20',
          activityId: 'act_caminhada',
          status: 'planned',
          wasPlanned: true,
        });

        const dayStore = tx.objectStore('dayEntries');
        // Rainy day 1 (coincides with missed planned activity on 2026-11-06)
        dayStore.put({
          date: '2026-11-06',
          rained: true,
          notes: 'Choveu o dia todo',
        });

        // Rainy day 2 (2026-11-10)
        dayStore.put({
          date: '2026-11-10',
          rained: true,
          notes: '',
        });

        // Non-rainy day
        dayStore.put({
          date: '2026-11-12',
          rained: false,
          notes: 'Dia ensolarado',
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    });

    console.log('\n--- 1. Navegação para a aba Resumo e título ---');
    const resumoTabBtn = await page.waitForSelector('[data-tab="resumo"]');
    assert(resumoTabBtn, 'Botão da aba Resumo existe na barra de navegação');
    await resumoTabBtn.click();

    await page.waitForSelector('.summary-screen');
    const pageTitle = await page.$eval('.ios-large-title', (el) => el.textContent.trim());
    assertEqual(pageTitle, 'Resumo', 'Título grande da tela é "Resumo"');

    const monthTitle = await page.$eval('#summary-cal-title', (el) => el.textContent.trim());
    assert(monthTitle.toLowerCase().includes('novembro'), `Título do mês exibe Novembro (obtido: ${monthTitle})`);

    console.log('\n--- 2. Asserção dos números nos três blocos de estatísticas (Card a) ---');
    await page.waitForSelector('#stat-active-days');
    const activeDays = await page.$eval('#stat-active-days', (el) => el.textContent.trim());
    assertEqual(activeDays, '2', 'Dias ativos são 2 (02/11 e 04/11)');

    const rainDays = await page.$eval('#stat-rain-days', (el) => el.textContent.trim());
    assertEqual(rainDays, '2', 'Dias de chuva são 2 (06/11 e 10/11)');

    const adherence = await page.$eval('#stat-adherence', (el) => el.textContent.trim());
    assertEqual(adherence, '50%', 'Plano cumprido é 50% (1 feita / (1 feita + 1 não feita))');

    console.log('\n--- 3. Asserção da lista "Por atividade" (Card b) ---');
    const actRow = await page.waitForSelector('.summary-activity-row[data-activity-id="act_musculacao"]');
    assert(actRow, 'Linha de Musculação está presente');

    const actName = await actRow.$eval('.summary-activity-name', (el) => el.textContent.trim());
    assertEqual(actName, 'Musculação', 'Nome da atividade é Musculação');

    const actCount = await actRow.$eval('.summary-activity-count', (el) => el.textContent.trim());
    assertEqual(actCount, '2 dias', 'Contagem de dias é "2 dias"');

    const barWidth = await actRow.$eval('.summary-activity-bar-fill', (el) => el.style.width);
    assertEqual(barWidth, '100%', 'Barra da atividade com valor máximo tem 100%');

    console.log('\n--- 4. Asserção do card "Planejamento" (Card c) ---');
    const planDone = await page.$eval('#stat-plan-done', (el) => el.textContent.trim());
    assertEqual(planDone, '1', 'Feitas: 1');

    const planMissed = await page.$eval('#stat-plan-missed', (el) => el.textContent.trim());
    assertEqual(planMissed, '1', 'Não feitas: 1');

    const planPending = await page.$eval('.summary-pending-orange', (el) => el.textContent.trim());
    assertEqual(planPending, '1', 'Pendentes: 1');

    const planUpcoming = await page.$eval('#stat-plan-upcoming', (el) => el.textContent.trim());
    assertEqual(planUpcoming, '1', 'A fazer: 1');

    const missedRain = await page.$eval('#stat-missed-rain', (el) => el.textContent.trim());
    assertEqual(missedRain, '1', 'Não feitas em dias de chuva: 1');

    console.log('\n--- 5. Toque na linha de Pendentes abre a tela do dia pendente mais antigo ---');
    const pendingButton = await page.$('#plan-row-pending');
    assert(pendingButton, 'Botão/linha de Pendentes é interativo');
    await pendingButton.click();

    await page.waitForSelector('.day-detail-screen');
    const dayHeading = await page.$eval('.day-large-title', (el) => el.textContent.trim());
    assert(dayHeading.includes('8') && dayHeading.toLowerCase().includes('novembro'), `Abriu a tela do dia pendente 2026-11-08 (obtido: ${dayHeading})`);

    // Voltar para Resumo
    const backBtn = await page.waitForSelector('#btn-back');
    await backBtn.click();
    await page.waitForFunction(() => !document.querySelector('.is-animating') && Boolean(document.querySelector('.view-layer--current .summary-screen')));
    assert(true, 'Botão Voltar retornou com sucesso para a tela de Resumo');

    console.log('\n--- 6. Navegação de mês (‹ › e botão Hoje) e estado vazio (Card d) ---');
    await page.click('.view-layer--current #summary-btn-next');

    await page.waitForSelector('.summary-empty-card');
    const emptyText = await page.$eval('.summary-empty-text', (el) => el.textContent.trim());
    assertEqual(emptyText, 'Sem registros neste mês.', 'Estado vazio exibido para mês sem registros');

    // Botão Hoje deve estar visível
    await page.waitForFunction(() => !document.querySelector('.is-animating'));
    const isTodayHidden = await page.$eval('.view-layer--current #summary-btn-today', (el) => el.classList.contains('is-visually-hidden'));
    assert(!isTodayHidden, 'Botão "Hoje" fica visível fora do mês atual');

    await page.click('.view-layer--current #summary-btn-today');
    await page.waitForFunction(() => !document.querySelector('.is-animating') && Boolean(document.querySelector('.view-layer--current #stat-active-days')));
    const restoredActive = await page.$eval('.view-layer--current #stat-active-days', (el) => el.textContent.trim());
    assertEqual(restoredActive, '2', 'Botão "Hoje" retornou ao mês atual restaurando as estatísticas');

    console.log('\nTodos os testes headless da tela de Resumo passaram com sucesso!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
