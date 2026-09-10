import { createGame } from './game.js';
import { createPixels } from './games/pixels.js';
import { createCursors } from './games/cursors.js';
import { createSecrets } from './games/secrets.js';
import { createTiles } from './games/tiles.js';
import { createCompetition } from './games/competition.js';
import { createHockey } from './games/hockey.js';

export const GAMES = [
  { id: 'button', title: 'Button Club', icon: '↖', feature: 'Shared counters', description: 'A familiar button. A little friendly competition.' },
  { id: 'cursors', title: 'Cursor Chase', icon: '⌁', feature: 'Live movement', description: 'Chase your gold dots. Watch your friends move.' },
  { id: 'pixels', title: 'Pixel Party', icon: '▦', feature: 'Shared canvas', description: 'Make a tiny masterpiece, one square at a time.' },
  { id: 'secrets', title: 'Secret Signal', icon: '✉', feature: 'Private messages', description: 'Send a clue to one friend. Can they crack it?' },
  { id: 'tiles', title: 'Turn Tiles', icon: '○', feature: 'Turns & spectators', description: 'Three in a row. Two players. Everyone can watch.' },
  { id: 'echo', title: 'Echo Guess', icon: '↔', feature: 'Request & response', description: 'Guess how quickly your friend’s browser answers.' },
  { id: 'arena', title: 'Last Light', icon: '◎', feature: 'Survival arena', description: 'Scavenge supplies. Dodge the storm. Be the last one standing.' },
  { id: 'jump', title: 'Sky Sprint', icon: '↑', feature: 'Platform race', description: 'Bounce your way to the top before your friends do.' },
  { id: 'hockey', title: 'Table Hockey', icon: '◉', feature: 'Puck & paddle physics', description: 'Defend your half. Find the angle. First to five wins.' },
];

// A small routing/lifecycle layer shared by the demos, not a general game engine.
export function createArcade(selfId, name, { send, changed, log }) {
  const peers = new Set();
  const profiles = new Map([[selfId, { name, game: 'button', seq: 0 }]]);
  const hasPeer = id => peers.has(id);
  const channel = game => (type, data, target) => {
    void send({ v: 2, game, type, data }, target);
  };
  const button = createGame(selfId, name);
  const modules = {
    pixels: createPixels(selfId, channel('pixels'), changed),
    cursors: createCursors(selfId, channel('cursors'), changed),
    secrets: createSecrets(selfId, channel('secrets'), changed, hasPeer),
    tiles: createTiles(selfId, channel('tiles'), changed, hasPeer),
    arena: createCompetition('arena', selfId, channel('arena'), changed, () => [...peers]),
    jump: createCompetition('jump', selfId, channel('jump'), changed, () => [...peers]),
    hockey: createHockey(selfId, channel('hockey'), changed, () => [...peers]),
  };
  function sync(target) {
    channel('presence')('profile', { ...profiles.get(selfId) }, target);
    channel('button')('state', button.snapshot(), target);
    Object.values(modules).forEach(module => module.sync?.(target));
  }
  return {
    selfId, peers, profiles, button, ...modules, sync,
    select(id) {
      if (!GAMES.some(g => g.id === id)) return;
      const profile = profiles.get(selfId); profile.game = id; profile.seq++;
      channel('presence')('profile', { ...profile }); changed();
    },
    click() { button.click(); channel('button')('state', button.snapshot()); changed(); },
    join(id) { peers.add(id); sync(id); changed(); },
    leave(id) {
      peers.delete(id); profiles.delete(id); button.remove(id); modules.cursors.remove(id); changed();
    },
    receive(sender, packet) {
      if (!peers.has(sender) || !packet || packet.v !== 2 || typeof packet.type !== 'string') return;
      const { game, type, data } = packet;
      if (game === 'presence' && type === 'profile') {
        if (!data || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 24 || !GAMES.some(g => g.id === data.game) || !Number.isSafeInteger(data.seq) || data.seq < 0 || (profiles.has(sender) && data.seq <= profiles.get(sender).seq)) return;
        profiles.set(sender, { name: data.name.trim(), game: data.game, seq: data.seq }); changed();
      } else if (game === 'button' && type === 'state') {
        if (button.receive(sender, data)) changed();
      } else if (Object.hasOwn(modules, game)) modules[game].receive(type, data, sender);
      if (game !== 'cursors' && type !== 'snapshot' && type !== 'input' && game !== 'presence') log(`${game}: ${type} from ${sender}`);
    },
  };
}
