import { createCompetition } from './competition.js';

export const RINK = { width: 1000, height: 600, puck: 14, paddle: 32, goalTop: 190, goalBottom: 410, target: 5, seconds: 120 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const integer = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 64;

function resetServe(state) {
  state.puck = { x: 500, y: 300, vx: 0, vy: 0 };
  state.serveIn = 1.2;
  state.players.forEach((p, i) => { p.x = i ? 840 : 160; p.y = 300; });
}

export function initialHockey(ids) {
  const state = { kind: 'hockey', time: 0, phase: 'running', winner: null, finishReason: '', lastScorer: null,
    players: ids.map((id, i) => ({ id, x: i ? 840 : 160, y: 300, score: 0 })), serve: 0 };
  resetServe(state);
  return state;
}

function goal(state, scorer) {
  const p = state.players[scorer]; p.score++; state.lastScorer = p.id; state.serve++;
  resetServe(state);
  if (p.score >= RINK.target) { state.phase = 'finished'; state.winner = p.id; state.finishReason = 'five goals'; }
}

export function stepHockey(state, inputs, dt) {
  if (state.phase !== 'running') return;
  // Small substeps keep a fast puck from passing through paddles or goalposts.
  const step = clamp(dt, 0, .05) / 5;
  for (let sub = 0; sub < 5 && state.phase === 'running'; sub++) {
    state.time += step;
    if (state.time >= RINK.seconds) {
      state.phase = 'finished'; state.finishReason = 'time';
      const [a, b] = state.players; state.winner = a.score === b.score ? null : a.score > b.score ? a.id : b.id;
      break;
    }
    const velocities = state.players.map((p, i) => {
      const input = inputs.get(p.id) ?? { x: 0, y: 0 };
      const minX = i ? 532 : 32, maxX = i ? 968 : 468;
      let dx = input.x, dy = input.y;
      if (input.position) {
        dx = clamp((input.x + 1) * 500, minX, maxX) - p.x;
        dy = clamp((input.y + 1) * 300, 32, 568) - p.y;
        const distance = Math.hypot(dx, dy), travel = Math.min(distance, 720 * step);
        dx = distance ? dx / distance * travel : 0; dy = distance ? dy / distance * travel : 0;
      } else {
        const norm = Math.max(1, Math.hypot(dx, dy)); dx = dx / norm * 720 * step; dy = dy / norm * 720 * step;
      }
      const oldX = p.x, oldY = p.y;
      p.x = clamp(p.x + dx, minX, maxX); p.y = clamp(p.y + dy, 32, 568);
      return { x: (p.x - oldX) / step || 0, y: (p.y - oldY) / step || 0 };
    });
    if (state.serveIn > 0) {
      state.serveIn = Math.max(0, state.serveIn - step);
      if (state.serveIn === 0) { state.puck.vx = state.serve % 2 ? -390 : 390; state.puck.vy = state.serve % 2 ? -120 : 120; }
      continue;
    }
    const puck = state.puck;
    puck.x += puck.vx * step; puck.y += puck.vy * step;
    if (puck.y < 14) { puck.y = 14; puck.vy = Math.abs(puck.vy); }
    if (puck.y > 586) { puck.y = 586; puck.vy = -Math.abs(puck.vy); }
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i], v = velocities[i];
      const dx = puck.x - p.x, dy = puck.y - p.y, distance = Math.hypot(dx, dy);
      if (distance >= 46) continue;
      const nx = distance > .001 ? dx / distance : i ? -1 : 1, ny = distance > .001 ? dy / distance : 0;
      puck.x = p.x + nx * 46.1; puck.y = p.y + ny * 46.1;
      const approach = (puck.vx - v.x) * nx + (puck.vy - v.y) * ny;
      if (approach < 0) { puck.vx -= 1.9 * approach * nx; puck.vy -= 1.9 * approach * ny; }
    }
    // Round posts stop a grazing shot clipping through the mouth of the goal.
    for (const x of [0, 1000]) for (const y of [190, 410]) {
      const dx = puck.x - x, dy = puck.y - y, distance = Math.hypot(dx, dy);
      if (distance >= 22) continue;
      const nx = distance > .001 ? dx / distance : x ? -1 : 1, ny = distance > .001 ? dy / distance : 0;
      puck.x = x + nx * 22.1; puck.y = y + ny * 22.1;
      const approach = puck.vx * nx + puck.vy * ny;
      if (approach < 0) { puck.vx -= 2 * approach * nx; puck.vy -= 2 * approach * ny; }
    }
    const inGoal = puck.y > 204 && puck.y < 396;
    if (!inGoal && puck.x < 14) { puck.x = 14; puck.vx = Math.abs(puck.vx); }
    if (!inGoal && puck.x > 986) { puck.x = 986; puck.vx = -Math.abs(puck.vx); }
    if (inGoal && puck.x < -14) { goal(state, 1); continue; }
    if (inGoal && puck.x > 1014) { goal(state, 0); continue; }
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > .001) {
      const scale = clamp(speed * Math.exp(-.08 * step), 180, 1050) / speed;
      puck.vx *= scale; puck.vy *= scale;
    }
  }
}

export function validHockey(data) {
  if (!data || data.kind !== 'hockey' || !integer(data.clock, 1, 1e9) || !id(data.author) || !integer(data.frame, 0, 1e9) || !finite(data.time, 0, 121) || !['running', 'finished'].includes(data.phase) || !Array.isArray(data.players) || data.players.length !== 2) return false;
  if (!data.players.every((p, i) => p && id(p.id) && finite(p.x, i ? 532 : 32, i ? 968 : 468) && finite(p.y, 32, 568) && integer(p.score, 0, 5))) return false;
  if (data.players[0].id !== data.author || data.players[0].id === data.players[1].id || ![null, ...data.players.map(p => p.id)].includes(data.winner) || ![null, ...data.players.map(p => p.id)].includes(data.lastScorer)) return false;
  return data.puck && finite(data.puck.x, -30, 1030) && finite(data.puck.y, -30, 630) && finite(data.puck.vx, -1100, 1100) && finite(data.puck.vy, -1100, 1100) && finite(data.serveIn, 0, 1.2) && integer(data.serve, 0, 10) && ['', 'five goals', 'time', 'opponent left'].includes(data.finishReason);
}

export function createHockey(selfId, send, changed, peerIds) {
  return createCompetition('hockey', selfId, send, changed, peerIds, {
    initial: initialHockey, step: stepHockey, valid: validHockey, snapshotEvery: 1,
    seats(self, peers, opponent) { return opponent !== self && peers.includes(opponent) ? [self, opponent] : null; },
    disconnected(round, connected) {
      if (!connected(round.players[1].id)) { round.phase = 'finished'; round.winner = round.author; round.finishReason = 'opponent left'; }
    },
  });
}
