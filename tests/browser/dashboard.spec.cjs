const { test, expect } = require('@playwright/test');
const Monitor = require('../../monitor');

test('device status updates independently of movement and shows unknown on failed reads', async ({ page }) => {
  let status = 'ativo';
  await page.route('**/api/dashboard?*', route => {
    const normalized = Monitor.normalizeEvents([{ id: 1, numero_evento: 9, data_hora: Monitor.deviceDate(Date.now()) }]);
    return route.fulfill({ json: { mode: 'live', ...normalized, device: status === null ? null : Monitor.normalizeDeviceStatus({ id: 1, status, data_hora: new Date().toISOString() }), deviceUnavailable: status === null } });
  });
  await page.goto('/');
  await expect(page.locator('#environment-footer')).toHaveText('ESP32 ativo');
  await expect(page.locator('#device-updated')).toContainText('Último status informado:');
  await expect(page.locator('#radar')).toHaveClass(/is-motion/);
  status = 'inativo';
  await page.locator('#refresh-button').click();
  await expect(page.locator('#environment-footer')).toHaveText('ESP32 inativo');
  await expect(page.locator('#detection-count')).toHaveText('1');
  status = null;
  await page.locator('#refresh-button').click();
  await expect(page.locator('#environment-footer')).toHaveText('Status do ESP32 indisponível');
  await expect(page.locator('#recent-events')).toContainText('Movimento detectado');
});

test('inactivity appears in chart, latest reading, history and filtered CSV', async ({ page }) => {
  await page.route('**/api/dashboard?*', route => {
    const events = Monitor.combineReadings(
      Monitor.normalizeEvents([{ id: 1, numero_evento: 9, data_hora: Monitor.deviceDate(Date.now() - 60000) }]).events,
      Monitor.normalizeActivity([{ id: 1, data_hora: new Date().toISOString() }])
    );
    return route.fulfill({ json: { mode: 'live', events, latest: events[0], limited: true } });
  });
  await page.goto('/');
  await expect(page.locator('#environment-title')).toHaveText('Sem movimento');
  await expect(page.locator('#detection-count')).toHaveText('1');
  await expect(page.locator('#inactive-count')).toHaveText('1 sem movimento');
  await expect(page.locator('.chart-bar-inactive')).toHaveCount(1);
  await expect(page.locator('#recent-events')).toContainText('Leitura #1');
  await expect(page.locator('#data-limit')).toBeVisible();
  await page.locator('.recent-panel [data-open]').click();
  await page.locator('#history-filter').selectOption('inactive');
  await expect(page.locator('#history-events tr')).toHaveCount(1);
  await expect(page.locator('#history-events')).toContainText('Sem movimento');
  const pending = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('atividade_sensor');
  expect(csv).not.toContain('Movimento detectado');
  await page.locator('#history-filter').selectOption('motion');
  await expect(page.locator('#history-events')).toContainText('Movimento detectado');
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/dashboard?*', route => {
    const events = Monitor.demoReadings();
    return route.fulfill({ json: { mode: 'demo', events, latest: events[0] } });
  });
});

