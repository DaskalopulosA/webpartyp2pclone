import './style.css';
import { createArcade, GAMES } from './arcade.js';
import { mountGames } from './views.js';
import { newRoomCode, parseRoomCode, roomFromHash, inviteUrl } from './room-code.js';

const $ = (id) => document.getElementById(id);
let connection, arcade, myId, syncTimer, simulationTimer, joining = false, lastStatus;
let selected = 'button', renderPending = false;
const views = mountGames(() => arcade, () => connection, notice, id => {
  selected = id; views.clearControls(); arcade?.select(id); notice('');
});
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; if (arcade) renderGame(); });
}
const events = [];
const initialRoom = roomFromHash(location.hash);
if (initialRoom) {
  $('room-input').value = initialRoom;
  $('join-title').textContent = 'Your party awaits.';
  $('name').focus();
} else if (location.hash) notice('That invite has an invalid room code. Enter an eight-character code or create a room.');

function notice(message) { $('notice').textContent = message; }
function log(message) {
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  events.push(line);
  if (events.length > 120) events.shift();
  $('logs').textContent = events.join('\n');
  $('logs').scrollTop = $('logs').scrollHeight;
  console.info('[WebParty]', message);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderGame() {
  const ids = [myId, ...arcade.peers];
  const scoreOf = id => selected === 'button' ? arcade.button.players.get(id)?.clicks ?? 0
    : selected === 'cursors' ? arcade.cursors.states.get(id)?.score ?? 0
    : selected === 'arena' ? Math.ceil(arcade.arena.round?.players.find(p => p.id === id)?.hp ?? 0)
    : selected === 'jump' ? Math.floor(arcade.jump.round?.players.find(p => p.id === id)?.best ?? 0)
    : selected === 'hockey' ? arcade.hockey.round?.players.find(p => p.id === id)?.score ?? null : null;
  ids.sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0) || a.localeCompare(b));
  $('player-count').textContent = ids.length;
  $('total').textContent = [...arcade.button.players.values()].reduce((total, p) => total + BigInt(p.clicks), 0n).toLocaleString();
  $('players').replaceChildren(...ids.map(id => {
    const profile = arcade.profiles.get(id);
    const name = profile?.name ?? 'Connecting…';
    const row = element('li', `player ${id === myId ? 'is-you' : ''}`); row.dataset.peerId = id;
    const avatar = element('span', 'avatar', name.slice(0, 1).toUpperCase());
    avatar.style.setProperty('--hue', [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 360);
    const identity = element('div', 'player-identity');
    const label = element('strong', 'player-name', name);
    if (id === myId) label.append(element('small', 'you-label', 'YOU'));
    identity.append(label, element('span', 'player-meta', GAMES.find(g => g.id === profile?.game)?.title ?? 'Joining the party'));
    row.append(avatar, identity, element('strong', 'player-score', scoreOf(id)?.toLocaleString() ?? ''));
    return row;
  }));
  views.render(selected);
}

function renderStatus(status) {
  lastStatus = status;
  const count = status.peers.filter(p => p.connection === 'connected').length;
  const open = status.relays.filter(r => r.state === 'open').length;
  $('play-state').textContent = count ? 'LIVE WITH FRIENDS' : 'SOLO PRACTICE';
  $('network-status').textContent = count ? `${count} direct peer${count === 1 ? '' : 's'}` : !status.online ? 'Browser offline' : 'Discovering peers';
  $('connection-dot').classList.toggle('connected', count > 0);
  $('connection-hint').textContent = count
    ? 'You’re connected. Each press travels directly to the other browsers.'
    : !status.online ? 'Your browser reports it is offline. Reconnect to the internet to find friends.'
    : status.seconds < 25 ? 'Invite a friend or open the same room in another tab. Discovery can take a little while.'
    : !open ? 'No discovery relay is open. Check your internet connection, VPN, or blocker. Open Connection lab for details; discovery retries automatically.'
    : 'Still alone? Confirm the same room code and keep both tabs awake. A relay can be open but reject signaling. Check Connection lab; a different network may help.';
  const rows = [
    ['Room ID', status.roomId], ['Your peer ID', status.selfId], ['App namespace', status.appId],
    ['Transport', 'WebRTC data channel · STUN only · no TURN'],
    ['Browser network hint', status.online ? 'Online (not a connectivity guarantee)' : 'Offline'],
    ['Game messages', `${status.sent} sent / ${status.received} received`],
    ['Playing here', GAMES.find(g => g.id === selected)?.title ?? selected],
  ];
  $('network-info').replaceChildren(...rows.flatMap(([key, value]) => [element('dt', '', key), element('dd', '', value)]));
  $('relays').replaceChildren(...status.relays.map(r => element('li', '', `${r.state.padEnd(10)} ${r.url}`)));
  $('peer-details').replaceChildren(...(status.peers.length ? status.peers.map(p => element('li', '', `${p.id}\nRTC ${p.connection} · ICE ${p.ice} · signaling ${p.signaling}`)) : [element('li', '', 'No peer data channels yet. A room can exist with just you in it.')]));
}

