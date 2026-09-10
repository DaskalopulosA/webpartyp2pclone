const W = 1000, H = 700, LIMIT = 90;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const platform = i => ({ x: i % 5 === 0 ? 380 : 100 + ((i * 173) % 560), y: i * 100, width: i % 5 === 0 ? 240 : 210 });
export const safeRadius = time => Math.max(85, 510 - time * 5.6);

export function initialCompetition(kind, ids) {
  const players = ids.map((id, i) => kind === 'arena' ? {
    id, x: 500 + Math.cos(i / ids.length * Math.PI * 2) * 210, y: 350 + Math.sin(i / ids.length * Math.PI * 2) * 210,
    hp: 100, ammo: 12, cooldown: 0, alive: true,
  } : { id, x: 420 + (i % 4) * 35, y: 25, vy: 660, best: 0, falls: 0, active: true });
  return { kind, time: 0, phase: 'running', winner: null, players,
    bullets: [], supplies: kind === 'arena' ? Array.from({ length: 12 }, (_, i) => ({ x: 100 + (i * 137) % 800, y: 90 + (i * 193) % 520, taken: false })) : [] };
}

export function stepCompetition(state, inputs, dt) {
  if (state.phase !== 'running') return;
  dt = clamp(dt, 0, .05); state.time += dt;
  if (state.kind === 'arena') {
    for (const p of state.players) {
      if (!p.alive) continue;
      const input = inputs.get(p.id) || { x: 0, y: 0, fire: false };
      const norm = Math.max(1, Math.hypot(input.x, input.y));
      p.x = clamp(p.x + input.x / norm * 190 * dt, 16, W - 16);
      p.y = clamp(p.y + input.y / norm * 190 * dt, 16, H - 16);
      p.cooldown = Math.max(0, p.cooldown - dt);
      for (const item of state.supplies) if (!item.taken && distance(p, item) < 29) {
        item.taken = true; p.hp = Math.min(100, p.hp + 25); p.ammo += 8;
      }
      if (Math.hypot(p.x - 500, p.y - 350) > safeRadius(state.time)) p.hp -= 18 * dt;
      if (input.fire && p.cooldown === 0 && p.ammo > 0) {
        const target = state.players.filter(q => q.id !== p.id && q.alive).sort((a, b) => distance(p, a) - distance(p, b))[0];
        const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(input.y, input.x || 1);
        state.bullets.push({ owner: p.id, x: p.x, y: p.y, vx: Math.cos(angle) * 480, vy: Math.sin(angle) * 480, life: 2 });
        p.cooldown = .45; p.ammo--;
      }
      if (p.hp <= 0) { p.hp = 0; p.alive = false; }
    }
    for (const shot of state.bullets) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      for (const p of state.players) if (shot.life > 0 && p.alive && p.id !== shot.owner && distance(p, shot) < 23) {
        p.hp = Math.max(0, p.hp - 24); p.alive = p.hp > 0; shot.life = 0;
      }
    }
    state.bullets = state.bullets.filter(b => b.life > 0 && b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= H);
    const alive = state.players.filter(p => p.alive);
    if ((state.players.length > 1 && alive.length <= 1) || alive.length === 0 || state.time >= LIMIT) {
      state.phase = 'finished';
      const best = [...alive].sort((a, b) => b.hp - a.hp);
      state.winner = best.length && (best.length === 1 || best[0].hp > best[1].hp) ? best[0].id : null;
    }
  } else {
    for (const p of state.players) {
      if (p.active === false) continue;
      const input = inputs.get(p.id) || { x: 0 };
      p.x = clamp(p.x + input.x * 330 * dt, 12, W - 12);
      const oldY = p.y;
      p.vy -= 1250 * dt; p.y += p.vy * dt;
      if (p.vy < 0) {
        const top = Math.max(0, Math.ceil(oldY / 100));
        for (let i = top; i >= Math.max(0, top - 3); i--) {
          const ledge = platform(i);
          if (oldY >= ledge.y && p.y <= ledge.y && p.x >= ledge.x - 10 && p.x <= ledge.x + ledge.width + 10) {
            p.y = ledge.y; p.vy = 660; break;
          }
        }
      }
      p.best = Math.max(p.best, p.y);
      if (p.y < Math.max(-80, p.best - 550)) {
        const checkpoint = platform(Math.floor(p.best / 500) * 5);
        p.x = checkpoint.x + checkpoint.width / 2; p.y = checkpoint.y + 5; p.vy = 660; p.falls++;
      }
    }
    const ranked = state.players.filter(p => p.active !== false).sort((a, b) => b.best - a.best);
    if (ranked[0].best >= 3000 || state.time >= LIMIT) {
      state.phase = 'finished';
      state.winner = ranked.length === 1 || ranked[0].best > ranked[1].best ? ranked[0].id : null;
    }
  }
}

