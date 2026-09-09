import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { newRoomCode, parseRoomCode, inviteUrl, roomFromHash } from '../src/room-code.js';

test('simultaneous clicks converge without overwriting another player', () => {
  const a = createGame('a', 'Alice'), b = createGame('b', 'Bob');
  for (let i = 0; i < 17; i++) a.click();
  for (let i = 0; i < 23; i++) b.click();
  a.receive('b', b.snapshot()); b.receive('a', a.snapshot());
  assert.deepEqual([...a.players].sort(), [...b.players].sort());
  assert.equal([...a.players.values()].reduce((n, p) => n + p.clicks, 0), 40);
});

test('duplicates and stale packets never rewind counters; late join receives current state', () => {
  const a = createGame('a', 'Alice');
  a.receive('b', { v: 1, name: 'Bob', clicks: 9 });
  assert.equal(a.receive('b', { v: 1, name: 'Bob', clicks: 9 }), false);
  assert.equal(a.receive('b', { v: 1, name: 'Bob', clicks: 2 }), false);
  assert.equal(a.players.get('b').clicks, 9);
  const c = createGame('c', 'Charlie');
  c.receive('a', a.snapshot());
  assert.equal(c.players.get('a').clicks, 0);
});

test('connection supplies identity and malformed values are ignored', () => {
  const a = createGame('a', 'Alice');
  for (const clicks of [-1, 1.5, Infinity, NaN, '9', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(a.receive('b', { v: 1, name: 'Bob', clicks }), false);
  }
  for (const data of [null, {}, { v: 2, name: 'Bob', clicks: 0 }, { v: 1, name: ' ', clicks: 0 }, { v: 1, name: 'x'.repeat(25), clicks: 0 }]) {
    assert.equal(a.receive('b', data), false);
  }
  assert.equal(a.receive('a', { v: 1, name: 'Impostor', clicks: 500 }), false);
  a.receive('b', { v: 1, id: 'a', name: 'Bob', clicks: 4 });
  assert.equal(a.players.get('a').clicks, 0);
  assert.equal(a.players.get('b').clicks, 4);
});

test('disconnect removes only that peer; reconnect supplies its state again', () => {
  const a = createGame('a', 'Alice');
  a.click(); a.receive('b', { v: 1, name: 'Bob', clicks: 4 });
  a.remove('b'); a.remove('a');
  assert.equal(a.players.size, 1);
  a.receive('b', { v: 1, name: 'Bob', clicks: 6 });
  assert.equal(a.players.get('b').clicks, 6);
});

test('room links preserve GitHub Pages subpaths and validate codes', () => {
  const code = newRoomCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(parseRoomCode('abcd-2345'), 'ABCD2345');
  const link = inviteUrl('https://user.github.io/repo/?hello=1', code);
  assert.equal(new URL(link).pathname, '/repo/');
  assert.equal(parseRoomCode(link), code);
  assert.equal(roomFromHash(new URL(link).hash), code);
  for (const input of ['', 'INVALID!', 'ABCD1234', 'https://example.com/#wrong=ABCD2345']) assert.equal(parseRoomCode(input), null);
});