async function enterRoom(code) {
  if (joining || connection) return;
  if (!window.isSecureContext || !window.crypto?.subtle || !window.RTCPeerConnection) {
    notice('This browser needs WebRTC and a secure page. Use localhost on this computer, or the HTTPS GitHub Pages link on another device.');
    return;
  }
  joining = true;
  document.querySelectorAll('#lobby button').forEach(b => b.disabled = true);
  notice('');
  try {
    // Load WebRTC after capability checks so unsupported browsers get a useful message.
    const { connectRoom, selfId } = await import('./network.js');
    myId = selfId;
    const name = $('name').value.trim().slice(0, 24) || `Guest ${selfId.slice(0, 4)}`;
    arcade = createArcade(myId, name, { send: (packet, peerId) => connection?.send(packet, peerId), changed: scheduleRender, log });
    connection = connectRoom(code, {
      onJoin: id => arcade.join(id),
      onLeave: id => arcade.leave(id),
      onMessage: (id, data) => arcade.receive(id, data),
      onStatus: renderStatus, onLog: log,
    });
    history.replaceState(null, '', inviteUrl(location.href, code));
    $('room-code').textContent = code;
    $('lobby').hidden = true;
    $('room-view').hidden = false;
    renderGame();
    syncTimer = setInterval(() => arcade.sync(), 5000);
    simulationTimer = setInterval(() => views.controls(selected), 50);
    $('tap').focus({ preventScroll: true });
  } catch (error) {
    log(`Unable to join: ${error.message}`);
    notice(`Could not start the room: ${error.message}. Try a current browser and check Connection lab or the browser console.`);
  } finally {
    joining = false;
    document.querySelectorAll('#lobby button').forEach(b => b.disabled = false);
  }
}

$('create').addEventListener('click', () => enterRoom(newRoomCode()));
$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = parseRoomCode($('room-input').value);
  if (!code) { notice('Enter an eight-character room code or a full invite URL.'); return; }
  void enterRoom(code);
});
$('tap').addEventListener('click', () => {
  if (!arcade || !connection) return;
  arcade.click();
  log(`Your button press: ${arcade.button.snapshot().clicks} clicks; broadcasting state`);
});
$('leave').addEventListener('click', async () => {
  $('leave').disabled = true;
  clearInterval(syncTimer); clearInterval(simulationTimer); views.clearControls();
  try { await connection?.leave(); }
  finally {
    // A fresh document also gives a fresh peer ID and a zeroed counter.
    const url = new URL(location.href);
    url.hash = '';
    location.replace(url.href);
  }
});

async function copy(text, message) {
  try { await navigator.clipboard.writeText(text); notice(message); }
  catch {
    // A selectable field works when clipboard permission is unavailable.
    notice('Clipboard unavailable. Copy the selected text below.');
    let field = $('manual-copy');
    if (!field) {
      field = element('textarea'); field.id = 'manual-copy';
      field.readOnly = true; field.setAttribute('aria-label', 'Text to copy');
      $('notice').after(field);
    }
    field.value = text; field.focus(); field.select();
  }
}
$('copy-code').addEventListener('click', () => copy($('room-code').textContent, 'Room code copied.'));
$('copy-link').addEventListener('click', () => copy(location.href, 'Invite link copied. Send it to your friends.'));
$('copy-debug').addEventListener('click', () => copy(JSON.stringify({ ...lastStatus, logs: events }, null, 2), 'Diagnostics copied. Includes your room code and peer IDs.'));
window.addEventListener('pagehide', () => { clearInterval(syncTimer); clearInterval(simulationTimer); views.clearControls(); void connection?.leave(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
window.addEventListener('hashchange', () => location.reload());
