export const targetFor = score => ({ x: .14 + ((score * 37 + 19) % 73) / 100, y: .16 + ((score * 23 + 31) % 67) / 100 });

export function createCursors(selfId, send, changed) {
  const states = new Map([[selfId, { x: .5, y: .5, score: 0, seq: 0 }]]);
  function publish() { const me = states.get(selfId); me.seq++; send('motion', { ...me }); changed(); }
  return {
    states,
    move(x, y) {
      const me = states.get(selfId);
      me.x = Math.max(0, Math.min(1, x)); me.y = Math.max(0, Math.min(1, y)); publish();
    },
    collect() { states.get(selfId).score++; publish(); },
    sync(peerId) { send('motion', { ...states.get(selfId) }, peerId); },
    remove(peerId) { states.delete(peerId); },
    receive(type, data, sender) {
      if (type !== 'motion' || !data || ![data.x, data.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1) || !Number.isSafeInteger(data.seq) || data.seq < 0 || !Number.isSafeInteger(data.score) || data.score < 0) return;
      if (states.has(sender) && states.get(sender).seq >= data.seq) return;
      states.set(sender, { x: data.x, y: data.y, score: data.score, seq: data.seq }); changed();
    },
  };
}
