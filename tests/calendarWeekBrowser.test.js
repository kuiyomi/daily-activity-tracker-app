import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✅ ${message}`);
};

const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

server.listen(0, '127.0.0.1', async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle0' });

    // Seed activities, completions, day entries for the current week
    const seededInfo = await page.evaluate(async () => {
      const { getDB, saveActivity, setCompletion, setDayRained } = await import('./src/storage/storage.js');
      const { getWeekDays, toDateString } = await import('./src/logic/dateUtils.js');

      const db = await getDB();
      const tx = db.transaction(['activities', 'completions', 'dayEntries'], 'readwrite');
      tx.objectStore('activities').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('dayEntries').clear();
      await new Promise((r) => { tx.oncomplete = r; });

      // Activity 1: Musculação with options
      await saveActivity({
        id: 'act_musculacao',
        name: 'Musculação',
        icon: 'barbell',
        color: '#007aff',
        groups: [
          {
            id: 'grp_muscles',
            name: 'Grupos musculares',
            multiple: true,
            archived: false,
            options: [
              { id: 'opt_peito', name: 'Peito', archived: false },
              { id: 'opt_triceps', name: 'Tríceps', archived: false },
            ],
          },
        ],
      });

      // Activity 2: Corrida with no options
      await saveActivity({
        id: 'act_corrida',
        name: 'Corrida',
        icon: 'person-simple-run',
        color: '#34c759',
        groups: [],
      });

      // Seed for current week
      const days = getWeekDays(new Date());
      const day1Str = toDateString(days[1]); // Monday
      const day2Str = toDateString(days[2]); // Tuesday
      const day3Str = toDateString(days[3]); // Wednesday

      // Day 1: Musculação done with Peito & Tríceps, and it rained
      await setCompletion(day1Str, 'act_musculacao', true, ['opt_peito', 'opt_triceps']);
      await setDayRained(day1Str, true);

      // Day 2: Corrida done, no rain
      await setCompletion(day2Str, 'act_corrida', true, []);
      await setDayRained(day2Str, false);

      // Clear any stored calendar view to test default
      localStorage.removeItem('calendar_view_mode');

      return {
        day1Str,
        day2Str,
        day3Str,
      };
    });

    // Reload page to start fresh
    await page.reload({ waitUntil: 'networkidle0' });

    // 1. Verify default view is "Mês"
    await page.waitForSelector('#seg-btn-month.active');
    assert(
      await page.$eval('#seg-btn-month', (el) => el.getAttribute('aria-selected') === 'true'),
      'Segmented control inicia com "Mês" selecionado por padrão'
    );
    assert(
      await page.$eval('#cal-month-view', (el) => el.style.display !== 'none'),
      'Visão mensal visível por padrão'
    );
    assert(
      await page.$eval('#cal-week-view', (el) => el.style.display === 'none'),
      'Visão semanal oculta por padrão'
    );

    // 2. Switch to "Semana"
    await page.click('#seg-btn-week');
    await page.waitForFunction(() => document.querySelector('#cal-week-view').style.display !== 'none');
    await page.waitForFunction(() => document.querySelectorAll('.cal-week-row').length === 7);

    assert(
      await page.$eval('#seg-btn-week', (el) => el.classList.contains('active') && el.getAttribute('aria-selected') === 'true'),
      'Segmented control alterna para "Semana"'
    );

    // 3. Verify week rows: exactly 7 rows, min-height 64px, today highlighted
    const rowsInfo = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.cal-week-row'));
      return rows.map((r) => {
        const rect = r.getBoundingClientRect();
        return {
          date: r.dataset.date,
          height: rect.height,
          isToday: r.classList.contains('cal-week-row--today'),
          hasTodayNum: Boolean(r.querySelector('.cal-week-day-num--today')),
          weekday: r.querySelector('.cal-week-weekday')?.textContent.trim(),
          dayNum: r.querySelector('.cal-week-day-num')?.textContent.trim(),
          badgesCount: r.querySelectorAll('.activity-icon-badge--sm').length,
          optionsText: r.querySelector('.cal-week-options-text')?.textContent.trim() || '',
          hasRain: Boolean(r.querySelector('.cal-week-rain[aria-label="Choveu"]')),
        };
      });
    });

    assert(rowsInfo.length === 7, 'Semana renderiza exatamente 7 linhas (domingo a sábado)');
    assert(
      rowsInfo.every((r) => r.height >= 63.5),
      'Todas as 7 linhas têm altura mínima de 64px'
    );

    const todayRow = rowsInfo.find((r) => r.isToday);
    assert(Boolean(todayRow && todayRow.hasTodayNum), 'Dia de hoje é destacado com o círculo azul');

    // 4. Verify seeded data on Day 1 (Musculação + Peito, Tríceps + Choveu)
    const day1Info = rowsInfo.find((r) => r.date === seededInfo.day1Str);
    assert(day1Info && day1Info.badgesCount === 1, 'Dia 1 tem 1 badge de ícone de atividade (24px)');
    assert(day1Info.optionsText === 'Peito, Tríceps', `Dia 1 exibe texto secundário das opções: "Peito, Tríceps" (obtido: "${day1Info?.optionsText}")`);
    assert(day1Info.hasRain, 'Dia 1 exibe ícone ciano de chuva no canto direito');

    // Verify badge style (24px, same style as day screen)
    const day1Badge = await page.evaluate((dateStr) => {
      const row = document.querySelector(`.cal-week-row[data-date="${dateStr}"]`);
      const badge = row.querySelector('.activity-icon-badge--sm');
      const svg = badge?.querySelector('svg');
      return {
        width: badge?.offsetWidth,
        height: badge?.offsetHeight,
        bgColor: badge?.style.backgroundColor,
        hasSvg: Boolean(svg),
      };
    }, seededInfo.day1Str);
    assert(day1Badge.width === 24 && day1Badge.height === 24, 'Badge de atividade tem tamanho 24px');
    assert(day1Badge.hasSvg, 'Badge de atividade renderiza ícone SVG');

    // 5. Verify Day 2 (Corrida + sem opções + sem chuva)
    const day2Info = rowsInfo.find((r) => r.date === seededInfo.day2Str);
    assert(day2Info && day2Info.badgesCount === 1, 'Dia 2 tem 1 badge de ícone');
    assert(day2Info.optionsText === '', 'Dia 2 não possui opções secundárias');
    assert(!day2Info.hasRain, 'Dia 2 não exibe ícone de chuva');

    // 6. Verify Day 3 (sem registros)
    const day3Info = rowsInfo.find((r) => r.date === seededInfo.day3Str);
    assert(day3Info && day3Info.badgesCount === 0, 'Dia sem registros não exibe badges extras');
    assert(day3Info.optionsText === '', 'Dia sem registros não exibe texto de opções');
    assert(!day3Info.hasRain, 'Dia sem registros não exibe ícone de chuva');

    // 7. Verify week navigation across month boundary
    // Navigate with #btn-prev until we find a week that crosses a month boundary
    let crossedBoundary = false;
    let headingText = '';
    for (let i = 0; i < 10; i++) {
      const prevTitle = await page.$eval('#cal-title', (el) => el.textContent.trim());
      await page.click('#btn-prev');
      await page.waitForFunction((pt) => document.querySelector('#cal-title')?.textContent.trim() !== pt, {}, prevTitle);
      await page.waitForFunction(() => document.querySelectorAll('#cal-week-list .cal-week-row[data-date]').length === 7);
      await page.waitForFunction(() => !document.querySelector('.cal-week-list--leaving'));

      headingText = await page.$eval('#cal-title', (el) => el.textContent.trim());
      const weekDates = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#cal-week-list .cal-week-row')).map((r) => r.dataset.date)
      );
      const months = new Set(weekDates.map((d) => d.slice(0, 7)));
      if (months.size > 1) {
        crossedBoundary = true;
        assert(headingText.includes('–'), `Título da semana contém travessão: "${headingText}"`);
        assert(weekDates.length === 7, 'Semana na fronteira de mês continua com 7 linhas');
        assert(
          months.size === 2,
          `Linhas da semana contêm dias de dois meses diferentes (${Array.from(months).join(', ')})`
        );
        break;
      }
    }
    assert(crossedBoundary, `Navegação de semanas atravessa fronteira de mês corretamente (título: "${headingText}")`);

    // 8. Tapping a row opens that day's screen
    const firstRowDate = await page.$eval('.cal-week-row', (el) => el.dataset.date);
    await page.click('.cal-week-row');
    await page.waitForSelector('.day-detail-screen');
    assert(true, 'Toque em linha da semana abre a tela do dia');

    // Go back to calendar
    await page.click('#btn-back');
    await page.waitForSelector('.calendar-screen');
    await page.waitForSelector('#cal-week-view');

    // 9. Verify choice is persisted in localStorage
    const storedChoice = await page.evaluate(() => localStorage.getItem('calendar_view_mode'));
    assert(storedChoice === 'week', 'Escolha de visualização é salva no localStorage');

    console.log('\nTodos os testes headless da visão semanal passaram com sucesso!');
  } finally {
    await browser?.close();
    server.close();
  }
});