function validSnapshot(data, kind) {
  if (!data || data.kind !== kind || !Number.isSafeInteger(data.clock) || data.clock < 1 || data.clock > 1e9 || typeof data.author !== 'string' || !Number.isSafeInteger(data.frame) || data.frame < 0 || !Number.isFinite(data.time) || data.time < 0 || data.time > 100 || !['running', 'finished'].includes(data.phase) || !Array.isArray(data.players) || data.players.length < 1 || data.players.length > 8) return false;
  if (!data.players.every(p => p && typeof p.id === 'string' && p.id.length <= 64 && ['x','y'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) < 10000) && (kind === 'arena' ? Number.isFinite(p.hp) && Number.isFinite(p.ammo) && typeof p.alive === 'boolean' : ['vy', 'best', 'falls'].every(k => Number.isFinite(p[k]))))) return false;
  if (!data.players.some(p => p.id === data.author) || new Set(data.players.map(p => p.id)).size !== data.players.length) return false;
  return Array.isArray(data.bullets) && data.bullets.length <= 80 && data.bullets.every(b => b && Number.isFinite(b.x) && Number.isFinite(b.y)) && Array.isArray(data.supplies) && data.supplies.length <= 12 && data.supplies.every(s => s && Number.isFinite(s.x) && Number.isFinite(s.y));
}

// The browser that starts a round runs its simulation. Other browsers only send
// controls. Losing that browser ends the round; restarting elects a new host.
export function createCompetition(kind, selfId, send, changed, peerIds) {
  let round = null, clock = 0, inputSeq = 0, tick = 0;
  const inputs = new Map();
  const connected = id => id === selfId || peerIds().includes(id);
  return {
    get round() { return round; },
    get interrupted() { return !!round && !connected(round.author); },
    start() {
      if (clock >= 1e9) return;
      const ids = [selfId, ...peerIds().filter(id => id !== selfId).sort()].slice(0, 8);
      round = { ...initialCompetition(kind, ids), clock: ++clock, author: selfId, frame: 0 };
      inputs.clear(); tick = 0; send('snapshot', round); changed();
    },
    input(x, y = 0, fire = false) {
      if (!round || round.phase !== 'running' || !round.players.some(p => p.id === selfId) || !connected(round.author)) return;
      const data = { clock: round.clock, author: round.author, seq: ++inputSeq, x: clamp(x, -1, 1), y: clamp(y, -1, 1), fire: !!fire };
      if (round.author === selfId) inputs.set(selfId, { ...data, at: round.time });
      else send('input', data, round.author);
    },
    step(dt) {
      if (!round || round.author !== selfId || round.phase !== 'running') return;
      for (const p of round.players) {
        if (!connected(p.id) && kind === 'arena') { p.alive = false; p.hp = 0; }
        if (!connected(p.id) && kind === 'jump') p.active = false;
        if (!connected(p.id) || (inputs.has(p.id) && round.time - inputs.get(p.id).at > .35)) inputs.delete(p.id);
      }
      stepCompetition(round, inputs, dt); round.frame++;
      if (++tick % 2 === 0 || round.phase === 'finished') send('snapshot', round);
      changed();
    },
    sync(peerId) { if (round?.author === selfId) send('snapshot', round, peerId); },
    receive(type, data, sender) {
      if (type === 'snapshot') {
        if (!validSnapshot(data, kind) || data.author !== sender) return;
        const order = round ? data.clock - round.clock || (data.author > round.author ? 1 : data.author < round.author ? -1 : 0) : 1;
        if (order < 0 || (order === 0 && data.frame <= round.frame)) return;
        clock = Math.max(clock, data.clock); round = structuredClone(data); changed();
      } else if (type === 'input' && round?.author === selfId && data) {
        if (data.clock !== round.clock || data.author !== selfId || !round.players.some(p => p.id === sender) || !Number.isSafeInteger(data.seq) || data.seq <= (inputs.get(sender)?.seq ?? -1) || ![data.x, data.y].every(v => Number.isFinite(v) && Math.abs(v) <= 1) || typeof data.fire !== 'boolean') return;
        inputs.set(sender, { ...data, at: round.time });
      }
    },
  };
}
