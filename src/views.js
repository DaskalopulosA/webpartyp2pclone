import { GAMES } from './arcade.js';
import { COLORS, CELL_COUNT } from './games/pixels.js';
import { SIGNALS } from './games/secrets.js';
import { resultOf } from './games/tiles.js';
import { targetFor } from './games/cursors.js';
import { platform, safeRadius } from './games/competition.js';
import { mountHockey } from './hockey-view.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const node = document.createElement(tag); node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const peerSelect = id => `<select id="${id}" aria-label="Choose a connected player"><option value="">Waiting for a friend…</option></select>`;

export function mountGames(getArcade, getConnection, notice, select) {
  $('game-menu').replaceChildren(...GAMES.map((game, i) => {
    const button = el('button', 'game-choice'); button.dataset.game = game.id;
    button.setAttribute('aria-controls', `panel-${game.id}`);
    button.append(el('span', 'game-icon', game.icon), el('span', 'game-number', String(i + 1).padStart(2, '0')), el('strong', '', game.title), el('small', '', game.feature));
    button.addEventListener('click', () => select(game.id)); return button;
  }));
  // This template is static. All player-supplied text is rendered with textContent.
  $('extra-games').innerHTML = `
    <section id="panel-cursors" class="play-card game-panel" hidden>
      <div class="card-kicker"><span>LIVE MOVEMENT</span><span>EVERYONE PLAYS</span></div><h2>Follow the gold.</h2>
      <p>Move your cursor and collect your gold dots. Everyone has their own trail. Touch a dot to collect it.</p>
      <div id="cursor-field" tabindex="0" aria-label="Cursor field. Arrow keys move, Enter collects a nearby dot."><button id="cursor-target" aria-label="Collect gold dot">✦</button><div id="cursor-markers"></div></div>
      <p id="cursor-score" class="game-status" role="status"></p>
    </section>
    <section id="panel-pixels" class="play-card game-panel" hidden>
      <div class="card-kicker"><span>SHARED CANVAS</span><span>EVERYONE CREATES</span></div><h2>A tiny group masterpiece.</h2><p>Pick a color, then paint a square. Friends joining later get the whole canvas.</p>
      <div id="palette" aria-label="Paint color"></div><div id="pixel-board" aria-label="Shared pixel canvas"></div><button id="clear-pixels" class="button small">Clear canvas for everyone</button>
    </section>
    <section id="panel-secrets" class="play-card game-panel" hidden>
      <div class="card-kicker"><span>PRIVATE MESSAGES</span><span>JUST BETWEEN YOU TWO</span></div><h2>Pass a little mystery.</h2><p>Choose a friend and a symbol. Only that friend gets the clue. One guess each!</p>
      <div class="control-row">${peerSelect('secret-peer')}<select id="secret-symbol" aria-label="Secret symbol">${SIGNALS.map((s, i) => `<option value="${i}">${s.icon} ${s.name}</option>`).join('')}</select><button id="send-secret" class="button dark">Send clue</button></div>
      <div id="secret-messages" class="message-list" aria-live="polite"></div>
    </section>
    <section id="panel-tiles" class="play-card game-panel" hidden>
      <div class="card-kicker"><span>TURNS & SPECTATORS</span><span>2 PLAYERS + FRIENDS</span></div><h2>Three is the magic number.</h2><p>Start a round with a friend. X goes first. Everyone else can watch.</p>
      <div class="control-row">${peerSelect('tiles-peer')}<button id="start-tiles" class="button dark">Start round</button></div><p id="tiles-status" class="game-status" role="status"></p><div id="tiles-board" aria-label="Three in a row board"></div>
    </section>
    <section id="panel-echo" class="play-card game-panel" hidden>
      <div class="card-kicker"><span>REQUEST & RESPONSE</span><span>RACE THE ROUND TRIP</span></div><h2>How far is a friend?</h2><p>Guess the round-trip time, then send a ping. Their browser answers automatically.</p>
      <div class="control-row">${peerSelect('echo-peer')}<select id="echo-guess" aria-label="Latency guess"><option value="0">Under 40 ms</option><option value="1">40–120 ms</option><option value="2">Over 120 ms</option></select></div>
      <button id="send-echo" class="button dark">Send a ping ↔</button><div id="echo-result" class="echo-result" role="status">Make your best guess.</div><p id="echo-score" class="muted">0 correct / 0 attempts</p>
    </section>
    ${['arena', 'jump'].map(kind => `<section id="panel-${kind}" class="play-card game-panel competition-panel" hidden>
      <div class="card-kicker"><span>${kind === 'arena' ? 'LAST-PLAYER-STANDING SURVIVAL' : 'COMPETITIVE PLATFORM RACE'}</span><span>1–8 PLAYERS</span></div>
      <h2>${kind === 'arena' ? 'Last Light' : 'Sky Sprint'}</h2><p>${kind === 'arena' ? 'Gather orange supply crates. Dodge the shrinking storm. Fire at the nearest rival. Last survivor wins.' : 'Bounce automatically. Steer onto platforms. First to 3,000 m wins. Falls return you to a checkpoint.'}</p>
      <div class="round-bar"><button id="start-${kind}" class="button dark">Start round</button><span id="${kind}-status" class="game-status" role="status">Invite friends, or try a solo practice.</span></div>
      <canvas id="${kind}-canvas" width="1000" height="700" tabindex="0" aria-label="${kind === 'arena' ? 'Survival arena. WASD or arrows to move, Space to fire.' : 'Platform race. A and D or left and right arrows to steer.'}"></canvas>
      <div class="touch-controls" aria-label="${kind} movement controls">${(kind === 'arena' ? [['a','←'],['w','↑'],['s','↓'],['d','→'],[' ','Fire']] : [['a','← Left'],['d','Right →']]).map(([key, text]) => `<button data-control="${key}" class="button">${text}</button>`).join('')}</div>
      <p class="muted">${kind === 'arena' ? 'WASD / arrows to move · hold Space to fire · supplies restore health & ammo' : 'A / D or arrow keys to steer · bounce is automatic · checkpoints every 500 m'}. Late joiners watch until the next round.</p>
    </section>`).join('')}`;

  const hockeyView = mountHockey(getArcade);
  let selectedColor = 1, roster = '', secretSignature = '', cursorSentAt = 0;
  let echoBusy = false, echoCorrect = 0, echoAttempts = 0;
  const keys = new Set();
  function paint(index) { getArcade()?.pixels.paint(index, selectedColor); }
  $('palette').replaceChildren(...COLORS.map((color, i) => {
    const b = el('button', 'swatch'); b.style.background = color; b.setAttribute('aria-label', ['Eraser', 'Coral', 'Gold', 'Green', 'Blue', 'Purple'][i]); b.dataset.color = i;
    b.addEventListener('click', () => { selectedColor = i; renderPalette(); }); return b;
  }));
  function renderPalette() { document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.color) === selectedColor))); }
  renderPalette();
  $('pixel-board').replaceChildren(...Array.from({ length: CELL_COUNT }, (_, i) => {
    const b = el('button', 'pixel'); b.dataset.cell = i; b.setAttribute('aria-label', `Paint cell ${i + 1}`);
    b.addEventListener('click', () => paint(i)); b.addEventListener('pointerenter', e => { if (e.buttons === 1 && e.pointerType === 'mouse') paint(i); }); return b;
  }));
  $('clear-pixels').onclick = () => getArcade()?.pixels.clear();
  $('send-secret').onclick = () => getArcade()?.secrets.challenge($('secret-peer').value, Number($('secret-symbol').value));
  $('start-tiles').onclick = () => getArcade()?.tiles.start($('tiles-peer').value);
  $('tiles-board').replaceChildren(...Array.from({ length: 9 }, (_, i) => {
    const b = el('button', 'tile'); b.dataset.cell = i; b.setAttribute('aria-label', `Tile ${i + 1}`); b.onclick = () => getArcade()?.tiles.move(i); return b;
  }));
  $('cursor-field').addEventListener('pointermove', e => {
    const now = performance.now(); if (now - cursorSentAt < 50) return; cursorSentAt = now;
    const rect = $('cursor-field').getBoundingClientRect(); getArcade()?.cursors.move((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  });
  $('cursor-target').onclick = () => getArcade()?.cursors.collect();
  $('cursor-field').addEventListener('keydown', e => {
    const arcade = getArcade(); if (!arcade) return;
    const me = arcade.cursors.states.get(arcade.selfId), target = targetFor(me.score);
    if (e.key.startsWith('Arrow')) {
      e.preventDefault(); arcade.cursors.move(me.x + (e.key === 'ArrowRight' ? .04 : e.key === 'ArrowLeft' ? -.04 : 0), me.y + (e.key === 'ArrowDown' ? .04 : e.key === 'ArrowUp' ? -.04 : 0));
    } else if (e.key === 'Enter' && e.target === $('cursor-field') && Math.hypot(me.x - target.x, me.y - target.y) < .1) { e.preventDefault(); arcade.cursors.collect(); }
  });
  $('send-echo').onclick = async () => {
    if (echoBusy || !$('echo-peer').value) return;
    echoBusy = true; $('send-echo').disabled = true; $('echo-result').textContent = 'Out and back…';
    const guess = Number($('echo-guess').value);
    try {
      const ms = await getConnection().ping($('echo-peer').value);
      const bucket = ms < 40 ? 0 : ms <= 120 ? 1 : 2;
      echoAttempts++; if (guess === bucket) echoCorrect++;
      $('echo-result').textContent = `${Math.round(ms)} ms · ${guess === bucket ? 'Right on!' : 'Try another guess!'}`;
      $('echo-score').textContent = `${echoCorrect} correct / ${echoAttempts} attempts`;
    } catch (e) { $('echo-result').textContent = e.message; }
    finally { echoBusy = false; $('send-echo').disabled = !$('echo-peer').value; }
  };
  for (const kind of ['arena', 'jump']) $('start-' + kind).onclick = () => { getArcade()?.[kind].start(); $(kind + '-canvas').focus({ preventScroll: true }); };
  window.addEventListener('keydown', e => {
    const id = getArcade()?.profiles.get(getArcade()?.selfId)?.game;
    if (!['arena', 'jump', 'hockey'].includes(id) || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const mapped = { ArrowLeft: 'a', ArrowRight: 'd', ArrowUp: 'w', ArrowDown: 's' }[e.key] || e.key.toLowerCase();
    if (['a', 'd', 'w', 's', ' '].includes(mapped)) { e.preventDefault(); hockeyView.clearPointer(); keys.add(mapped); }
  });
  window.addEventListener('keyup', e => keys.delete({ ArrowLeft: 'a', ArrowRight: 'd', ArrowUp: 'w', ArrowDown: 's' }[e.key] || e.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); hockeyView.clearPointer(); });
  document.querySelectorAll('[data-control]').forEach(b => {
    b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); hockeyView.clearPointer(); keys.add(b.dataset.control); };
    b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => keys.delete(b.dataset.control);
  });

  function playerName(id) { return getArcade().profiles.get(id)?.name || id.slice(0, 6); }
  function renderPeers(arcade) {
    const current = JSON.stringify([...arcade.peers].map(id => [id, playerName(id)]));
    if (current !== roster) {
      roster = current;
      for (const id of ['secret-peer', 'tiles-peer', 'echo-peer', 'hockey-peer']) {
        const chosen = $(id).value;
        $(id).replaceChildren(...(arcade.peers.size ? [...arcade.peers].map(peerId => { const o = el('option', '', playerName(peerId)); o.value = peerId; return o; }) : [el('option', '', 'Waiting for a friend…')]));
        if (!arcade.peers.size) $(id).firstChild.value = '';
        if (arcade.peers.has(chosen)) $(id).value = chosen;
      }
    }
    $('send-secret').disabled = $('start-tiles').disabled = !arcade.peers.size;
    $('send-echo').disabled = echoBusy || !arcade.peers.size;
  }
  return {
    controls(selected) {
      const arcade = getArcade(); if (!arcade) return;
      for (const kind of ['arena', 'jump']) {
        arcade[kind].input(selected === kind ? Number(keys.has('d')) - Number(keys.has('a')) : 0, selected === kind ? Number(keys.has('s')) - Number(keys.has('w')) : 0, selected === kind && keys.has(' '));
        arcade[kind].step(.05);
      }
      hockeyView.controls(selected, keys);
    },
    clearControls() { keys.clear(); hockeyView.clearPointer(); },
    render(selected) {
      const arcade = getArcade(); if (!arcade) return;
      renderPeers(arcade);
      document.querySelectorAll('.game-choice').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.game === selected)));
      document.querySelectorAll('.game-panel').forEach(p => { p.hidden = p.id !== `panel-${selected}`; });
      if (selected === 'hockey') hockeyView.render(playerName);
      if (selected === 'pixels') $('pixel-board').childNodes.forEach((b, i) => { b.style.background = COLORS[arcade.pixels.cells[i][0]]; b.dataset.color = arcade.pixels.cells[i][0]; });
      if (selected === 'cursors') {
        const me = arcade.cursors.states.get(arcade.selfId), target = targetFor(me.score);
        $('cursor-target').style.left = `${target.x * 100}%`; $('cursor-target').style.top = `${target.y * 100}%`;
        $('cursor-score').textContent = `${me.score} dots collected by you`;
        $('cursor-markers').replaceChildren(...[...arcade.cursors.states].map(([id, state]) => {
          const m = el('span', 'live-cursor', `↖ ${id === arcade.selfId ? 'You' : playerName(id)}`); m.dataset.peerId = id;
          m.style.left = `${state.x * 100}%`; m.style.top = `${state.y * 100}%`; m.style.color = colorFor(id); return m;
        }));
      }
      if (selected === 'secrets') {
        const signature = JSON.stringify([[...arcade.secrets.inbox], [...arcade.secrets.outbox], roster]);
        if (signature !== secretSignature) {
          secretSignature = signature; const cards = [];
          for (const [id, item] of [...arcade.secrets.inbox].reverse()) {
            const card = el('div', 'secret-card'); card.dataset.messageId = id;
            card.append(el('strong', '', `From ${playerName(item.peerId)}`), el('p', '', SIGNALS[item.symbol].clue));
            if (item.result !== null) card.append(el('p', 'secret-result', item.result ? 'You cracked it!' : `It was ${SIGNALS[item.symbol].name}.`));
            else {
              const answers = el('div', 'secret-answers');
              SIGNALS.forEach((s, i) => { const b = el('button', 'button small', `${s.icon} ${s.name}`); b.onclick = () => arcade.secrets.guess(id, i); b.disabled = !arcade.peers.has(item.peerId); answers.append(b); }); card.append(answers);
            }
            cards.push(card);
          }
          for (const [, item] of [...arcade.secrets.outbox].reverse()) cards.push(el('p', 'secret-sent', `To ${playerName(item.peerId)} · ${SIGNALS[item.symbol].name} · ${item.result === null ? (arcade.peers.has(item.peerId) ? 'Waiting for a guess' : 'Player disconnected') : item.result ? 'They cracked it!' : 'Better luck next time'}`));
          $('secret-messages').replaceChildren(...(cards.length ? cards : [el('p', 'muted', 'Your private clues will appear here. Other players won’t receive them.')]));
        }
      }
      if (selected === 'tiles') {
        const round = arcade.tiles.round, result = round && resultOf(round.moves);
        const ready = round?.players.every(id => id === arcade.selfId || arcade.peers.has(id));
        const turn = round?.players[round.moves.length % 2];
        $('tiles-status').textContent = !round ? 'Choose a friend to begin.' : result ? (result === 'draw' ? 'A draw. Nicely matched.' : `${playerName(round.players[result === 'X' ? 0 : 1])} wins!`) : !ready ? 'A player left. Start a new round with a connected friend.' : `${playerName(turn)}’s turn · ${round.moves.length % 2 ? 'O' : 'X'}${round.players.includes(arcade.selfId) ? '' : ' · You’re watching'}`;
        $('tiles-board').childNodes.forEach((b, i) => { const step = round?.moves.indexOf(i) ?? -1; b.textContent = step < 0 ? '' : step % 2 ? 'O' : 'X'; b.disabled = !ready || !!result || turn !== arcade.selfId || step >= 0; });
      }
      if (selected === 'arena' || selected === 'jump') {
        const model = arcade[selected], round = model.round;
        $('start-' + selected).textContent = round ? 'Start new round' : arcade.peers.size ? 'Start round' : 'Solo practice';
        const playing = round?.players.some(p => p.id === arcade.selfId);
        $(selected + '-status').textContent = !round ? 'Invite friends, or try a solo practice.' : model.interrupted ? 'The host left. Start a new round to play again.' : round.phase === 'finished' ? (round.winner ? `${playerName(round.winner)} wins!` : 'Round over · a draw') : `${Math.ceil(90 - round.time)}s left · ${playing ? 'You’re playing' : 'You’re watching'} · host: ${playerName(round.author)}`;
        drawCompetition($(selected + '-canvas'), selected, round, arcade.selfId, playerName);
      }
    },
  };
}

