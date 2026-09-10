import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArcade } from '../src/arcade.js';
import { initialCompetition, stepCompetition, platform } from '../src/games/competition.js';
import { resultOf } from '../src/games/tiles.js';

function party(...ids) {
  const clients = new Map(), queue = [];
  function deliver() {
    while (queue.length) {
      const { from, packet, target } = queue.shift();
      for (const [id, client] of clients) if (id !== from && (!target || target === id)) client.receive(from, structuredClone(packet));
    }
  }
  function add(id) {
    const client = createArcade(id, id, { changed() {}, log() {}, send(packet, target) { queue.push({ from: id, packet: structuredClone(packet), target }); } });
    for (const [peerId, peer] of clients) { peer.join(id); client.join(peerId); }
    clients.set(id, client); deliver(); return client;
  }
  ids.forEach(add);
  return { clients, add, deliver, get: id => clients.get(id) };
}

test('presence and game changes do not reset other games or share private inboxes', () => {
  const p = party('a', 'b', 'c'), a = p.get('a'), b = p.get('b'), c = p.get('c');
  a.click(); a.select('pixels'); p.deliver();
  assert.equal(b.profiles.get('a').game, 'pixels'); assert.equal(b.button.players.get('a').clicks, 1);
  a.secrets.challenge('b', 2); p.deliver();
  assert.equal(b.secrets.inbox.size, 1); assert.equal(c.secrets.inbox.size, 0);
  const id = [...b.secrets.inbox.keys()][0];
  a.secrets.receive('answer', { id, symbol: 2 }, 'c');
  assert.equal(a.secrets.outbox.get(id).result, null);
  b.secrets.guess(id, 2); p.deliver(); assert.equal(a.secrets.outbox.get(id).result, true);
  a.sync('c'); p.deliver(); assert.equal(c.secrets.inbox.size, 0);
});

test('concurrent cell edits converge, clears win old edits and late peers get the canvas', () => {
  const p = party('a', 'b'), a = p.get('a'), b = p.get('b');
  a.pixels.paint(3, 1); b.pixels.paint(3, 4); p.deliver();
  assert.deepEqual(a.pixels.cells, b.pixels.cells); assert.equal(a.pixels.cells[3][0], 4);
  const c = p.add('c'); assert.deepEqual(c.pixels.cells, a.pixels.cells);
  a.pixels.clear(); p.deliver(); assert.equal(c.pixels.cells[3][0], 0);
  c.pixels.receive('paint', { index: 3, cell: [1, 1, 'a'] }, 'a'); assert.equal(c.pixels.cells[3][0], 0);
});

test('cursor updates are ordered and disconnected cursors disappear', () => {
  const p = party('a', 'b'), a = p.get('a'), b = p.get('b');
  a.cursors.move(.2, .7); a.cursors.collect(); p.deliver();
  assert.equal(b.cursors.states.get('a').score, 1);
  b.cursors.receive('motion', { x: 0, y: 0, seq: 0, score: 0 }, 'a');
  assert.equal(b.cursors.states.get('a').x, .2);
  b.leave('a'); assert.equal(b.cursors.states.has('a'), false);
});

test('turn game rejects out-of-turn/spectator moves, detects wins and restores spectators', () => {
  const p = party('a', 'b', 'c'), a = p.get('a'), b = p.get('b'), c = p.get('c');
  a.tiles.start('b'); p.deliver(); b.tiles.move(4); c.tiles.move(0); p.deliver();
  assert.equal(a.tiles.round.moves.length, 0);
  for (const [client, move] of [[a,0], [b,3], [a,1], [b,4], [a,2]]) { client.tiles.move(move); p.deliver(); }
  assert.equal(resultOf(c.tiles.round.moves), 'X');
  b.tiles.move(5); p.deliver(); assert.equal(a.tiles.round.moves.length, 5);
  const d = p.add('d'); assert.deepEqual(d.tiles.round, a.tiles.round);
});

