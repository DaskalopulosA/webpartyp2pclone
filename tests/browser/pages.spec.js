import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('static GitHub Pages subpath, share links, refresh identity and layout', async ({ page }, testInfo) => {
  // A test-only plain static host: no SPA fallback or game/signaling endpoint.
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (!pathname.startsWith('/repository/')) { res.writeHead(404).end(); return; }
      const relative = pathname.slice('/repository/'.length) || 'index.html';
      const file = path.resolve(dist, relative);
      if (!file.startsWith(path.resolve(dist) + path.sep)) { res.writeHead(404).end(); return; }
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)];
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  // Browsers can keep speculative TCP connections open without an HTTP request.
  // Track and close those too, so teardown never waits for the browser fixture.
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}/repository/`;
  const errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', res => { if (res.url().startsWith(base) && res.status() >= 400) failures.push(res.url()); });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base);
    await expect(page.locator('#lobby')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('landing-desktop.png'), fullPage: true });
    await page.locator('#create').click();
    await expect(page.locator('#room-view')).toBeVisible();
    const invite = page.url();
    expect(invite).toMatch(/\/repository\/#room=[A-Z2-9]{8}$/);
    const firstId = await page.locator('.is-you').getAttribute('data-peer-id');
    await page.locator('#tap').click();
    await page.reload();
    await expect(page.locator('#room-input')).toHaveValue(new URLSearchParams(new URL(invite).hash.slice(1)).get('room'));
    await page.getByRole('button', { name: 'Join', exact: false }).click();
    await expect(page.locator('#room-view')).toBeVisible();
    expect(await page.locator('.is-you').getAttribute('data-peer-id')).not.toEqual(firstId);
    await expect(page.locator('#total')).toHaveText('0');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('room-mobile.png'), fullPage: true });
    expect(failures).toEqual([]); expect(errors).toEqual([]);
  } finally {
    sockets.forEach(socket => socket.destroy());
    await new Promise(resolve => server.close(resolve));
  }
});
