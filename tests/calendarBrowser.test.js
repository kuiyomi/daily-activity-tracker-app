import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const PROJECT_ROOT = process.cwd();
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'tests', 'screenshots');

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

async function waitForGrid(page) {
  await page.waitForFunction(() => document.querySelectorAll('.cal-day[data-date]').length >= 35);
}

async function goToMonth(page, heading) {
  for (let i = 0; i < 24; i++) {
    const title = await page.$eval('#cal-title', (el) => el.textContent.trim());
    if (title === heading) {
      await waitForGrid(page);
      return;
    }
    await page.click('#btn-prev');
    await page.waitForFunction(
      (h) => document.querySelector('#cal-title')?.textContent.trim() !== h,
      {},
      title
    );
  }
  for (let i = 0; i < 48; i++) {
    const title = await page.$eval('#cal-title', (el) => el.textContent.trim());
    if (title === heading) {
      await waitForGrid(page);
      return;
    }
    await page.click('#btn-next');
    await page.waitForFunction(
      (h) => document.querySelector('#cal-title')?.textContent.trim() !== h,
      {},
      title
    );
  }
  throw new Error(`Não chegou no mês ${heading}`);
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
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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

    console.log('\n--- Semeadura: dias com e sem chuva ---');
    await page.evaluate(async () => {
      const { getDB, saveActivity, setDayRained, setCompletion } = await import('./src/storage/storage.js');
      const db = await getDB();
      const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
      tx.objectStore('activities').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('dayEntries').clear();
      await new Promise((r) => {
        tx.oncomplete = r;
      });

      await saveActivity({
        id: 'act_academia',
        name: 'Academia',
        icon: 'barbell',
        color: '#007aff',
        usesMuscleGroups: true,
      });
      await saveActivity({
        id: 'act_extra_1',
        name: 'Extra 1',
        icon: 'target',
        color: '#34c759',
        usesMuscleGroups: false,
      });
      await saveActivity({
        id: 'act_extra_2',
        name: 'Extra 2',
        icon: 'drop',
        color: '#ff9500',
        usesMuscleGroups: false,
      });
      await saveActivity({
        id: 'act_extra_3',
        name: 'Extra 3',
        icon: 'pill',
        color: '#af52de',
        usesMuscleGroups: false,
      });
      await saveActivity({
        id: 'act_extra_4',
        name: 'Extra 4',
        icon: 'book-open',
        color: '#ffcc00',
        usesMuscleGroups: false,
      });

      await setDayRained('2026-10-28', true);
      await setDayRained('2026-10-15', true);
      await setDayRained('2026-10-29', false);
      await setDayRained('2026-08-15', true);

      await setCompletion('2026-10-28', 'act_academia', true, []);
      await setCompletion('2026-10-28', 'act_extra_1', true, []);
      await setCompletion('2026-10-28', 'act_extra_2', true, []);
      await setCompletion('2026-10-28', 'act_extra_3', true, []);
      await setCompletion('2026-10-28', 'act_extra_4', true, []);
    });
    assert(true, 'Banco semeado com dias chuvosos (15 e 28/out, 15/ago) e um dia seco');

    console.log('\n--- Choveu: um único interruptor, sem círculo residual ---');
    await page.click('[data-tab="calendario"]');
    await page.waitForSelector('.calendar-card');
    await waitForGrid(page);
    await goToMonth(page, 'Outubro de 2026');
    await page.waitForSelector('[data-date="2026-10-28"]');
    await page.click('[data-date="2026-10-28"]');
    await page.waitForSelector('.day-detail-screen');
    await page.waitForFunction(() => document.querySelector('#day-rained-switch')?.checked === true);

    const switchInfo = await page.evaluate(() => {
      const row = document.querySelector('.toggle-row');
      const switchEl = row.querySelector('.ios-switch');
      const after = getComputedStyle(switchEl, '::after');
      const sliderAfter = row.querySelector('.ios-switch-slider')
        ? getComputedStyle(row.querySelector('.ios-switch-slider'), '::after')
        : null;
      return {
        rowHtml: row.innerHTML.includes('activity-checkbox-circle'),
        switchTag: switchEl ? switchEl.tagName : null,
        switchCount: row.querySelectorAll('.ios-switch').length,
        sliderCount: row.querySelectorAll('.ios-switch-slider').length,
        checkboxCount: row.querySelectorAll('input[type="checkbox"]').length,
        circleCount: row.querySelectorAll('.activity-checkbox-circle').length,
        checked: switchEl.checked,
        bg: getComputedStyle(switchEl).backgroundColor,
        afterContent: after.content,
        afterWidth: after.width,
        afterTransform: after.transform,
        sliderAfterContent: sliderAfter ? sliderAfter.content : 'none',
      };
    });

    // Cause of the leftover: the Choveu row used <div class="ios-switch"> plus
    // .ios-switch::after from the checkbox variant, so a second thumb stayed
    // on the left after the real slider moved to "on".
    assertEqual(switchInfo.switchTag, 'INPUT', 'Choveu usa <input class="ios-switch">, não o wrapper antigo');
    assertEqual(switchInfo.switchCount, 1, 'A linha tem exatamente um interruptor');
    assertEqual(switchInfo.checkboxCount, 1, 'A linha tem exatamente um checkbox');
    assertEqual(switchInfo.sliderCount, 0, 'Não há .ios-switch-slider residual');
    assertEqual(switchInfo.circleCount, 0, 'Não há círculo de checklist na linha Choveu');
    assertEqual(switchInfo.rowHtml, false, 'HTML da linha não inclui activity-checkbox-circle');
    assertEqual(switchInfo.checked, true, 'Interruptor inicia ligado (dia semeado chuvoso)');
    assert(switchInfo.bg.includes('52, 199, 89') || switchInfo.bg.includes('48, 209, 88'), 'Ligado usa verde iOS');
    assert(switchInfo.afterTransform.includes('20') || switchInfo.afterTransform.includes('matrix'), 'Polegar do interruptor ligado está deslocado');

    const rowHandle = await page.$('.toggle-row');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await rowHandle.screenshot({ path: path.join(SCREENSHOT_DIR, 'choveu-on-light.png') });

    await page.click('#day-rained-switch');
    const offLight = await page.evaluate(() => {
      const el = document.querySelector('#day-rained-switch');
      const after = getComputedStyle(el, '::after');
      return {
        checked: el.checked,
        bg: getComputedStyle(el).backgroundColor,
        sliderCount: document.querySelectorAll('.toggle-row .ios-switch-slider').length,
        circleCount: document.querySelectorAll('.toggle-row .activity-checkbox-circle').length,
        afterTransform: after.transform,
      };
    });
    assertEqual(offLight.checked, false, 'Interruptor desligado após o toque');
    assertEqual(offLight.sliderCount, 0, 'Desligado: ainda sem slider residual');
    assertEqual(offLight.circleCount, 0, 'Desligado: ainda sem círculo de checklist');
    await rowHandle.screenshot({ path: path.join(SCREENSHOT_DIR, 'choveu-off-light.png') });

    await page.click('#day-rained-switch');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const onDark = await page.evaluate(() => {
      const el = document.querySelector('#day-rained-switch');
      return { checked: el.checked, bg: getComputedStyle(el).backgroundColor };
    });
    assertEqual(onDark.checked, true, 'Interruptor ligado no tema escuro');
    await rowHandle.screenshot({ path: path.join(SCREENSHOT_DIR, 'choveu-on-dark.png') });

    await page.click('#day-rained-switch');
    const offDark = await page.evaluate(() => document.querySelector('#day-rained-switch').checked);
    assertEqual(offDark, false, 'Interruptor desligado no tema escuro');
    await rowHandle.screenshot({ path: path.join(SCREENSHOT_DIR, 'choveu-off-dark.png') });
    console.log(`  📷 Screenshots em ${SCREENSHOT_DIR}`);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.click('#day-rained-switch'); // back on so calendar should show rain
    await new Promise((r) => setTimeout(r, 200));

    console.log('\n--- Calendário: ícone de chuva só nos dias chuvosos, sem reload ---');
    await page.click('#btn-back');
    await page.waitForSelector('.calendar-card');
    await waitForGrid(page);
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[data-date="2026-10-28"] .cal-day-rain[aria-label="Choveu"]'))
    );

    const octoberRain = await page.evaluate(() => {
      const icons = Array.from(document.querySelectorAll('.cal-day-rain[aria-label="Choveu"]'));
      return {
        dates: icons.map((el) => el.closest('.cal-day').dataset.date).sort(),
        iconCount: icons.length,
        svgCount: icons.filter((el) => el.querySelector('svg')).length,
        emptySlots: document.querySelectorAll('.cal-day-rain[aria-hidden="true"]').length,
        dayCount: document.querySelectorAll('.cal-day').length,
      };
    });
    assertEqual(octoberRain.dates.join(','), '2026-10-15,2026-10-28', 'Ícone Choveu só em 15 e 28 de outubro');
    assertEqual(octoberRain.iconCount, octoberRain.svgCount, 'Cada indicador de chuva renderiza o SVG cloud-rain');
    assertEqual(octoberRain.emptySlots, octoberRain.dayCount - 2, 'Demais células reservam o canto sem ícone');

    const rainColor = await page.$eval('.cal-day-rain[aria-label="Choveu"]', (el) =>
      getComputedStyle(el).color
    );
    assertEqual(rainColor, 'rgb(50, 173, 230)', 'Ícone de chuva usa ciano iOS no tema claro (#32ADE6)');

    await page.click('[data-date="2026-10-29"]');
    await page.waitForSelector('.day-detail-screen');
    await page.waitForSelector('.activity-check-row, .empty-state-text');
    const wasOff = await page.$eval('#day-rained-switch', (el) => el.checked);
    assertEqual(wasOff, false, '29/out começa sem chuva');
    await page.click('#day-rained-switch');
    await new Promise((r) => setTimeout(r, 200));
    await page.click('#btn-back');
    await page.waitForSelector('.calendar-card');
    await waitForGrid(page);
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[data-date="2026-10-29"] .cal-day-rain[aria-label="Choveu"]'))
    );

    const afterToggle = await page.evaluate(() => ({
      has29: Boolean(document.querySelector('[data-date="2026-10-29"] .cal-day-rain[aria-label="Choveu"]')),
      has28: Boolean(document.querySelector('[data-date="2026-10-28"] .cal-day-rain[aria-label="Choveu"]')),
      has16: Boolean(document.querySelector('[data-date="2026-10-16"] .cal-day-rain[aria-label="Choveu"]')),
    }));
    assert(afterToggle.has29, 'Ícone aparece em 29/out ao voltar, sem recarregar a página');
    assert(afterToggle.has28, 'Ícone de 28/out permanece');
    assert(!afterToggle.has16, '16/out continua sem ícone de chuva');

    const overflow = await page.$eval('[data-date="2026-10-28"] .cal-dots-more', (el) => el.textContent);
    assertEqual(overflow, '+', 'Marcador + de overflow das bolinhas permanece');

    const todayCircle = await page.evaluate(() => {
      const today = document.querySelector('.cal-day--today');
      if (!today) return { present: false };
      const num = today.querySelector('.cal-day-num');
      return {
        present: true,
        cellBg: getComputedStyle(today).backgroundColor,
        numBg: getComputedStyle(num).backgroundColor,
        numRadius: getComputedStyle(num).borderRadius,
      };
    });
    if (todayCircle.present) {
      assert(
        todayCircle.numBg.includes('0, 122, 255') || todayCircle.numBg.includes('10, 132, 255'),
        'Círculo de hoje está no número do dia'
      );
      assert(
        todayCircle.cellBg === 'rgba(0, 0, 0, 0)' || todayCircle.cellBg === 'transparent',
        'A célula inteira não é o círculo de hoje'
      );
      assertEqual(todayCircle.numRadius, '50%', 'Número de hoje usa círculo (border-radius 50%)');
    }

    console.log('\n--- Células mais altas e mês de 6 linhas sem scroll horizontal ---');
    const octoberLayout = await page.evaluate(() => {
      const days = Array.from(document.querySelectorAll('.cal-day'));
      const heights = days.map((el) => el.getBoundingClientRect().height);
      const widths = days.map((el) => el.getBoundingClientRect().width);
      const grid = document.querySelector('.cal-grid');
      return {
        minH: Math.min(...heights),
        maxH: Math.max(...heights),
        minW: Math.min(...widths),
        dayCount: days.length,
        sixWeeks: grid.classList.contains('cal-grid--six-weeks'),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        gridScroll: grid.scrollWidth,
        gridClient: grid.clientWidth,
      };
    });
    assert(octoberLayout.minH >= 51.5, `Altura mínima das células ≥ 52px (got ${octoberLayout.minH})`);
    assert(octoberLayout.maxH <= 68.5, `Altura máxima das células ≤ 68px (got ${octoberLayout.maxH})`);
    assert(octoberLayout.minW >= 44, 'Alvo de toque tem pelo menos 44px de largura');
    assertEqual(octoberLayout.scrollWidth <= octoberLayout.clientWidth + 1, true, 'Outubro não gera scroll horizontal');

    await goToMonth(page, 'Agosto de 2026');
    await waitForGrid(page);
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[data-date="2026-08-15"] .cal-day-rain[aria-label="Choveu"]'))
    );
    const augustLayout = await page.evaluate(() => {
      const grid = document.querySelector('.cal-grid');
      const days = Array.from(document.querySelectorAll('.cal-day'));
      const heights = days.map((el) => el.getBoundingClientRect().height);
      const rainy = Array.from(document.querySelectorAll('.cal-day-rain[aria-label="Choveu"]')).map(
        (el) => el.closest('.cal-day').dataset.date
      );
      return {
        dayCount: days.length,
        sixWeeks: grid.classList.contains('cal-grid--six-weeks'),
        minH: Math.min(...heights),
        maxH: Math.max(...heights),
        rainy,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        gridOverflow: grid.scrollWidth - grid.clientWidth,
      };
    });
    assertEqual(augustLayout.dayCount, 42, 'Agosto de 2026 tem 6 semanas (42 células)');
    assert(augustLayout.sixWeeks, 'Grade marca cal-grid--six-weeks');
    assert(augustLayout.minH >= 51.5, `6 linhas: altura mínima ≥ 52px (got ${augustLayout.minH})`);
    assert(augustLayout.maxH <= 68.5, `6 linhas: altura máxima ≤ 68px (got ${augustLayout.maxH})`);
    assertEqual(augustLayout.rainy.join(','), '2026-08-15', 'Em agosto o ícone aparece só no dia 15');
    assertEqual(augustLayout.scrollWidth <= augustLayout.clientWidth + 1, true, 'Mês de 6 linhas não gera scroll horizontal');
    assert(augustLayout.gridOverflow <= 1, 'A grade não transborda horizontalmente');

    if (pageErrors.length > 0) {
      console.warn('Avisos de erros capturados:', pageErrors);
    }

    console.log('\n────────────────────────────────────────');
    console.log('Testes de calendário (Choveu, ícone de chuva, células) passaram.');
  } catch (err) {
    console.error('Falha nos testes de calendário:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
