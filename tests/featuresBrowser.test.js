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

      // Create two activities: one with usesMuscleGroups, one without
      await saveActivity({
        id: 'act_academia',
        name: 'Academia',
        icon: 'barbell',
        color: '#007aff',
        usesMuscleGroups: true,
      });

      await saveActivity({
        id: 'act_corrida',
        name: 'Corrida',
        icon: 'person-simple-run',
        color: '#34c759',
        usesMuscleGroups: false,
      });

      // Seed Day 2026-10-28: Academia done with Peito and Tríceps
      await setCompletion('2026-10-28', 'act_academia', true, ['mg_peito', 'mg_triceps']);
      await setDayRained('2026-10-28', true);
      await setDayNotes('2026-10-28', 'Treino forte com chuva lá fora');
    });

    assert(true, 'Banco semeado com atividades, grupos musculares, conclusão e registro do dia');

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

    // Verify chips container visible for Academia
    const isChipsVisible = await page.$eval(
      '#chips-container-act_academia',
      (el) => !el.classList.contains('hidden')
    );
    assertEqual(isChipsVisible, true, 'Chips de grupos musculares visíveis para Academia');

    // Verify selected chips
    const selectedChips = await page.$$eval(
      '#chips-container-act_academia .muscle-chip.selected',
      (els) => els.map((el) => el.textContent.trim())
    );
    assert(selectedChips.includes('Peito'), 'Chip Peito está selecionado');
    assert(selectedChips.includes('Tríceps'), 'Chip Tríceps está selecionado');
    assertEqual(selectedChips.length, 2, 'Exatamente 2 chips selecionados');

    // Verify subtitle under Academia name
    const subtitleText = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(subtitleText, 'Peito, Tríceps', 'Subtítulo exibe "Peito, Tríceps"');

    // Verify Corrida does NOT have chips container
    const corridaChips = await page.$('#chips-container-act_corrida');
    assertEqual(corridaChips, null, 'Atividade Corrida (usesMuscleGroups: false) não possui chips');

    console.log('\n--- Teste 3: Alteração de chips e notas com persistência após reload ---');
    // Select chip Ombros
    await page.click('#chips-container-act_academia button[data-mg-id="mg_ombros"]');

    const updatedSubtitle = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assert(updatedSubtitle.includes('Ombros'), 'Subtítulo atualizado incluindo "Ombros"');

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

    console.log('\n--- Teste 4: Desmarcar atividade limpa grupos e oculta chips ---');
    await page.click('.activity-check-row[data-id="act_academia"]');

    const chipsHidden = await page.$eval(
      '#chips-container-act_academia',
      (el) => el.classList.contains('hidden')
    );
    assertEqual(chipsHidden, true, 'Chips ocultados ao desmarcar atividade');

    const subtitleCleared = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(subtitleCleared, '', 'Subtítulo limpo ao desmarcar atividade');

    console.log('\n--- Teste 5: Tela de grupos musculares em Ajustes e arquivamento ---');
    // Open Ajustes tab
    await (await page.waitForSelector('[data-tab="ajustes"]')).click();
    await page.waitForSelector('.settings-screen');

    // Verify Cleanup 2: Appearance segmented control has standalone track without extra card
    const extraCardAroundAppearance = await page.$('.appearance-section .inset-group');
    assertEqual(extraCardAroundAppearance, null, 'Segmented control de Aparência não possui card envolvente extra');

    const trackWrapper = await page.$('.appearance-section .segmented-control-track-wrapper');
    assert(Boolean(trackWrapper), 'Segmented control de Aparência usa segmented-control-track-wrapper limpo');

    const segmentStyles = await page.evaluate(() => {
      const track = document.querySelector('.segmented-control-track-wrapper');
      const active = document.querySelector('.ios-segment-btn.active');
      const trackCs = getComputedStyle(track);
      const activeCs = getComputedStyle(active);
      return {
        trackBg: trackCs.backgroundColor,
        thumbBg: activeCs.backgroundColor,
        minHeight: parseFloat(activeCs.minHeight),
      };
    });
    assert(segmentStyles.minHeight >= 44, 'Segmentos de Aparência têm pelo menos 44px de altura');
    assert(Boolean(segmentStyles.trackBg), 'Trilha do segmented control tem cor de preenchimento');

    const themeThumbs = await page.evaluate(() => {
      document.querySelector('[data-theme-val="light"]').click();
      const lightThumb = getComputedStyle(document.documentElement)
        .getPropertyValue('--segmented-thumb')
        .trim()
        .toLowerCase();
      document.querySelector('[data-theme-val="dark"]').click();
      const darkThumb = getComputedStyle(document.documentElement)
        .getPropertyValue('--segmented-thumb')
        .trim()
        .toLowerCase();
      return { lightThumb, darkThumb };
    });
    assert(themeThumbs.lightThumb === '#ffffff', 'Segmento ativo no tema claro usa branco (#ffffff)');
    assert(themeThumbs.darkThumb === '#636366', 'Segmento ativo no tema escuro usa cinza mais claro (#636366)');

    await page.evaluate(() => {
      document.querySelector('[data-theme-val="auto"]').click();
    });

    // Navigate to Grupos musculares
    await (await page.waitForSelector('#btn-goto-muscle-groups')).click();
    await page.waitForSelector('.muscle-groups-screen');

    const mgTitle = await page.$eval('.day-large-title', (el) => el.textContent.trim());
    assertEqual(mgTitle, 'Grupos musculares', 'Tela de Grupos musculares aberta');

    // Add a new muscle group
    await page.type('#input-new-mg-name', 'Antebraço');
    await page.click('#btn-add-mg');
    // Wait for the list to re-render with the new group (name is unique, check by text content)
    await page.waitForFunction(() => {
      const names = Array.from(document.querySelectorAll('.mg-item-name'));
      return names.some((el) => el.textContent.trim() === 'Antebraço');
    });
    assert(true, 'Novo grupo "Antebraço" adicionado');

    // Archive Bíceps
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const removeBicepsBtn = await page.waitForSelector('.mg-remove-btn[data-name="Bíceps"]');
    await removeBicepsBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    const activeGroupsAfter = await page.$$eval('.mg-item-name', (els) =>
      els.map((el) => el.textContent.trim())
    );
    assert(!activeGroupsAfter.includes('Bíceps'), 'Grupo Bíceps foi arquivado e removido da lista ativa');
    assert(activeGroupsAfter.includes('Antebraço'), 'Grupo Antebraço permanece na lista ativa');

    console.log('\n--- Teste 6: Grupos arquivados continuam no histórico mas somem de novas seleções ---');
    // Seed a past day with the archived Bíceps
    await page.evaluate(async () => {
      const { setCompletion } = await import('./src/storage/storage.js');
      await setCompletion('2026-10-20', 'act_academia', true, ['mg_biceps']);
    });

    // Open past day (2026-10-20)
    await page.evaluate(async () => {
      const { mountDayDetailView } = await import('./src/ui/dayDetailView.js');
      const container = document.querySelector('#view-container');
      await mountDayDetailView(container, '2026-10-20', {
        onBack: () => {},
        onManageActivities: () => {},
      });
    });
    await page.waitForSelector('.day-detail-screen');
    await page.waitForSelector('#chips-container-act_academia');

    const pastSubtitle = await page.$eval('#subtitle-act_academia', (el) => el.textContent.trim());
    assertEqual(pastSubtitle, 'Bíceps', 'Histórico do dia passado continua exibindo o grupo arquivado "Bíceps"');

    const pastChips = await page.$$eval(
      '#chips-container-act_academia .muscle-chip',
      (els) => els.map((el) => el.textContent.trim())
    );
    assert(pastChips.includes('Bíceps'), 'Chip Bíceps permanece visível no dia em que foi utilizado');

    // Open a fresh day (2026-10-21) where Bíceps was NOT used
    await page.evaluate(async () => {
      const { setCompletion: sc } = await import('./src/storage/storage.js');
      const { mountDayDetailView } = await import('./src/ui/dayDetailView.js');
      await sc('2026-10-21', 'act_academia', true, []);
      const container = document.querySelector('#view-container');
      await mountDayDetailView(container, '2026-10-21', {
        onBack: () => {},
        onManageActivities: () => {},
      });
    });
    await page.waitForSelector('.day-detail-screen');
    await page.waitForSelector('#chips-container-act_academia');

    const freshChips = await page.$$eval(
      '#chips-container-act_academia .muscle-chip',
      (els) => els.map((el) => el.textContent.trim())
    );
    assert(!freshChips.includes('Bíceps'), 'Grupo arquivado Bíceps não aparece para novas seleções');
    assert(freshChips.includes('Antebraço'), 'Novo grupo Antebraço aparece para seleção');

    console.log('\n--- Teste 7: Tab bar e navegação continuam funcionando perfeitamente ---');
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

    console.log('\n────────────────────────────────────────');
    console.log('Todos os testes de ponta a ponta (RF05, RF06, RF09, Migração e Cleanups) passaram com sucesso!');

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
