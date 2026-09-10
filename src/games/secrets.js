export const SIGNALS = [
  { name: 'Sun', icon: '☀', clue: 'I turn night into day.' },
  { name: 'Moon', icon: '☾', clue: 'I change shape through the month.' },
  { name: 'Star', icon: '✦', clue: 'Make a wish when I fall.' },
  { name: 'Cloud', icon: '☁', clue: 'I carry the rain.' },
];
const validId = value => typeof value === 'string' && value.length > 0 && value.length < 80;

export function createSecrets(selfId, send, changed, hasPeer) {
  const inbox = new Map(), outbox = new Map();
  function trim(map) { if (map.size > 12) map.delete(map.keys().next().value); }
  return {
    inbox, outbox,
    challenge(peerId, symbol) {
      if (!hasPeer(peerId) || peerId === selfId || !Number.isInteger(symbol) || !SIGNALS[symbol]) return;
      const id = crypto.randomUUID();
      outbox.set(id, { peerId, symbol, result: null }); trim(outbox);
      send('challenge', { id, symbol }, peerId); changed();
    },
    guess(id, symbol) {
      const item = inbox.get(id);
      if (!item || item.result !== null || !hasPeer(item.peerId) || !SIGNALS[symbol]) return;
      item.result = symbol === item.symbol;
      send('answer', { id, symbol }, item.peerId); changed();
    },
    receive(type, data, sender) {
      if (!data || !validId(data.id) || !Number.isInteger(data.symbol) || !SIGNALS[data.symbol]) return;
      if (type === 'challenge' && !inbox.has(data.id)) {
        inbox.set(data.id, { peerId: sender, symbol: data.symbol, result: null }); trim(inbox); changed();
      } else if (type === 'answer') {
        const item = outbox.get(data.id);
        if (!item || item.peerId !== sender || item.result !== null) return;
        item.result = item.symbol === data.symbol; changed();
      }
    },
    // Private inboxes are intentionally absent from public repair snapshots.
  };
}
