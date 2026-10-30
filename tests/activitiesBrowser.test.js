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

// Colors defined in activityLogic.js
const PRESET_COLORS = [
  '#007aff',
  '#34c759',
  '#ff9500',
  '#ff2d55',
  '#af52de',
  '#5856d6',
  '#ffcc00',
  '#32ade6',
];

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
    const consoleErrors = [];

    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });

    // Helper: Is tab bar visible
    const isTabBarVisible = async () => {
      return await page.$eval('.ios-tab-bar', (el) => !el.classList.contains('hidden'));
    };

    // Helper: Reset IndexedDB activities table
    const resetIndexedDB = async () => {
      await page.evaluate(() => {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open('DadsCalendarDB');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['activities'], 'readwrite');
            tx.objectStore('activities').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
          };
          req.onerror = (e) => reject(e.target.error);
        });
      });
    };

    console.log('\n--- Teste 1: Formulário "Nova" com 0 atividades existentes ---');
    await resetIndexedDB();

    // Navigate to Atividades tab
    await (await page.waitForSelector('[data-tab="atividades"]')).click();
    await page.waitForSelector('.activities-screen');

    assert(await isTabBarVisible(), 'Tab bar visível na listagem inicial de atividades');

    const emptyText = await page.$eval('.empty-state-text', (el) => el.textContent.trim());
    assertEqual(emptyText, 'Nenhuma atividade ainda. Toque em + para criar.', 'Mensagem de lista vazia correta');

    // Tap "+ Nova"
    console.log('  Toque em "+ Nova"...');
    await (await page.waitForSelector('#btn-new-activity')).click();

    // Assert form is visible
    await page.waitForSelector('#activity-form');
    assert(true, 'Formulário #activity-form visível no DOM');

    const formTitle = await page.$eval('.ios-modal-title', (el) => el.textContent.trim());
    assertEqual(formTitle, 'Nova atividade', 'Título do modal é "Nova atividade"');

    // Assert tab bar is hidden while form is open
    assert(!(await isTabBarVisible()), 'Tab bar oculta enquanto formulário de criação está aberto');

    // Assert default color is the first preset color (#007aff)
    const colorValue0 = await page.$eval('#form-act-color', (el) => el.value.toLowerCase());
    assertEqual(colorValue0, PRESET_COLORS[0].toLowerCase(), 'Cor padrão é a 1ª predefinição (azul)');

    const selectedBtnColor0 = await page.$eval('.color-choice-btn.selected', (el) => el.dataset.color.toLowerCase());
    assertEqual(selectedBtnColor0, PRESET_COLORS[0].toLowerCase(), 'Botão de predefinição azul está selecionado');

    // Test Cancelar restores tab bar
    console.log('  Toque em "Cancelar"...');
    await (await page.waitForSelector('#btn-cancel-form')).click();
    await page.waitForSelector('.activities-screen');
    assert(await isTabBarVisible(), 'Tab bar visível novamente após Cancelar');

    // Open form again and save first activity
    console.log('  Toque em "+ Nova" novamente e salvar atividade...');
    await (await page.waitForSelector('#btn-new-activity')).click();
    await page.waitForSelector('#activity-form');
    assert(!(await isTabBarVisible()), 'Tab bar oculta durante novo formulário');

    await page.type('#form-act-name', 'Caminhada');
    await (await page.waitForSelector('#btn-submit-header')).click();

    // Wait for list to re-render
    await page.waitForSelector('.activity-item-card');
    assert(await isTabBarVisible(), 'Tab bar visível novamente após Salvar');

    const cardNames1 = await page.$$eval('.activity-card-name', (els) => els.map((el) => el.textContent.trim()));
    assert(cardNames1.includes('Caminhada'), 'Nova atividade "Caminhada" aparece na lista');

    console.log('\n--- Teste 2: Formulário "Nova" com 1 atividade existente ---');
    assert(await isTabBarVisible(), 'Tab bar visível antes de abrir Nova');

    await (await page.waitForSelector('#btn-new-activity')).click();
    await page.waitForSelector('#activity-form');

    assert(!(await isTabBarVisible()), 'Tab bar oculta enquanto formulário de criação está aberto');

    // Default color must be the second preset color (#34c759) since #007aff is already in use
    const colorValue1 = await page.$eval('#form-act-color', (el) => el.value.toLowerCase());
    assertEqual(colorValue1, PRESET_COLORS[1].toLowerCase(), 'Cor padrão é a 2ª predefinição (verde), primeira não utilizada');

    const selectedBtnColor1 = await page.$eval('.color-choice-btn.selected', (el) => el.dataset.color.toLowerCase());
    assertEqual(selectedBtnColor1, PRESET_COLORS[1].toLowerCase(), 'Botão de predefinição verde está selecionado');

    // Save second activity
    await page.type('#form-act-name', 'Musculação');
    await (await page.waitForSelector('#btn-submit-header')).click();

    await page.waitForSelector('.activity-item-card:nth-child(2)');
    assert(await isTabBarVisible(), 'Tab bar visível novamente após Salvar 2ª atividade');

    const cardNames2 = await page.$$eval('.activity-card-name', (els) => els.map((el) => el.textContent.trim()));
    assert(cardNames2.includes('Musculação'), 'Atividade "Musculação" aparece na lista');
    assertEqual(cardNames2.length, 2, 'Lista contém exatamente 2 atividades');

    console.log('\n--- Teste 3: Formulário "Nova" com várias atividades existentes ---');
    await (await page.waitForSelector('#btn-new-activity')).click();
    await page.waitForSelector('#activity-form');

    assert(!(await isTabBarVisible()), 'Tab bar oculta durante abertura com múltiplas atividades');

    // Default color must be the third preset (#ff9500)
    const colorValue2 = await page.$eval('#form-act-color', (el) => el.value.toLowerCase());
    assertEqual(colorValue2, PRESET_COLORS[2].toLowerCase(), 'Cor padrão é a 3ª predefinição (laranja), primeira livre');

    await page.type('#form-act-name', 'Natação');
    await (await page.waitForSelector('#btn-submit-header')).click();

    await page.waitForSelector('.activity-item-card:nth-child(3)');
    assert(await isTabBarVisible(), 'Tab bar visível novamente após Salvar 3ª atividade');

    const cardNames3 = await page.$$eval('.activity-card-name', (els) => els.map((el) => el.textContent.trim()));
    assert(cardNames3.includes('Natação'), 'Atividade "Natação" aparece na lista');
    assertEqual(cardNames3.length, 3, 'Lista contém 3 atividades');

    console.log('\n--- Teste 4: Edição de atividade existente ---');
    // Click first card
    const firstCard = await page.waitForSelector('.activity-item-card');
    await firstCard.click();

    await page.waitForSelector('#activity-form');
    assert(!(await isTabBarVisible()), 'Tab bar oculta ao abrir formulário de edição');

    const editTitle = await page.$eval('.ios-modal-title', (el) => el.textContent.trim());
    assertEqual(editTitle, 'Editar atividade', 'Título do modal é "Editar atividade"');

    const existingName = await page.$eval('#form-act-name', (el) => el.value);
    assertEqual(existingName, 'Caminhada', 'Formulário de edição exibe o nome original');

    // Cancel edit
    console.log('  Toque em "Cancelar" na edição...');
    await (await page.waitForSelector('#btn-cancel-form')).click();
    await page.waitForSelector('.activities-screen');
    assert(await isTabBarVisible(), 'Tab bar visível após Cancelar edição');

    // Open first card again and save changes
    console.log('  Toque no card para editar e salvar...');
    const firstCardAgain = await page.waitForSelector('.activity-item-card');
    await firstCardAgain.click();
    await page.waitForSelector('#activity-form');
    assert(!(await isTabBarVisible()), 'Tab bar oculta durante edição');

    await page.$eval('#form-act-name', (el) => { el.value = ''; });
    await page.type('#form-act-name', 'Caminhada Rápida');
    await (await page.waitForSelector('#btn-submit-header')).click();

    await page.waitForSelector('.activity-item-card');
    assert(await isTabBarVisible(), 'Tab bar visível após Salvar edição');

    const updatedCardNames = await page.$$eval('.activity-card-name', (els) => els.map((el) => el.textContent.trim()));
    assert(updatedCardNames.includes('Caminhada Rápida'), 'Nome editado "Caminhada Rápida" refletido na lista');

    console.log('\n--- Teste 5: Resiliência contra exceções e restauração da tab bar ---');
    // Force a runtime error inside a test container to ensure tab bar restores and friendly error is shown
    const errorHandled = await page.evaluate(async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      let tabHidden = false;

      const { mountActivitiesView } = await import('./src/ui/activitiesView.js');
      mountActivitiesView(container, {
        onFormOpen: () => { tabHidden = true; },
        onFormClose: () => { tabHidden = false; },
      });

      // Wait for list to render
      await new Promise((r) => setTimeout(r, 100));

      // Simulate a throw by corrupting an internal function or DOM element before form call
      // Call renderForm with something that triggers catch
      const newBtn = container.querySelector('#btn-new-activity');

      // Now temporarily break querySelector to simulate rendering exception
      const origQS = container.querySelector.bind(container);
      container.querySelector = (sel) => {
        if (sel === '#activity-form') throw new Error('Simulated DOM failure');
        return origQS(sel);
      };

      try {
        newBtn.click();
      } catch (e) {}

      // Check if friendly error UI is shown and tab bar was restored
      const text = container.textContent;
      container.remove();
      return {
        tabHidden,
        hasErrorMsg: text.includes('Não foi possível abrir o formulário'),
      };
    });

    assert(!errorHandled.tabHidden, 'Tab bar não fica oculta quando ocorre erro na renderização');
    assert(errorHandled.hasErrorMsg, 'Mensagem amigável em pt-BR é exibida ao usuário em caso de falha');

    console.log('\n────────────────────────────────────────');
    console.log('Todos os testes no navegador headless passaram com sucesso!');

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
