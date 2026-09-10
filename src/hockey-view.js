import { RINK } from './games/hockey.js';

const $ = id => document.getElementById(id);

export function mountHockey(getArcade) {
  const panel = document.createElement('section');
  panel.id = 'panel-hockey'; panel.className = 'play-card game-panel hockey-panel'; panel.hidden = true;
  panel.innerHTML = `
    <div class="card-kicker"><span>PUCK & PADDLE PHYSICS</span><span>2 PLAYERS + SPECTATORS</span></div>
    <h2>Table Hockey</h2><p>A little friendly friction. Defend your half and knock the puck through the opposite goal. First to five wins.</p>
    <div class="control-row"><select id="hockey-peer" aria-label="Choose a hockey opponent"><option value="">Waiting for a friend…</option></select><button id="start-hockey" class="button dark">Start match</button></div>
    <div class="hockey-scoreboard" aria-label="Hockey scoreboard"><div class="hockey-left"><span id="hockey-left-name">Left player</span><strong id="hockey-left-score">0</strong></div><span class="hockey-clock" id="hockey-clock">FIRST TO 5</span><div class="hockey-right"><span id="hockey-right-name">Right player</span><strong id="hockey-right-score">0</strong></div></div>
    <p id="hockey-status" class="game-status" role="status">Choose a connected friend to take the other side.</p>
    <div class="hockey-table"><svg id="hockey-rink" viewBox="0 0 1000 600" tabindex="0" role="img" aria-label="Table hockey rink. Move your pointer, drag a finger, or use WASD and arrow keys to move your paddle.">
      <defs><pattern id="hockey-holes" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.2" fill="#b7d6ce"/></pattern></defs>
      <rect width="1000" height="600" rx="18" fill="#eff7f4"/><rect width="1000" height="600" fill="url(#hockey-holes)"/>
      <path d="M500 0V600" stroke="#b8ccc5" stroke-width="3" stroke-dasharray="12 10"/><circle cx="500" cy="300" r="95" fill="none" stroke="#b8ccc5" stroke-width="3"/><circle cx="500" cy="300" r="7" fill="#b8ccc5"/>
      <path d="M0 175A125 125 0 0 1 0 425M1000 175A125 125 0 0 0 1000 425" fill="none" stroke="#b8ccc5" stroke-width="3"/>
      <path d="M0 190V12Q0 0 12 0H988Q1000 0 1000 12V190M0 410V588Q0 600 12 600H988Q1000 600 1000 588V410" fill="none" stroke="#456d65" stroke-width="14"/>
      <path d="M0 190V410" stroke="#537ad1" stroke-width="13"/><path d="M1000 190V410" stroke="#ed6845" stroke-width="13"/>
      <g id="hockey-left-paddle" class="hockey-paddle" transform="translate(160 300)" role="img" aria-label="Left paddle"><circle r="32" fill="#537ad1" stroke="#fff" stroke-width="5"/><circle r="20" fill="none" stroke="#33579e" stroke-width="5"/></g>
      <g id="hockey-right-paddle" class="hockey-paddle" transform="translate(840 300)" role="img" aria-label="Right paddle"><circle r="32" fill="#ed6845" stroke="#fff" stroke-width="5"/><circle r="20" fill="none" stroke="#b84b31" stroke-width="5"/></g>
      <circle id="hockey-puck" cx="500" cy="300" r="14" fill="#283d38" stroke="#fff" stroke-width="3"/>
      <text id="hockey-serve" x="500" y="240" text-anchor="middle" fill="#456d65" font-family="Segoe UI, sans-serif" font-size="32"></text>
    </svg></div>
    <div class="touch-controls" aria-label="Hockey movement controls"><button data-control="a" class="button">←</button><button data-control="w" class="button">↑</button><button data-control="s" class="button">↓</button><button data-control="d" class="button">→</button></div>
    <p class="muted">Move your mouse or drag on the rink · WASD / arrows also work · stay in your half. The match lasts up to two minutes. Keep the host tab awake.</p>`;
  $('extra-games').append(panel);
  let target = null, roundKey = '';
  const rink = $('hockey-rink');
  function point(event) {
    const box = rink.getBoundingClientRect();
    target = { x: Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1)), y: Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1)) };
  }
  rink.onpointerdown = event => { event.preventDefault(); rink.focus({ preventScroll: true }); rink.setPointerCapture(event.pointerId); point(event); };
  rink.onpointermove = event => { if (event.pointerType === 'mouse' || rink.hasPointerCapture(event.pointerId)) point(event); };
  rink.onpointerup = rink.onpointercancel = () => { target = null; };
  rink.onpointerleave = event => { if (!rink.hasPointerCapture(event.pointerId)) target = null; };
  $('start-hockey').onclick = () => { target = null; getArcade()?.hockey.start($('hockey-peer').value); rink.focus({ preventScroll: true }); };
  return {
    clearPointer() { target = null; },
    controls(selected, keys) {
      const hockey = getArcade()?.hockey; if (!hockey) return;
      if (selected === 'hockey' && target) hockey.input(target.x, target.y, false, true);
      else hockey.input(selected === 'hockey' ? Number(keys.has('d')) - Number(keys.has('a')) : 0, selected === 'hockey' ? Number(keys.has('s')) - Number(keys.has('w')) : 0);
      hockey.step(.05);
    },
    render(name) {
      const arcade = getArcade(), model = arcade.hockey, round = model.round;
      $('start-hockey').disabled = !arcade.peers.size;
      $('start-hockey').textContent = round ? 'Start new match' : 'Start match';
      const key = round ? `${round.author}:${round.clock}` : '';
      if (key !== roundKey) { target = null; roundKey = key; }
      const side = round?.players.findIndex(p => p.id === arcade.selfId) ?? -1;
      for (const [i, label] of ['left', 'right'].entries()) {
        const p = round?.players[i];
        $(`hockey-${label}-name`).textContent = p ? `${name(p.id)}${p.id === arcade.selfId ? ' (you)' : ''}` : `${label === 'left' ? 'Left' : 'Right'} player`;
        $(`hockey-${label}-score`).textContent = p?.score ?? 0;
        const paddle = $(`hockey-${label}-paddle`);
        paddle.setAttribute('transform', `translate(${p?.x ?? (i ? 840 : 160)} ${p?.y ?? 300})`);
        paddle.dataset.peerId = p?.id ?? '';
        paddle.classList.toggle('your-paddle', i === side);
      }
      $('hockey-puck').setAttribute('cx', round?.puck.x ?? 500); $('hockey-puck').setAttribute('cy', round?.puck.y ?? 300);
      $('hockey-clock').textContent = round ? `${Math.max(0, Math.ceil(RINK.seconds - round.time))}s · FIRST TO 5` : 'FIRST TO 5';
      $('hockey-serve').textContent = round && round.phase === 'running' && round.serveIn > 0 ? `Serve in ${Math.ceil(round.serveIn)}` : '';
      const role = side < 0 ? 'You’re watching' : `You defend ${side === 0 ? 'left (blue)' : 'right (coral)'}`;
      $('hockey-status').textContent = !round ? 'Choose a connected friend to take the other side.' : model.interrupted ? 'The host left. Start a new match with a connected friend.' : round.phase === 'finished' ? `${round.winner ? name(round.winner) + ' wins!' : 'A draw!'}${round.finishReason === 'opponent left' ? ' Opponent disconnected.' : ''}` : `${role} · ${round.serveIn > 0 && round.lastScorer ? name(round.lastScorer) + ' scored! · ' : ''}host: ${name(round.author)}`;
    },
  };
}
