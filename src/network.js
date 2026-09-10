import { joinRoom, selfId, getRelaySockets } from 'trystero';

// Shared by local builds and GitHub Pages. Change this for an unrelated app.
export const APP_ID = 'webparty-arcade-8c5e94b1-v2';
export { selfId };

export function connectRoom(roomId, { onJoin, onLeave, onMessage, onStatus, onLog }) {
  let closed = false;
  const connected = new Set();
  const cleanup = [];
  const watchedSockets = new WeakSet();
  const started = Date.now();
  const counts = { sent: 0, received: 0 };
  const log = (message) => { if (!closed) onLog(message); };
  const room = joinRoom({
    appId: APP_ID,
    // Public STUN only: never silently route gameplay through a TURN server.
    rtcConfig: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ] },
  }, roomId, {
    onJoinError: ({ error, peerId }) => log(`Connection error for ${peerId}: ${error}`),
  });
  const action = room.makeAction('arcade-v2');
  action.onMessage = (data, { peerId }) => {
    if (closed || !connected.has(peerId)) return;
    counts.received += 1;
    onMessage(peerId, data);
  };

  function listen(target, type, fn) {
    target.addEventListener(type, fn);
    cleanup.push(() => target.removeEventListener(type, fn));
  }

  room.onPeerJoin = (peerId) => {
    if (closed) return;
    connected.add(peerId);
    log(`Peer connected: ${peerId} (WebRTC data channel open)`);
    const pc = room.getPeers()[peerId];
    if (pc) {
      const report = () => log(`Peer ${peerId}: RTC ${pc.connectionState}; ICE ${pc.iceConnectionState}`);
      listen(pc, 'connectionstatechange', report);
      listen(pc, 'iceconnectionstatechange', report);
      report();
    }
    onJoin(peerId);
    publishStatus();
  };
  room.onPeerLeave = (peerId) => {
    if (closed) return;
    connected.delete(peerId);
    log(`Peer left/disconnected: ${peerId}`);
    onLeave(peerId);
    publishStatus();
  };

  function relayStatus() {
    return Object.entries(getRelaySockets()).map(([url, socket]) => {
      if (!watchedSockets.has(socket)) {
        watchedSockets.add(socket);
        listen(socket, 'open', () => log(`Signaling relay open: ${url}`));
        listen(socket, 'close', (e) => log(`Signaling relay closed: ${url} (${e.code})`));
        listen(socket, 'error', () => log(`Signaling relay error: ${url}`));
        listen(socket, 'message', (event) => {
          try {
            const [type, id, accepted, reason] = JSON.parse(event.data);
            if (type === 'NOTICE') log(`Relay notice ${url}: ${String(id).slice(0, 180)}`);
            if (type === 'CLOSED' || (type === 'OK' && accepted === false)) {
              log(`Relay rejected signaling ${url}: ${String(reason ?? accepted).slice(0, 180)}`);
            }
          } catch { /* Signaling content belongs to Trystero. */ }
        });
        log(`Signaling relay ${['connecting', 'open', 'closing', 'closed'][socket.readyState]}: ${url}`);
      }
      return { url, state: ['connecting', 'open', 'closing', 'closed'][socket.readyState] };
    });
  }

  function snapshot() {
    const peers = Object.entries(room.getPeers()).map(([id, pc]) => ({
      id, connection: pc.connectionState, ice: pc.iceConnectionState,
      signaling: pc.signalingState,
    }));
    return { appId: APP_ID, roomId, selfId, peers, relays: relayStatus(),
      online: navigator.onLine, seconds: Math.floor((Date.now() - started) / 1000), ...counts };
  }
  function publishStatus() { if (!closed) onStatus(snapshot()); }
  listen(window, 'online', () => { log('Browser reports online. Discovery will retry.'); publishStatus(); });
  listen(window, 'offline', () => { log('Browser reports offline. Peers may disconnect.'); publishStatus(); });
  const timer = setInterval(publishStatus, 1000);
  log(`Joined room ${roomId}; session ${selfId}; public Nostr discovery; STUN only.`);
  // Give the caller time to store this connection before callbacks can use it.
  queueMicrotask(publishStatus);

  return {
    async send(data, peerId) {
      if (closed || !connected.size) return;
      try {
        await action.send(data, peerId ? { target: peerId } : undefined);
        counts.sent += 1;
      } catch (error) { log(`Send failed: ${error.message}. The next snapshot will retry.`); }
    },
    snapshot,
    async ping(peerId) {
      if (closed || !connected.has(peerId)) throw new Error('That player is no longer connected.');
      let timeout;
      try {
        return await Promise.race([room.ping(peerId), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('No reply within 5 seconds. Try again when your friend is connected.')), 5000);
        })]);
      } finally { clearTimeout(timeout); }
    },
    async leave() {
      if (closed) return;
      log('Leaving room and closing connections.');
      closed = true;
      clearInterval(timer);
      cleanup.forEach(fn => fn());
      connected.clear();
      await room.leave();
    },
  };
}
