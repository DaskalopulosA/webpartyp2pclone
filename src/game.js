// Each browser is the sole writer of its own counter. No leader or shared clock.
export function createGame(selfId, name) {
  const players = new Map([[selfId, { name, clicks: 0 }]]);
  return {
    players,
    snapshot: () => ({ v: 1, ...players.get(selfId) }),
    click() {
      const me = players.get(selfId);
      if (me.clicks < Number.MAX_SAFE_INTEGER) me.clicks += 1;
    },
    receive(peerId, data) {
      if (peerId === selfId || !data || data.v !== 1 ||
          typeof data.name !== 'string' || !data.name.trim() || data.name.length > 24 ||
          !Number.isSafeInteger(data.clicks) || data.clicks < 0) return false;
      const previous = players.get(peerId);
      // Absolute counters tolerate duplicates and late/out-of-order snapshots.
      if (previous && data.clicks <= previous.clicks) return false;
      players.set(peerId, { name: data.name.trim(), clicks: data.clicks });
      return true;
    },
    remove: peerId => { if (peerId !== selfId) players.delete(peerId); },
  };
}
