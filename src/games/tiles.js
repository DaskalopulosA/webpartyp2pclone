const wins = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 64;
export function resultOf(moves) {
  const board = Array(9).fill('');
  moves.forEach((cell, i) => { board[cell] = i % 2 ? 'O' : 'X'; });
  for (const line of wins) if (board[line[0]] && line.every(i => board[i] === board[line[0]])) return board[line[0]];
  return moves.length === 9 ? 'draw' : null;
}
function validRound(data) {
  if (!data || !Number.isSafeInteger(data.clock) || data.clock < 1 || !validId(data.author) || !Array.isArray(data.players) || data.players.length !== 2 || !data.players.every(validId) || data.players[0] !== data.author || data.players[0] === data.players[1] || !Array.isArray(data.moves) || data.moves.length > 9) return false;
  const prefix = [];
  for (const move of data.moves) {
    if (!Number.isInteger(move) || move < 0 || move > 8 || prefix.includes(move) || resultOf(prefix)) return false;
    prefix.push(move);
  }
  return true;
}
const compare = (a, b) => a.clock - b.clock || (a.author > b.author ? 1 : a.author < b.author ? -1 : 0);

export function createTiles(selfId, send, changed, hasPeer) {
  let round = null, clock = 0;
  function publish(type, data, peerId) { send(type, data, peerId); changed(); }
  return {
    get round() { return round; },
    start(peerId) {
      if (!hasPeer(peerId) || peerId === selfId || clock >= Number.MAX_SAFE_INTEGER) return;
      round = { clock: ++clock, author: selfId, players: [selfId, peerId], moves: [] };
      publish('round', round);
    },
    move(cell) {
      if (!round || !Number.isInteger(cell) || cell < 0 || cell > 8 || resultOf(round.moves) || round.moves.includes(cell) || round.players[round.moves.length % 2] !== selfId || !round.players.every(id => id === selfId || hasPeer(id))) return;
      const move = { clock: round.clock, author: round.author, step: round.moves.length, cell };
      round.moves.push(cell); publish('move', move);
    },
    sync(peerId) { if (round && round.players.includes(selfId)) send('snapshot', round, peerId); },
    receive(type, data, sender) {
      if (type === 'round' || type === 'snapshot') {
        if (!validRound(data) || !data.players.includes(sender) || (type === 'round' && (sender !== data.author || data.moves.length !== 0))) return;
        clock = Math.max(clock, data.clock);
        const order = round ? compare(data, round) : 1;
        if (order < 0) return;
        if (order === 0 && (JSON.stringify(data.players) !== JSON.stringify(round.players) || data.moves.length <= round.moves.length || !round.moves.every((cell, i) => data.moves[i] === cell))) return;
        round = { ...data, players: [...data.players], moves: [...data.moves] }; changed();
      } else if (type === 'move' && round && data) {
        if (data.clock !== round.clock || data.author !== round.author || data.step !== round.moves.length || sender !== round.players[data.step % 2] || !Number.isInteger(data.cell) || data.cell < 0 || data.cell > 8 || round.moves.includes(data.cell) || resultOf(round.moves)) return;
        round.moves.push(data.cell); changed();
      }
    },
  };
}
