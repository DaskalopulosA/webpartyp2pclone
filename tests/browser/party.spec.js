import { test, expect } from '@playwright/test';

async function join(page, code, name) {
  await page.goto(`/#room=${code}`);
  await page.locator('#name').fill(name);
  await page.getByRole('button', { name: 'Join', exact: false }).click();
  await expect(page.locator('#room-view')).toBeVisible();
}

test('public discovery, independent tabs, late join, isolation, direct data and leave', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const errors = [];
  // Observe native connections; neither signaling nor WebRTC is mocked.
  await context.addInitScript(() => {
    window.__testRTC = []; window.__testSockets = [];
    const OriginalRTC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends OriginalRTC {
      constructor(...args) { super(...args); window.__testRTC.push(this); }
    };
    const OriginalSocket = window.WebSocket;
    window.WebSocket = class extends OriginalSocket {
      constructor(...args) { super(...args); window.__testSockets.push(this); }
    };
  });
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  const alice = await context.newPage(), bob = await context.newPage(), outsider = await context.newPage();
  try {
    await alice.goto('/');
    await alice.locator('#name').fill('Alice');
    await alice.locator('#create').click();
    await expect(alice.locator('#room-view')).toBeVisible();
    const code = await alice.locator('#room-code').textContent();
    await alice.locator('#tap').click({ clickCount: 3 });
    await join(bob, code, 'Bob');
    await expect(alice.locator('#player-count')).toHaveText('2');
    await expect(bob.locator('#player-count')).toHaveText('2');
    await expect(bob.locator('#total')).toHaveText('3');
    expect(await alice.locator('.is-you').getAttribute('data-peer-id')).not.toEqual(await bob.locator('.is-you').getAttribute('data-peer-id'));
    await Promise.all([alice.locator('#tap').click({ clickCount: 7 }), bob.locator('#tap').click({ clickCount: 5 })]);
    await expect(alice.locator('#total')).toHaveText('15');
    await expect(bob.locator('#total')).toHaveText('15');
    console.log('PASS: public discovery, distinct player IDs, late state and simultaneous clicks.');

    await outsider.goto('/'); await outsider.locator('#create').click();
    await expect(outsider.locator('#room-view')).toBeVisible();
    expect(await outsider.locator('#room-code').textContent()).not.toEqual(code);
    await outsider.locator('#tap').click();
    await expect(outsider.locator('#player-count')).toHaveText('1');
    await expect(outsider.locator('#total')).toHaveText('1');
    await expect(alice.locator('#total')).toHaveText('15');

    const proof = await alice.evaluate(async () => Promise.all(window.__testRTC.filter(pc => pc.connectionState === 'connected').map(async pc => {
      const stats = [...(await pc.getStats()).values()];
      const transport = stats.find(s => s.type === 'transport' && s.selectedCandidatePairId);
      const pair = stats.find(s => s.id === transport?.selectedCandidatePairId);
      return { state: pc.connectionState,
        channels: stats.filter(s => s.type === 'data-channel').map(s => ({ state: s.state, sent: s.messagesSent, received: s.messagesReceived })),
        local: stats.find(s => s.id === pair?.localCandidateId)?.candidateType,
        remote: stats.find(s => s.id === pair?.remoteCandidateId)?.candidateType,
        iceServers: pc.getConfiguration().iceServers };
    })));
    expect(proof.length).toBeGreaterThan(0);
    expect(proof[0].local).toBeTruthy();
    expect(proof[0].local).not.toBe('relay'); expect(proof[0].remote).not.toBe('relay');
    expect(proof[0].channels.some(c => c.sent > 0 && c.received > 0)).toBe(true);
    await testInfo.attach('webrtc-proof', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
    console.log('Native WebRTC proof:', JSON.stringify(proof));

    for (const page of [alice, bob]) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['wss://*'] });
      await page.evaluate(() => window.__testSockets.forEach(socket => socket.close()));
    }
    await alice.locator('#tap').click(); await expect(bob.locator('#total')).toHaveText('16');
    await bob.locator('#tap').click(); await expect(alice.locator('#total')).toHaveText('17');
    console.log('PASS: state sync continues after signaling sockets close; no TURN candidates.');
    await alice.locator('#diagnostics').evaluate(el => el.open = true);
    await alice.screenshot({ path: testInfo.outputPath('connected-party.png'), fullPage: true });
    await bob.locator('#leave').click(); await expect(bob.locator('#lobby')).toBeVisible();
    await expect(alice.locator('#player-count')).toHaveText('1');
    await expect(alice.locator('#total')).toHaveText('11');
    expect(errors).toEqual([]);
  } finally {
    for (const [name, page] of [['alice', alice], ['bob', bob]]) {
      if (!page.isClosed()) await testInfo.attach(`${name}-logs`, { body: await page.locator('#logs').textContent().catch(() => ''), contentType: 'text/plain' });
    }
    await context.close();
  }
});

test('mobile layout, invalid invite and keyboard button input', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#room=bad');
  await expect(page.locator('#notice')).toContainText('invalid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#create').click();
  await expect(page.locator('#room-view')).toBeVisible();
  await page.locator('#tap').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#total')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