test('competition inputs go to the host; snapshots converge; late joiners spectate; host departure is explicit', () => {
  const p = party('a', 'b'), a = p.get('a'), b = p.get('b');
  a.arena.start(); p.deliver(); const oldX = a.arena.round.players[1].x;
  b.arena.input(1, 0); p.deliver(); a.arena.step(.05); a.arena.step(.05); p.deliver();
  assert.ok(b.arena.round.players[1].x > oldX); assert.deepEqual(a.arena.round, b.arena.round);
  const c = p.add('c'); assert.equal(c.arena.round.players.length, 2);
  b.leave('a'); c.leave('a'); assert.equal(b.arena.interrupted, true);
  b.arena.start(); p.deliver(); assert.equal(c.arena.round.author, 'b');
});

test('arena supplies restore health/ammo, shots eliminate players and storm resolves a round', () => {
  const s = initialCompetition('arena', ['a', 'b']), [a, b] = s.players;
  a.x = s.supplies[0].x; a.y = s.supplies[0].y; a.hp = 50; a.ammo = 0;
  stepCompetition(s, new Map(), .05); assert.equal(a.hp, 75); assert.equal(a.ammo, 8);
  a.x = 490; a.y = 350; b.x = 510; b.y = 350; b.hp = 20;
  stepCompetition(s, new Map([['a', { x: 0, y: 0, fire: true }]]), .05);
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 'a');
  const storm = initialCompetition('arena', ['a', 'b']); storm.players.forEach(p => { p.x = 5; p.y = 5; });
  for (let i = 0; i < 300 && storm.phase === 'running'; i++) stepCompetition(storm, new Map(), .05);
  assert.equal(storm.phase, 'finished');
});

test('platform game auto-bounces, restores checkpoints on falls and ends at the goal', () => {
  const s = initialCompetition('jump', ['a', 'b']), p = s.players[0];
  p.y = 2; p.vy = -100; stepCompetition(s, new Map(), .05); assert.equal(p.vy, 660);
  p.best = 650; p.y = 0; p.vy = -100; stepCompetition(s, new Map(), .05);
  assert.equal(p.falls, 1); assert.equal(p.y, 505);
  p.best = 3001; stepCompetition(s, new Map(), .05);
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 'a');
});

test('the platform route is physically reachable from the starting platform', () => {
  const s = initialCompetition('jump', ['climber']);
  let nextIndex = 1;
  for (let i = 0; i < 1800 && s.phase === 'running'; i++) {
    const p = s.players[0], next = platform(nextIndex), center = next.x + next.width / 2;
    stepCompetition(s, new Map([['climber', { x: Math.abs(center - p.x) < 10 ? 0 : Math.sign(center - p.x) }]]), .05);
    if (p.vy === 660) nextIndex = Math.floor(p.y / 100) + 1;
  }
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 'climber');
  assert.ok(s.players[0].best >= 3000); assert.equal(s.players[0].falls, 0);
});

test('hockey has two selected seats, targeted input, late spectators and disconnect results', () => {
  const p = party('a', 'b', 'c'), a = p.get('a'), b = p.get('b'), c = p.get('c');
  a.hockey.start('missing'); assert.equal(a.hockey.round, null);
  a.hockey.start('b'); p.deliver();
  assert.deepEqual(c.hockey.round.players.map(p => p.id), ['a', 'b']);
  const frame = structuredClone(a.hockey.round);
  a.hockey.receive('snapshot', { ...frame, frame: 999 }, 'c'); assert.equal(a.hockey.round.frame, 0);
  c.hockey.input(1, 1); b.hockey.input(-1, -1, false, true); p.deliver();
  a.hockey.step(.05); p.deliver();
  assert.ok(a.hockey.round.players[1].x < 840); assert.deepEqual(b.hockey.round, a.hockey.round);
  const d = p.add('d'); assert.deepEqual(d.hockey.round, a.hockey.round);
  a.leave('b'); a.hockey.step(.05); p.deliver();
  assert.equal(c.hockey.round.winner, 'a'); assert.equal(c.hockey.round.finishReason, 'opponent left');
  c.hockey.start('a'); p.deliver(); d.leave('c'); assert.equal(d.hockey.interrupted, true);
});
