import { test, expect } from '@playwright/test';

test('table hockey: pointer and keyboard controls, goals, late spectators and disconnects over WebRTC', async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, hasTouch: true });
  const errors = []; context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  const a = await context.newPage(), b = await context.newPage(), c = await context.newPage();
  const choose = page => page.locator('[data-game="hockey"]').click();
  const paddle = (page, side) => page.locator(`#hockey-${side}-paddle`);
  const position = (page, side) => paddle(page, side).evaluate(node => {
    const matrix = node.transform.baseVal.consolidate().matrix;
    return { x: matrix.e, y: matrix.f };
  });
  async function point(page, x, y) {
    const rink = page.locator('#hockey-rink'); await rink.scrollIntoViewIfNeeded();
    const box = await rink.boundingBox(); await page.mouse.move(box.x + box.width * x / 1000, box.y + box.height * y / 600);
  }
  async function join(page, code, name) {
    await page.goto('./#room=' + code); await page.locator('#name').fill(name); await page.locator('#join-form button').click();
    await expect(page.locator('#room-view')).toBeVisible(); await choose(page);
  }
  try {
    await a.goto('./'); await a.locator('#name').fill('Alice'); await a.locator('#create').click();
    await expect(a.locator('#room-view')).toBeVisible(); const code = await a.locator('#room-code').textContent();
    await choose(a); await expect(a.locator('#start-hockey')).toBeDisabled();
    await join(b, code, 'Bob'); await expect(a.locator('#player-count')).toHaveText('2');
    const bobId = await b.locator('.is-you').getAttribute('data-peer-id');
    await a.locator('#hockey-peer').selectOption(bobId); await a.locator('#start-hockey').click();
    await expect(b.locator('#hockey-status')).toContainText('right (coral)');
    await expect(a.locator('#hockey-status')).toContainText('left (blue)');
    await expect(paddle(a, 'right')).toHaveAttribute('data-peer-id', bobId);
    await b.locator('#hockey-rink').focus(); await b.keyboard.down('ArrowUp');
    await expect.poll(async () => (await position(a, 'right')).y).toBeLessThan(100); await b.keyboard.up('ArrowUp');
    await point(a, 250, 420);
    await expect.poll(async () => Math.abs((await position(b, 'left')).y - 420)).toBeLessThan(5);
    await expect.poll(async () => Math.abs((await position(b, 'left')).x - 250)).toBeLessThan(5);
    console.log('PASS: remote keyboard and mouse input move the correct paddles.');

    // A new round has a reproducible opening. Park paddles out of its path and
    // observe a real goal; no application state or network message is injected.
    await a.locator('#start-hockey').click();
    await point(a, 160, 32); await point(b, 840, 32);
    await expect.poll(async () => Number(await b.locator('#hockey-puck').getAttribute('cx'))).not.toBe(500);
    await expect.poll(async () => Number(await a.locator('#hockey-left-score').textContent()) + Number(await a.locator('#hockey-right-score').textContent()), { timeout: 45_000 }).toBeGreaterThan(0);
    const leftScore = await a.locator('#hockey-left-score').textContent(), rightScore = await a.locator('#hockey-right-score').textContent();
    await expect(b.locator('#hockey-left-score')).toHaveText(leftScore); await expect(b.locator('#hockey-right-score')).toHaveText(rightScore);
    await join(c, code, 'Charlie'); await expect(a.locator('#player-count')).toHaveText('3');
    await expect(c.locator('#hockey-status')).toContainText('watching');
    await expect.poll(async () => Number(await c.locator('#hockey-left-score').textContent()) + Number(await c.locator('#hockey-right-score').textContent())).toBeGreaterThan(0);
    await c.locator('#hockey-rink').focus(); await c.keyboard.down('ArrowDown');
    // A spectator has no seat and cannot move either parked paddle.
    await expect.poll(async () => (await position(c, 'left')).y).toBeLessThan(40);
    await expect.poll(async () => (await position(c, 'right')).y).toBeLessThan(40);
    await c.keyboard.up('ArrowDown');
    await a.locator('#panel-hockey').screenshot({ path: info.outputPath('table-hockey.png') });
    console.log('PASS: real puck movement and goal scores are shared with both players and a late spectator.');

    await b.setViewportSize({ width: 390, height: 844 });
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await b.locator('#hockey-rink').scrollIntoViewIfNeeded();
    const box = await b.locator('#hockey-rink').boundingBox();
    const touch = await context.newCDPSession(b);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .8, y: box.y + box.height * .75 }] });
    await expect.poll(async () => (await position(a, 'right')).y).toBeGreaterThan(400);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .2, y: box.y + box.height * .5 }] });
    await expect.poll(async () => (await position(a, 'right')).x).toBe(532);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
    await b.locator('#panel-hockey').screenshot({ path: info.outputPath('table-hockey-mobile.png') });
    await b.locator('#leave').click(); await expect(a.locator('#hockey-status')).toContainText('Alice wins! Opponent disconnected.');
    await expect(c.locator('#hockey-status')).toContainText('Alice wins!');
    const charlieId = await c.locator('.is-you').getAttribute('data-peer-id');
    await a.locator('#hockey-peer').selectOption(charlieId); await a.locator('#start-hockey').click();
    await expect(c.locator('#hockey-left-score')).toHaveText('0'); await expect(c.locator('#hockey-right-score')).toHaveText('0');
    await expect(c.locator('#hockey-status')).toContainText('right (coral)');
    await a.locator('#leave').click(); await expect(c.locator('#hockey-status')).toContainText('host left');
    expect(errors).toEqual([]);
    console.log('PASS: touch movement, half-rink boundary, mobile layout, forfeit, restart and host departure.');
  } finally {
    for (const [name, page] of [['alice', a], ['bob', b], ['charlie', c]]) await info.attach(name + '-logs', { body: await page.locator('#logs').textContent().catch(() => ''), contentType: 'text/plain' });
    await context.close();
  }
});
