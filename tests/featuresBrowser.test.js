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

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });

    console.log('\n--- Teste 1: Limpeza e semeadura de dados com atividades e grupos musculares ---');
    await page.evaluate(async () => {
      const {
        getDB,
        saveActivity,
        setCompletion,
        setDayRained,
        setDayNotes,
        getMuscleGroups,
      } = await import('./src/storage/storage.js');

      // Clear existing test data
      const db = await getDB();
      const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
      tx.objectStore('activities').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('dayEntries').clear();
      await new Promise((r) => { tx.oncomplete = r; });

      // Create two activities: Academia with groups (one multiple, one single), Corrida without groups
      await saveActivity({
        id: 'act_academia',
        name: 'Academia',
        icon: 'barbell',
        color: '#007aff',
        groups: [
          {
            id: 'grp_grupos_musculares',
            name: 'Grupos musculares',
            multiple: true,
            archived: false,
            options: [
              { id: 'opt_peito', name: 'Peito', archived: false },
              { id: 'opt_triceps', name: 'Tríceps', archived: false },
              { id: 'opt_ombros', name: 'Ombros', archived: false },
              { id: 'opt_biceps', name: 'Bíceps', archived: false },
            ],
          },
          {
            id: 'grp_esforco',
            name: 'Nível de esforço',
            multiple: false,
            archived: false,
            options: [
              { id: 'opt_moderado', name: 'Moderado', archived: false },
              { id: 'opt_intenso', name: 'Intenso', archived: false },
            ],
          },
        ],
      });

      await saveActivity({
        id: 'act_corrida',
        name: 'Corrida',
        icon: 'person-simple-run',
        color: '#34c759',
        groups: [],
      });

      // Seed Day 2026-10-28: Academia done with Peito, Tríceps, and Moderado
      await setCompletion('2026-10-28', 'act_academia', true, ['opt_peito', 'opt_triceps', 'opt_moderado']);
      await setDayRained('2026-10-28', true);
      await setDayNotes('2026-10-28', 'Treino forte com chuva lá fora');
    });

    assert(true, 'Banco semeado com atividades, detalhes (grupos), conclusão e registro do dia');

    console.log('\n--- Teste 2: Abertura do dia e verificação de Choveu, Anotações e Chips ---');
    // Open Day 2026-10-28 via day button or direct call
    await page.evaluate(async () => {
      const { mountDayDetailView } = await import('./src/ui/dayDetailView.js');
      const container = document.querySelector('#view-container');
      await mountDayDetailView(container, '2026-10-28', {
        onBack: () => {},
        onManageActivities: () => {},
      });
    });

    await page.waitForSelector('.day-detail-screen');
    await page.waitForSelector('#chips-container-act_academia');

    // Verify Choveu switch
    const isRained = await page.$eval('#day-rained-switch', (el) => el.checked);
    assertEqual(isRained, true, 'Interruptor "Choveu" carregou com estado marcado (true)');

    // Verify notes textarea
    const notesVal = await page.$eval('#day-notes-input', (el) => el.value);
    assertEqual(notesVal, 'Treino forte com chuva lá fora', 'Anotações carregadas corretamente');

    // Verify Academia row
    const isAcademiaDone = await page.$eval(
      '.activity-check-row[data-id="act_academia"]',
      (el) => el.classList.contains('activity-check-row--done')
    );
    assertEqual(isAcademiaDone, true, 'Atividade Academia está marcada como concluída');

    // Verify groups container visible for Academia
    const isChipsVisible = await page.$eval(
      '#chips-container-act_academia',
      (el) => !el.classList.contains('hidden')
    );
    assertEqual(isChipsVisible, true, 'Container de grupos visível para Academia');

    // Verify grouped cards with headers
    const groupHeaders = await page.$$eval(
      '#chips-container-act_academia .activity-group-header span',
      (els) => els.map((el) => el.textContent.trim())
    );
    assertEqual(groupHeaders[0], 'Grupos musculares', '1º card agrupado tem cabeçalho "Grupos musculares"');
    assertEqual(groupHeaders[1], 'Nível de esforço', '2º card agrupado tem cabeçalho "Nível de esforço"');

    // Verify selected chips
    const selectedChips = await page.$$eval(
      '#chips-container-act_academia .muscle-chip.selected',
      (els) => els.map((el) => el.textContent.trim())
    );
    assert(selectedChips.includes('Peito'), 'Chip Peito está selecionado');
    assert(selectedChips.includes('Tríceps'), 'Chip Tríceps está selecionado');
    assert(selectedChips.includes('Moderado'), 'Chip Moderado está selecionado');
    assertEqual(selectedChips.length, 3, 'Exatamente 3 chips selecionados');

    // Verify subtitle under Academia name
    const subtitleText = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(subtitleText, 'Peito, Tríceps, Moderado', 'Subtítulo exibe "Peito, Tríceps, Moderado"');

    // Verify Corrida does NOT have chips container
    const corridaChips = await page.$('#chips-container-act_corrida');
    assertEqual(corridaChips, null, 'Atividade Corrida (sem grupos) não possui container de chips');

    console.log('\n--- Teste 3: Alteração de chips (multiple=false e multiple=true) com persistência ---');
    // Test multiple=false: click "Intenso" in Nível de esforço, "Moderado" should be unselected
    await page.click('#chips-container-act_academia button[data-opt-id="opt_intenso"]');

    const selectedChipsAfterSingle = await page.$$eval(
      '#chips-container-act_academia [data-group-id="grp_esforco"] .group-chip.selected',
      (els) => els.map((el) => el.textContent.trim())
    );
    assertEqual(selectedChipsAfterSingle.length, 1, 'Grupo multiple=false permite apenas 1 opção selecionada');
    assertEqual(selectedChipsAfterSingle[0], 'Intenso', 'Apenas "Intenso" está selecionado no grupo de esforço');

    // Select chip Ombros (multiple=true)
    await page.click('#chips-container-act_academia button[data-opt-id="opt_ombros"]');

    const updatedSubtitle = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assert(updatedSubtitle.includes('Ombros'), 'Subtítulo atualizado incluindo "Ombros"');
    assert(updatedSubtitle.includes('Intenso'), 'Subtítulo atualizado incluindo "Intenso"');

    // Edit notes and toggle rain switch
    await page.$eval('#day-notes-input', (el) => {
      el.value = 'Treino atualizado com ombros';
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('blur'));
    });

    await page.click('label[for="day-rained-switch"]'); // toggle to false
    await new Promise((r) => setTimeout(r, 400));

    // Reload page and re-mount day
    await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const { mountDayDetailView } = await import('./src/ui/dayDetailView.js');
      const container = document.querySelector('#view-container');
      await mountDayDetailView(container, '2026-10-28', {
        onBack: () => {},
        onManageActivities: () => {},
      });
    });
    await page.waitForSelector('.day-detail-screen');
    await page.waitForSelector('#chips-container-act_academia');

    const rainedAfterReload = await page.$eval('#day-rained-switch', (el) => el.checked);
    assertEqual(rainedAfterReload, false, 'Choveu (desmarcado) persistiu após recarregar');

    const notesAfterReload = await page.$eval('#day-notes-input', (el) => el.value);
    assertEqual(notesAfterReload, 'Treino atualizado com ombros', 'Anotações persistiram após recarregar');

    const chipsAfterReload = await page.$$eval(
      '#chips-container-act_academia .muscle-chip.selected',
      (els) => els.map((el) => el.textContent.trim())
    );
    assert(chipsAfterReload.includes('Ombros'), 'Chip Ombros continuou selecionado após reload');
    assert(chipsAfterReload.includes('Intenso'), 'Chip Intenso continuou selecionado após reload');

    console.log('\n--- Teste 4: Desmarcar atividade limpa grupos e oculta chips ---');
    await page.click('.activity-check-row[data-id="act_academia"]');

    const chipsHidden = await page.$eval(
      '#chips-container-act_academia',
      (el) => el.classList.contains('hidden')
    );
    assertEqual(chipsHidden, true, 'Chips ocultados ao desmarcar atividade');

    const subtitleCleared = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(subtitleCleared, '', 'Subtítulo limpo ao desmarcar atividade');

    console.log('\n--- Teste 5: Tab bar e navegação continuam funcionando perfeitamente ---');
    const tabBarVisible = await page.$eval('.ios-tab-bar', (el) => !el.classList.contains('hidden'));
    assert(tabBarVisible, 'Tab bar está visível na tela de detalhes do dia');

    await (await page.waitForSelector('[data-tab="calendario"]')).click();
    await page.waitForSelector('.calendar-card');
    assert(true, 'Navegação para Calendário funciona');

    await (await page.waitForSelector('[data-tab="atividades"]')).click();
    await page.waitForSelector('.activities-screen');
    assert(true, 'Navegação para Atividades funciona');

    await (await page.waitForSelector('[data-tab="ajustes"]')).click();
    await page.waitForSelector('.settings-screen');
    assert(true, 'Navegação para Ajustes funciona');

    // Confirm Ajustes no longer has "Grupos musculares"
    const mgRowInSettings = await page.$('#btn-goto-muscle-groups');
    assertEqual(mgRowInSettings, null, 'Ajustes não possui mais a linha de grupos musculares');

    console.log('\n────────────────────────────────────────');
    console.log('Todos os testes de ponta a ponta dos detalhes de atividade passaram com sucesso!');

    if (pageErrors.length > 0) {
      console.warn('Avisos de erros capturados:', pageErrors);
    }
  } catch (err) {
    console.error('Falha nos testes de navegador:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
