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

    console.log('\n--- Teste 1: Verificação da barra de abas (quatro abas com Resumo oculta) ---');
    const tabItems = await page.$$eval('.ios-tab-bar .ios-tab-item', (els) =>
      els.map((el) => ({
        tab: el.dataset.tab,
        label: el.querySelector('.tab-label')?.textContent.trim(),
        hidden: el.classList.contains('hidden') || el.style.display === 'none',
      }))
    );

    assertEqual(tabItems.length, 4, 'A barra de abas possui 4 itens definidos na estrutura');
    const tabKeys = tabItems.map((t) => t.tab);
    assertEqual(
      JSON.stringify(tabKeys),
      JSON.stringify(['calendario', 'atividades', 'resumo', 'ajustes']),
      'Abas corretas: Calendário, Atividades, Resumo, Ajustes'
    );

    const resumoTab = tabItems.find((t) => t.tab === 'resumo');
    assert(resumoTab && resumoTab.hidden, 'A aba Resumo está oculta até a implementação do RF10');

    const ajustesTabItem = tabItems.find((t) => t.tab === 'ajustes');
    assert(ajustesTabItem && !ajustesTabItem.hidden, 'A quarta aba "Ajustes" está visível');

    console.log('\n--- Teste 2: Abertura da aba "Ajustes" e estado padrão ---');
    await (await page.waitForSelector('[data-tab="ajustes"]')).click();
    await page.waitForSelector('.settings-screen');

    const settingsTitle = await page.$eval('.ios-large-title', (el) => el.textContent.trim());
    assertEqual(settingsTitle, 'Ajustes', 'Título da tela é "Ajustes"');

    const segments = await page.$$eval('.ios-segment-btn', (els) =>
      els.map((el) => ({
        value: el.dataset.themeVal,
        label: el.textContent.trim(),
        isActive: el.classList.contains('active'),
      }))
    );

    assertEqual(segments.length, 3, 'Segmented control possui 3 opções');
    assertEqual(segments[0].label, 'Automático', '1ª opção: Automático');
    assertEqual(segments[1].label, 'Claro', '2ª opção: Claro');
    assertEqual(segments[2].label, 'Escuro', '3ª opção: Escuro');
    assert(segments[0].isActive, 'Opção padrão selecionada é "Automático"');

    const initialThemeAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assertEqual(initialThemeAttr, null, '<html> não possui data-theme forçado no modo Automático');

    console.log('\n--- Teste 3: Seleção do tema "Escuro" e aplicação das variáveis CSS ---');
    await page.click('[data-theme-val="dark"]');

    const isDarkActive = await page.$eval('[data-theme-val="dark"]', (el) => el.classList.contains('active'));
    assert(isDarkActive, 'Segmento "Escuro" está ativo');

    const darkAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assertEqual(darkAttr, 'dark', '<html> recebeu data-theme="dark"');

    const storedThemeDark = await page.evaluate(() => localStorage.getItem('theme-preference'));
    assertEqual(storedThemeDark, 'dark', 'localStorage salvou theme-preference="dark"');

    const pageBgDark = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim();
    });
    assertEqual(pageBgDark.toLowerCase(), '#000000', 'Variável CSS --page-bg atualizada para preto (#000000)');

    const metaThemeColorDark = await page.$eval('meta[data-scheme="light"]', (el) => el.getAttribute('content'));
    assertEqual(metaThemeColorDark, '#000000', 'Tag meta theme-color atualizada para #000000');

    console.log('\n--- Teste 4: Persistência do tema "Escuro" após recarregar a página ---');
    await page.reload({ waitUntil: 'networkidle0' });

    // Ensure early script applied theme immediately to html
    const earlyDarkAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assertEqual(earlyDarkAttr, 'dark', '<html> possui data-theme="dark" imediatamente após reload (sem flash)');

    // Reopen Ajustes tab and check segmented control state
    await (await page.waitForSelector('[data-tab="ajustes"]')).click();
    await page.waitForSelector('.settings-screen');

    const darkActiveAfterReload = await page.$eval('[data-theme-val="dark"]', (el) => el.classList.contains('active'));
    assert(darkActiveAfterReload, 'Segmento "Escuro" continua selecionado após recarregar');

    console.log('\n--- Teste 5: Seleção do tema "Claro" e persistência ---');
    await page.click('[data-theme-val="light"]');

    const isLightActive = await page.$eval('[data-theme-val="light"]', (el) => el.classList.contains('active'));
    assert(isLightActive, 'Segmento "Claro" está ativo');

    const lightAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assertEqual(lightAttr, 'light', '<html> recebeu data-theme="light"');

    const storedThemeLight = await page.evaluate(() => localStorage.getItem('theme-preference'));
    assertEqual(storedThemeLight, 'light', 'localStorage salvou theme-preference="light"');

    const pageBgLight = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim();
    });
    assertEqual(pageBgLight.toLowerCase(), '#f2f2f7', 'Variável CSS --page-bg atualizada para cinza iOS (#f2f2f7)');

    await page.reload({ waitUntil: 'networkidle0' });
    const earlyLightAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assertEqual(earlyLightAttr, 'light', '<html> possui data-theme="light" persistido após reload');

    console.log('\n--- Teste 6: Retorno para "Automático" ---');
    await (await page.waitForSelector('[data-tab="ajustes"]')).click();
    await page.waitForSelector('.settings-screen');

    await page.click('[data-theme-val="auto"]');

    const isAutoActive = await page.$eval('[data-theme-val="auto"]', (el) => el.classList.contains('active'));
    assert(isAutoActive, 'Segmento "Automático" está ativo');

    const autoAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    assertEqual(autoAttr, null, 'data-theme removido de <html> para seguir o sistema');

    const storedThemeAuto = await page.evaluate(() => localStorage.getItem('theme-preference'));
    assertEqual(storedThemeAuto, 'auto', 'localStorage salvou theme-preference="auto"');

    console.log('\n--- Teste 7: Seção "Sobre" com nome e versão ---');
    const aboutName = await page.$eval('#about-app-name', (el) => el.textContent.trim());
    assertEqual(aboutName, 'Agenda', 'Nome do aplicativo na seção Sobre é "Agenda"');

    const aboutVersion = await page.$eval('#about-app-version', (el) => el.textContent.trim());
    assert(aboutVersion.length > 0, `Versão do aplicativo exibida: ${aboutVersion}`);

    console.log('\n────────────────────────────────────────');
    console.log('Todos os testes da tela de Ajustes e temas passaram com sucesso!');

    if (pageErrors.length > 0) {
      console.warn('Avisos de erros capturados:', pageErrors);
    }
  } catch (err) {
    console.error('Falha nos testes de ajustes/temas:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