export function colorFor(id) { return `hsl(${[...id].reduce((n, c) => n + c.charCodeAt(0) * 7, 0) % 360} 45% 42%)`; }

function drawCompetition(canvas, kind, state, selfId, name) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 1000, 700);
  ctx.fillStyle = kind === 'arena' ? '#e3e8ce' : '#e2f0ef'; ctx.fillRect(0, 0, 1000, 700);
  ctx.font = '24px Segoe UI, sans-serif'; ctx.textAlign = 'center';
  if (!state) { ctx.fillStyle = '#657453'; ctx.fillText(kind === 'arena' ? 'Your arena is waiting.' : 'The only way is up.', 500, 340); return; }
  const me = state.players.find(p => p.id === selfId);
  if (kind === 'arena') {
    const radius = safeRadius(state.time);
    ctx.fillStyle = '#9d8bb0'; ctx.fillRect(0, 0, 1000, 700); ctx.fillStyle = '#e3e8ce'; ctx.beginPath(); ctx.arc(500, 350, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c7ceb4'; ctx.lineWidth = 1;
    for (let x = 0; x < 1000; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 700); ctx.stroke(); }
    for (const item of state.supplies) if (!item.taken) { ctx.fillStyle = '#ed6845'; ctx.fillRect(item.x - 12, item.y - 12, 24, 24); ctx.fillStyle = '#fff7db'; ctx.fillText('+', item.x, item.y + 8); }
    for (const b of state.bullets) { ctx.fillStyle = '#e9a322'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill(); }
    for (const p of state.players) {
      ctx.globalAlpha = p.alive ? 1 : .3;
      ctx.fillStyle = colorFor(p.id); ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 7); ctx.fill();
      if (p.id === selfId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
      ctx.fillStyle = '#293127'; ctx.font = '18px Segoe UI, sans-serif'; ctx.fillText(p.id === selfId ? 'YOU' : name(p.id).slice(0, 18), p.x, p.y - 37);
      ctx.fillStyle = '#cdc8b7'; ctx.fillRect(p.x - 25, p.y - 29, 50, 5); ctx.fillStyle = '#598854'; ctx.fillRect(p.x - 25, p.y - 29, p.hp / 2, 5); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#293127'; ctx.textAlign = 'left'; ctx.font = '22px Segoe UI, sans-serif';
    ctx.fillText(me ? `${me.alive ? Math.ceil(me.hp) + ' health' : 'Eliminated — keep watching'} · ${me.ammo} ammo` : 'Spectating this round', 22, 36);
  } else {
    const focus = me || [...state.players].sort((a, b) => b.best - a.best)[0];
    const camera = Math.max(0, focus.y - 230);
    for (let i = Math.max(0, Math.floor(camera / 100)); i < Math.ceil((camera + 700) / 100); i++) {
      const p = platform(i), y = 660 - (p.y - camera);
      ctx.fillStyle = i % 5 === 0 ? '#edaa53' : '#88b9aa'; ctx.fillRect(p.x, y, p.width, 14);
      if (i % 5 === 0) { ctx.fillStyle = '#677d73'; ctx.font = '16px Segoe UI, sans-serif'; ctx.fillText(`${i * 100} m checkpoint`, p.x + p.width / 2, y - 10); }
    }
    if (camera > 2300) { ctx.fillStyle = '#e9bd51'; ctx.fillRect(0, 660 - (3000 - camera), 1000, 10); }
    for (const p of state.players) {
      const y = 660 - (p.y - camera); if (y < -40 || y > 750) continue;
      ctx.fillStyle = colorFor(p.id); ctx.beginPath(); ctx.roundRect(p.x - 17, y - 28, 34, 28, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 8, y - 20, 5, 6); ctx.fillRect(p.x + 4, y - 20, 5, 6);
      ctx.font = '18px Segoe UI, sans-serif'; ctx.fillStyle = '#34443e'; ctx.fillText(p.id === selfId ? 'YOU' : name(p.id).slice(0, 18), p.x, y - 39);
    }
    ctx.fillStyle = '#34443e'; ctx.font = '22px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${Math.floor(focus.best)} / 3,000 m${me ? ` · ${me.falls} falls` : ' · Spectating'}`, 22, 36);
  }
}
