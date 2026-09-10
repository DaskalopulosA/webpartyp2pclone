import { test, expect } from '@playwright/test';

test('eight-game arcade across three real peers, private delivery and competitive rounds', async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL });
  const errors = []; context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  const a = await context.newPage(), b = await context.newPage(), c = await context.newPage();
  const choose = async (page, game) => { await page.locator(`[data-game="${game}"]`).click(); await expect(page.locator('#panel-' + game)).toBeVisible(); };
  async function join(page, code, name) {
    await page.goto('./#room=' + code); await page.locator('#name').fill(name); await page.locator('#join-form button').click();
    await expect(page.locator('#room-view')).toBeVisible();
  }
  try {
    await a.goto('./'); await a.locator('#name').fill('Alice'); await a.locator('#create').click();
    await expect(a.locator('#room-view')).toBeVisible(); const code = await a.locator('#room-code').textContent();
    await join(b, code, 'Bob');
    await expect(a.locator('#player-count')).toHaveText('2');
    await expect(b.locator('#players')).toContainText('Alice');
    const bobId = await b.locator('.is-you').getAttribute('data-peer-id');
    await expect(a.locator('.game-choice')).toHaveCount(8);
    await choose(a, 'pixels'); await choose(b, 'pixels');
    await a.locator('.pixel[data-cell="0"]').click();
    await expect(b.locator('.pixel[data-cell="0"]')).toHaveAttribute('data-color', '1');
    await b.locator('.swatch[data-color="4"]').click(); await b.locator('.pixel[data-cell="1"]').click();
    await expect(a.locator('.pixel[data-cell="1"]')).toHaveAttribute('data-color', '4');
    await join(c, code, 'Charlie'); await expect(a.locator('#player-count')).toHaveText('3');
    await expect(c.locator('#players')).toContainText('Bob'); await choose(c, 'pixels');
    await expect(c.locator('.pixel[data-cell="0"]')).toHaveAttribute('data-color', '1');
    await expect(c.locator('.pixel[data-cell="1"]')).toHaveAttribute('data-color', '4');
    console.log('PASS: shared drawing and late-join canvas restoration.');

    for (const page of [a, b, c]) await choose(page, 'secrets');
    await a.locator('#secret-peer').selectOption(bobId); await a.locator('#secret-symbol').selectOption('2'); await a.locator('#send-secret').click();
    await expect(b.locator('.secret-card')).toHaveCount(1); await expect(c.locator('.secret-card')).toHaveCount(0);
    await b.getByRole('button', { name: '✦ Star', exact: true }).click();
    await expect(a.locator('#secret-messages')).toContainText('They cracked it!');
    await expect(c.locator('#secret-messages')).not.toContainText('Alice');
    console.log('PASS: a third peer does not receive private clues or answers.');

    await choose(a, 'cursors'); await choose(b, 'cursors');
    await a.locator('#cursor-target').click();
    await expect(a.locator('#cursor-score')).toContainText('1 dots');
    await expect(b.locator('#cursor-markers')).toContainText('Alice');
    await choose(a, 'echo'); await a.locator('#echo-peer').selectOption(bobId); await a.locator('#send-echo').click();
    await expect(a.locator('#echo-result')).toContainText('ms');

    for (const page of [a, b, c]) await choose(page, 'tiles');
    await a.locator('#tiles-peer').selectOption(bobId); await a.locator('#start-tiles').click();
    await expect(b.locator('#tiles-status')).toContainText('Alice');
    await expect(c.locator('#tiles-status')).toContainText('watching');
    await expect(b.locator('.tile[data-cell="0"]')).toBeDisabled();
    for (const [page, cell] of [[a,0], [b,3], [a,1], [b,4], [a,2]]) await page.locator(`.tile[data-cell="${cell}"]`).click();
    for (const page of [a, b, c]) await expect(page.locator('#tiles-status')).toContainText('Alice wins');
    console.log('PASS: targeted round-trip measurement and turn enforcement with spectators.');

    for (const page of [a, b]) await choose(page, 'arena');
    await a.locator('#start-arena').click(); await expect(b.locator('#arena-status')).toContainText('host: Alice');
    const before = await b.locator('.is-you .player-score').textContent();
    await b.locator('#arena-canvas').focus(); await b.keyboard.down(' ');
    await expect(b.locator('#players')).not.toHaveText('');
    await a.screenshot({ path: info.outputPath('last-light.png'), fullPage: true });
    await b.keyboard.up(' ');
    expect(Number(before)).toBeGreaterThan(0);
    for (const page of [a, b]) await choose(page, 'jump');
    await a.locator('#start-jump').click(); await expect(b.locator('#jump-status')).toContainText('host: Alice');
    await expect.poll(async () => Number(await b.locator('.is-you .player-score').textContent())).toBeGreaterThan(20);
    await b.locator('#jump-canvas').focus(); await b.keyboard.down('ArrowLeft');
    await a.screenshot({ path: info.outputPath('sky-sprint.png'), fullPage: true }); await b.keyboard.up('ArrowLeft');
    await b.setViewportSize({ width: 390, height: 844 });
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await b.screenshot({ path: info.outputPath('arcade-mobile.png'), fullPage: true });
    await a.locator('#leave').click(); await expect(a.locator('#lobby')).toBeVisible();
    await expect(b.locator('#jump-status')).toContainText('host left');
    await b.locator('#start-jump').click(); await choose(c, 'jump');
    await expect(c.locator('#jump-status')).toContainText('host: Bob');
    expect(errors).toEqual([]);
    console.log('PASS: host-simulated arena and platform race, mobile layout, host loss and round restart.');
  } finally {
    for (const [name, page] of [['alice', a], ['bob', b], ['charlie', c]]) await info.attach(name + '-logs', { body: await page.locator('#logs').textContent().catch(() => ''), contentType: 'text/plain' });
    await context.close();
  }
});