test('visitor has no connection controls or removed cards; server states still update', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let mode = 'live';
  await page.route('**/api/dashboard?*', route => {
    if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    const events = mode === 'empty' ? [] : [{ id: 1, numero_evento: 27, data_hora: Monitor.deviceDate(Date.now()) }];
    const normalized = Monitor.normalizeEvents(events);
    return route.fulfill({ json: { mode: 'live', ...normalized, limited: false } });
  });
  await page.goto('/');
  await expect(page.locator('#header-status')).toHaveText('Dados atualizados');
  await expect(page.locator('#environment-title')).toHaveText('Evento #27');
  await expect(page.locator('.stat-card, .stat-grid, #settings-dialog, [data-open="settings-dialog"], #connection-form, script[src="config.js"]')).toHaveCount(0);
  await expect(page.locator('#demo-toolbar')).toBeHidden();
  await expect(page.locator('button').filter({ hasText: /supabase|conectar/i })).toHaveCount(0);
  expect(await page.locator('#header-status').evaluate(el => el.closest('button'))).toBeNull();
  for (const [nextMode, expected] of [['empty', 'AGUARDANDO'], ['live', 'REGISTRADO']]) {
    mode = nextMode;
    await page.locator('#refresh-button').click();
    await expect(page.locator('#environment-badge')).toHaveText(expected);
    if (nextMode === 'empty') await expect(page.locator('#recent-pagination')).toBeHidden();
  }
  mode = 'error';
  await page.locator('#refresh-button').click();
  await expect(page.locator('#connection-error')).toBeVisible();
  await expect(page.locator('#header-status')).toHaveText('Dados indisponíveis');
  expect(errors).toEqual([]);
});

test('demo supports movement, history filters, period selection, and CSV download', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#header-status')).toHaveText('Modo demonstração');
  await expect(page.locator('#environment-badge')).toHaveText('REGISTRADO');
  await expect(page.locator('#activity-chart [data-axis-end="now"]')).toHaveCount(1);
  await page.locator('#chart-period').selectOption('168');
  await expect(page.locator('#recent-events tr')).toHaveCount(5);
  await expect(page.locator('#recent-pagination')).toBeVisible();
  await expect(page.locator('#recent-count')).toContainText('de 126 registros');
  await page.locator('#recent-next').click();
  await expect(page.locator('#recent-page-label')).toHaveText('2 de 26');
  await expect(page.locator('#recent-events')).toContainText('Evento 121');
  await page.locator('#recent-previous').click();
  await expect(page.locator('#recent-page-label')).toHaveText('1 de 26');
  await page.locator('#simulate-motion').click();
  await expect(page.locator('#environment-title')).toHaveText('Evento #127');
  await expect(page.locator('#activity-chart rect')).toHaveCount(7);
  await page.locator('.recent-panel [data-open]').click();
  await expect(page.locator('#history-dialog')).toBeVisible();
  await page.locator('#history-filter').selectOption('dated');
  await expect(page.locator('#history-events tr')).toHaveCount(8);
  await page.locator('#next-page').click();
  await expect(page.locator('#page-label')).toContainText('2 de');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-button').click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/esp32-demonstracao/);
  await page.locator('#history-date').fill('2020-01-01');
  await expect(page.locator('#history-events')).toContainText('Nenhum registro');
  await expect(page.locator('#export-button')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#history-dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile and desktop fit viewport with loaded fonts and image', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const overflowing = await page.evaluate(() => [...document.querySelectorAll('header a, header button, main section, .stat-card, .panel')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).map(el => el.className));
    expect(overflowing, `overflow at ${width}px`).toEqual([]);
    const cardSpace = await page.evaluate(() => document.querySelector('.environment-panel').getBoundingClientRect().bottom - document.querySelector('.environment-footer').getBoundingClientRect().bottom);
    expect(cardSpace, `unused space below detection footer at ${width}px`).toBeLessThanOrEqual(2);
    if (width === 1440) {
      const cardBottoms = await page.locator('.dashboard-grid > .panel').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().bottom));
      expect(Math.max(...cardBottoms) - Math.min(...cardBottoms), 'desktop card bottoms').toBeLessThanOrEqual(2);
      const chartFill = await page.locator('#chart-area').evaluate(area => area.querySelector('svg').getBoundingClientRect().height / area.getBoundingClientRect().height);
      expect(chartFill, 'chart fills its card').toBeGreaterThan(.95);
    }
    if (width <= 390) {
      const headerHeight = await page.locator('.header').evaluate(el => el.getBoundingClientRect().height);
      expect(headerHeight, `header height at ${width}px`).toBeLessThanOrEqual(150);
    }
  }
  await expect(page.locator('#dashboard')).toBeVisible();
});
