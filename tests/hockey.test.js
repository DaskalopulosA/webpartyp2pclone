import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialHockey, stepHockey, validHockey } from '../src/games/hockey.js';

const live = () => ({ ...initialHockey(['a', 'b']), serveIn: 0 });

test('a serve waits, launches and paddle controls stay in each player’s own half', () => {
  const s = initialHockey(['a', 'b']);
  stepHockey(s, new Map(), .05); assert.equal(s.puck.vx, 0);
  for (let i = 0; i < 25; i++) stepHockey(s, new Map(), .05);
  assert.ok(s.puck.vx > 0);
  for (let i = 0; i < 30; i++) stepHockey(s, new Map([['a', { x: 1, y: 1, position: true }], ['b', { x: -1, y: -1, position: true }]]), .05);
  assert.equal(s.players[0].x, 468); assert.equal(s.players[0].y, 568);
  assert.equal(s.players[1].x, 532); assert.equal(s.players[1].y, 32);
});

test('puck rebounds off walls and paddles even at maximum speed', () => {
  const wall = live(); wall.puck = { x: 500, y: 16, vx: 300, vy: -500 };
  stepHockey(wall, new Map(), .05); assert.ok(wall.puck.vy > 0); assert.ok(wall.puck.y >= 14);
  const hit = live(); hit.puck = { x: 245, y: 300, vx: -1050, vy: 0 };
  stepHockey(hit, new Map(), .05); assert.ok(hit.puck.vx > 0); assert.ok(hit.puck.x > 206);
});

test('goals credit the opposite side, reset the serve and stop at five', () => {
  const s = live(); s.puck = { x: -10, y: 300, vx: -500, vy: 0 };
  stepHockey(s, new Map(), .05); assert.equal(s.players[1].score, 1); assert.equal(s.puck.x, 500); assert.ok(s.serveIn > 0);
  for (let goal = 0; goal < 5; goal++) {
    s.serveIn = 0; s.puck = { x: 1005, y: 300, vx: 700, vy: 0 }; stepHockey(s, new Map(), .05);
  }
  assert.equal(s.players[0].score, 5); assert.equal(s.phase, 'finished'); assert.equal(s.winner, 'a');
  const final = structuredClone(s); stepHockey(s, new Map(), .05); assert.deepEqual(s, final);
});

test('a shot outside the goal mouth rebounds instead of scoring', () => {
  const s = live(); s.puck = { x: 984, y: 100, vx: 700, vy: 0 };
  stepHockey(s, new Map(), .05); assert.equal(s.players[0].score, 0); assert.ok(s.puck.vx < 0);
});

test('time limit also applies during a serve countdown, including draws', () => {
  const s = initialHockey(['a', 'b']); s.time = 119.99;
  stepHockey(s, new Map(), .05); assert.equal(s.phase, 'finished'); assert.equal(s.winner, null);
  const leading = initialHockey(['a', 'b']); leading.time = 119.99; leading.players[1].score = 2;
  stepHockey(leading, new Map(), .05); assert.equal(leading.winner, 'b');
});

test('snapshot validation rejects impossible geometry, scores, winners and duplicate seats', () => {
  const s = { ...initialHockey(['a', 'b']), author: 'a', clock: 1, frame: 0 };
  assert.ok(validHockey(s));
  for (const change of [v => v.puck.x = NaN, v => v.players[0].x = 900, v => v.players[1].score = 6, v => v.winner = 'spectator', v => v.players[1].id = 'a']) {
    const bad = structuredClone(s); change(bad); assert.equal(validHockey(bad), false);
  }
});
