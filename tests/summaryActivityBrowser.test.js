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

    // Seed database
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
        // Activity with details and notes
        actStore.put({
          id: 'act_musculacao',
          name: 'Musculação',
          icon: 'barbell',
          color: '#007aff',
          allowsNote: true,
          groups: [
            {
              id: 'grp_muscles',
              name: 'Grupos musculares',
              options: [
                { id: 'opt_peito', name: 'Peito', archived: false },
                { id: 'opt_costas', name: 'Costas', archived: false },
                { id: 'opt_pernas', name: 'Pernas', archived: false }, // 0 days -> must be omitted
                { id: 'opt_ombros', name: 'Ombros', archived: true },   // archived, 1 day -> must be counted
              ],
            },
            {
              id: 'grp_equip',
              name: 'Equipamento',
              options: [
                { id: 'opt_halteres', name: 'Halteres', archived: false }, // 0 days -> group omitted
              ],
            },
          ],
        });

        // Activity without notes
        actStore.put({
          id: 'act_caminhada',
          name: 'Caminhada',
          icon: 'person-simple-walk',
          color: '#34c759',
          allowsNote: false,
          groups: [],
        });

        const compStore = tx.objectStore('completions');

        // Musculação completions:
        // Day 1: Done with Peito, Costas and a note
        compStore.put({
          id: '2026-11-02:act_musculacao',
          date: '2026-11-02',
          activityId: 'act_musculacao',
          status: 'done',
          wasPlanned: false,
          optionIds: ['opt_peito', 'opt_costas'],
          note: 'Treino de costas e peito excelente',
        });

        // Day 2: Done with Peito, Ombros (archived option) and a newer note
        compStore.put({
          id: '2026-11-06:act_musculacao',
          date: '2026-11-06',
          activityId: 'act_musculacao',
          status: 'done',
          wasPlanned: true,
          optionIds: ['opt_peito', 'opt_ombros'],
          note: 'Aumentei peso no supino',
        });

        // Day 3: Planned with Peito, no note
        compStore.put({
          id: '2026-11-10:act_musculacao',
          date: '2026-11-10',
          activityId: 'act_musculacao',
          status: 'planned',
          wasPlanned: true,
          optionIds: ['opt_peito'],
        });

        // Day 4: Missed, no options
        compStore.put({
          id: '2026-11-12:act_musculacao',
          date: '2026-11-12',
          activityId: 'act_musculacao',
          status: 'missed',
          wasPlanned: true,
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    });

    console.log('\n--- 1. Navegar até a aba Resumo ---');
    const resumoTabBtn = await page.waitForSelector('[data-tab="resumo"]');
    await resumoTabBtn.click();
    await page.waitForSelector('.summary-screen');

    console.log('\n--- 2. Tocar na linha de Musculação empurra tela com nome da atividade ---');
    const row = await page.waitForSelector('.summary-activity-row[data-activity-id="act_musculacao"]');
    assert(row, 'Linha da atividade Musculação existe');
    await row.click();

    await page.waitForSelector('.view-layer--current .summary-activity-screen');
    const title = await page.$eval('.view-layer--current #summary-activity-title', (el) => el.textContent.trim());
    assertEqual(title, 'Musculação', 'Título da tela empurrada é "Musculação"');

    // Tab bar deve permanecer visível
    const isTabBarVisible = await page.$eval('.ios-tab-bar', (el) => !el.classList.contains('hidden'));
    assert(isTabBarVisible, 'Aba inferior (tab bar) permanece visível');

    // Back button com chevron deve existir
    const backBtn = await page.waitForSelector('.view-layer--current #btn-back-activity-summary');
    assert(backBtn, 'Botão de voltar com chevron está presente');

    console.log('\n--- 3. Card (a) "Neste mês": Feitas, Planejadas, Não feitas ---');
    const doneVal = await page.$eval('.view-layer--current #stat-act-done', (el) => el.textContent.trim());
    assertEqual(doneVal, '2', 'Feitas: 2 (dias 02 e 06)');

    const plannedVal = await page.$eval('.view-layer--current #stat-act-planned', (el) => el.textContent.trim());
    assertEqual(plannedVal, '1', 'Planejadas: 1 (dia 10)');

    const missedVal = await page.$eval('.view-layer--current #stat-act-missed', (el) => el.textContent.trim());
    assertEqual(missedVal, '1', 'Não feitas: 1 (dia 12)');

    console.log('\n--- 4. Card (b) Grupos de detalhe: nome do grupo, opções com dias e barra fina descrescente ---');
    const groupCard = await page.waitForSelector('.view-layer--current .summary-group-card[data-group-id="grp_muscles"]');
    assert(groupCard, 'Card do grupo "Grupos musculares" está presente');

    const groupTitle = await groupCard.$eval('.inset-section-header', (el) => el.textContent.trim());
    assertEqual(groupTitle, 'Grupos musculares', 'Título do card é o nome do grupo');

    // Opções: Peito (3 dias, 100%), Costas (1 dia), Ombros (arquivada, 1 dia). Pernas (0 dias) omitida.
    const optRows = await groupCard.$$('.summary-option-row');
    assertEqual(optRows.length, 3, 'Apenas 3 opções com pelo menos 1 dia (Pernas foi omitida)');

    const firstOptName = await optRows[0].$eval('.summary-activity-name', (el) => el.textContent.trim());
    const firstOptCount = await optRows[0].$eval('.summary-activity-count', (el) => el.textContent.trim());
    const firstOptWidth = await optRows[0].$eval('.summary-activity-bar-fill', (el) => el.style.width);
    assertEqual(firstOptName, 'Peito', '1ª opção é Peito');
    assertEqual(firstOptCount, '3 dias', 'Peito tem "3 dias"');
    assertEqual(firstOptWidth, '100%', 'Barra de Peito tem largura de 100%');

    // Verificar se a opção arquivada Ombros está presente e contada
    const ombrosRow = await groupCard.$('.summary-option-row[data-option-id="opt_ombros"]');
    assert(ombrosRow, 'Opção arquivada "Ombros" foi contada e exibida');
    const ombrosCount = await ombrosRow.$eval('.summary-activity-count', (el) => el.textContent.trim());
    assertEqual(ombrosCount, '1 dia', 'Ombros tem "1 dia"');

    // Grupo "Equipamento" que não tem opções com dias não deve ser exibido
    const equipCard = await page.$('.view-layer--current .summary-group-card[data-group-id="grp_equip"]');
    assert(!equipCard, 'Grupo "Equipamento" com 0 dias selecionados foi omitido');

    console.log('\n--- 5. Card (c) "Observações": data e texto, mais recente primeiro ---');
    const notesCard = await page.waitForSelector('.view-layer--current #summary-act-card-notes');
    assert(notesCard, 'Card de "Observações" está presente');

    const noteRows = await notesCard.$$('.summary-note-row');
    assertEqual(noteRows.length, 2, '2 observações no mês');

    // Mais recente primeiro: dia 06 antes do dia 02
    const firstNoteDate = await noteRows[0].$eval('.summary-note-date', (el) => el.textContent.trim());
    const firstNoteText = await noteRows[0].$eval('.summary-note-text', (el) => el.textContent.trim());
    assertEqual(firstNoteText, 'Aumentei peso no supino', '1ª observação é a mais recente (06/11)');
    assert(firstNoteDate.toLowerCase().includes('6'), `Data exibe dia 6 (obtido: ${firstNoteDate})`);

    const secondNoteText = await noteRows[1].$eval('.summary-note-text', (el) => el.textContent.trim());
    assertEqual(secondNoteText, 'Treino de costas e peito excelente', '2ª observação é a do dia 02/11');

    console.log('\n--- 6. Toque em observação abre a tela do respectivo dia e botão voltar funciona ---');
    await noteRows[0].click();

    await page.waitForSelector('.day-detail-screen');
    const dayHeading = await page.$eval('.day-large-title', (el) => el.textContent.trim());
    assert(dayHeading.includes('6') && dayHeading.toLowerCase().includes('novembro'), `Abriu dia da anotação: 2026-11-06 (obtido: ${dayHeading})`);

    // Voltar da tela do dia deve retornar para a tela de resumo da atividade
    const dayBackBtn = await page.waitForSelector('#btn-back');
    await dayBackBtn.click();
    await page.waitForFunction(() => !document.querySelector('.is-animating') && Boolean(document.querySelector('.view-layer--current .summary-activity-screen')));
    assert(true, 'Retornou da tela do dia para a tela de detalhes da atividade');

    // Voltar da tela da atividade deve retornar para a lista principal de Resumo
    const actBackBtn = await page.waitForSelector('.view-layer--current #btn-back-activity-summary');
    await actBackBtn.click();
    await page.waitForFunction(() => !document.querySelector('.is-animating') && Boolean(document.querySelector('.view-layer--current .summary-screen')));
    assert(true, 'Retornou da tela de detalhes da atividade para a tela de Resumo principal');

    console.log('\nTodos os testes headless do drill-down da atividade passaram com sucesso!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
