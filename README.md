# WebParty / Minigame Arcade

[Play the live demo](https://daskalopulosa.github.io/webpartyp2pclone/)

Eight browser-to-browser minigames in one shared room. All deployed files are static;
no application backend, database, TURN service, API keys, or accounts are required.
Public Nostr relays provide discovery; game traffic uses direct WebRTC.

## The games and the capabilities they demonstrate

| Game | Play | Capability |
| --- | --- | --- |
| Button Club | Click the big button; compare counts. | Player-owned state, broadcast, duplicate-safe counters |
| Cursor Chase | Move around and collect your gold dots. | Continuous position updates, presence, independent player targets |
| Pixel Party | Paint a 12 × 8 canvas together. | Concurrent shared edits, deterministic conflict resolution, late-join snapshots |
| Secret Signal | Send a symbol clue to one friend; they get one guess. | Targeted private delivery, sender-bound replies; other peers get no clue data |
| Turn Tiles | Play three-in-a-row against a friend; others watch. | Validated turns, rounds, win/draw detection, spectator state |
| Echo Guess | Guess a friend's round-trip latency, then ping them. | Targeted request/response, timeouts, actual WebRTC round-trip measurement |
| Last Light | Scavenge health/ammo, dodge the shrinking storm, outlast rivals. | Host-authoritative movement, projectiles, collisions, pickups, elimination |
| Sky Sprint | Steer an auto-bouncing character to 3,000 m before your friends. | Host-authoritative physics, platform collisions, checkpoints, race results |

Create/join a room first, then choose any card. Switching games keeps the room,
connections, and other games' state. Each player chooses their own view; the party
list shows which game they are viewing. All messages are routed even while another
game is open. The network namespace is versioned; old Button Club tabs must reload
to connect to this arcade release.

Last Light is a small survival/battle-royale interpretation of the requested Hunger
Games type game; Sky Sprint is an original vertical platform racer inspired by the
Doodle Jump style of play. Both use simple original canvas graphics.

### Competitive game controls and rounds

- **Last Light:** WASD/arrows to move; hold Space or the Fire button to shoot toward
  the nearest surviving opponent. Orange supply crates restore 25 health and add
  8 shots. The purple storm deals damage outside the shrinking safe circle. Last
  survivor wins; at 90 seconds, the survivor with most health wins (equal health draws).
- **Sky Sprint:** A/D or left/right arrows to steer; jumping is automatic. Orange
  platforms mark checkpoints every 500 m. Falling too far respawns at your checkpoint.
  First to 3,000 m wins; at 90 seconds, the highest achieved altitude wins.
- On touch devices, hold the on-screen movement/Fire buttons. Canvas gameplay also
  has a visible scoreboard and round status. Cursor Chase and Pixel Party support
  pointer/touch input; native buttons provide keyboard access to other games.
- The browser that starts a round becomes its host. It includes up to eight currently
  connected players (including players viewing another game); select the same card
  before starting together. A later arrival watches until the next round. One player
  can start a solo practice. Anyone may start a new round for that game.
- Keep the host page visible and awake. Simulation runs at 20 steps/second, with
  authoritative snapshots at 10/second. Suspended/background browsers can slow or
  pause a round. If the host leaves, the UI reports an interrupted round; another
  player starts a fresh round. There is no silent host migration. Other players who
  leave are eliminated from the arena or excluded from the platform race results.

## Run locally

Install **Node.js 24 LTS** (minimum 22.12), then:

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite (normally `http://localhost:5173`).
Internet access is still needed for public peer discovery. Vite is only a local
static development server; it never handles players or game messages.

```sh
npm test              # deterministic counter / room-link checks
npm run build        # static output in dist/
npm run preview      # serve that production output locally, normally port 4173
```

Do not open `index.html` using `file://`. Use localhost or HTTPS. The browser needs
WebRTC and Web Crypto. LAN HTTP addresses generally are not secure contexts; for
two devices, use the HTTPS Pages deployment. No camera/microphone permission is needed.

## Test with two tabs

1. In tab A, enter a nickname and choose **Start a new room**. Click a few times.
2. Copy the invite link into tab B. Enter another nickname and choose **Join**.
   Alternatively, paste the code or full URL into the room field on the landing page.
3. Allow roughly 5–30 seconds for discovery (public relays can take longer).
   Both players should appear. Tab B should receive A's existing count.
4. Click in either tab, or both quickly. Both scoreboards should converge.
5. Expand **Connection lab**. The tabs must have different peer IDs, matching room
   IDs, and a connected WebRTC peer. An open signaling socket alone is not a peer.
6. Leave from B. A should remove B and B's count. Refresh B and join again: it is a
   new player with a new ID and zero clicks. The creator can leave without ending
   the room for other connected players.

Player IDs come from Trystero's random per-document `selfId`, never from an IP,
nickname, cookie, localStorage, or shared sessionStorage. Duplicated tabs remain
independent. Room links prefill the room; the user explicitly joins after naming
themselves. A code identifies a rendezvous, not a server-side room record.

## Test across devices

1. Deploy to GitHub Pages below. Open the same HTTPS invite on a computer and phone.
2. Start on the same Wi-Fi; then try one device on mobile data to exercise NAT traversal.
3. Keep both pages foregrounded, wait for a direct peer, and click in each direction.
4. If they cannot connect, compare codes and Connection lab logs, try another network,
   and check VPN/firewall/browser blockers. A successful same-machine test does not
   establish compatibility with every router or cellular network.

To inspect the transport itself, use Chromium's `chrome://webrtc-internals` (Edge:
`edge://webrtc-internals`) or Firefox's `about:webrtc`. Inspect data-channel counters
and the selected ICE candidate pair. This app configures STUN only, so a connection
cannot fall back to a TURN-relayed game channel.

## Deploy to GitHub Pages

The repository includes `.github/workflows/pages.yml`. It tests and builds on pull
requests and deploys `dist/` on pushes to `main` or a manual workflow run on `main`.

1. Create an empty **public** GitHub repository for free GitHub Pages hosting.
2. In this local repository, create a commit if needed, add the GitHub remote and push:

   ```sh
   git add .
   git commit -m "Build static P2P party-game proof of concept"
   git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```

3. In the GitHub repository, select **Settings → Pages → Source → GitHub Actions**.
4. In **Actions**, rerun the deployment if the initial push preceded that setting.
   Open the deployment URL, normally `https://YOUR-USER.github.io/YOUR-REPO/`.

No custom token, API key, or repository secret is required. GitHub supplies the
workflow's short-lived deployment identity automatically; it is never in the app.
`base: './'` produces relative asset URLs. Rooms use `#room=XXXXXXXX`, so invitations
preserve the repository subpath and need no rewrite rules or custom 404 page.
Local and deployed builds can join each other using the same room code and app ID.
Share the deployed HTTPS URL for other devices; a localhost invite points to the
recipient's own computer.

## Architecture and traffic

```text
GitHub Pages ── HTML / CSS / JS ──> each browser
Browser A <── public Nostr relays: discovery + encrypted signaling ──> Browser B
Browser A/B ── public STUN: discover network candidates
Browser A <════ direct encrypted WebRTC data channel: game state ════> Browser B
```

- `src/network.js`: Trystero room lifecycle, generic packet transport, targeted pings,
  and relay/peer diagnostics. It contains no game rules.
- `src/arcade.js`: small shared session layer: profiles, a game registry, message
  routing, join/leave callbacks, and repair snapshots.
- `src/game.js` and `src/games/`: pure game models. `competition.js` shares only the
  round/input/snapshot lifecycle between the two real-time competitive games.
- `src/main.js` and `src/views.js`: room UI, game selection, rendering, and controls.
- `src/room-code.js`: random room codes and hash URL helpers.

The session layer is the beginning of a reusable framework, not a complete engine.
A game registers a model with `receive(type, data, sender)`, optional `sync(peerId)`,
and local action methods. The session supplies a game-scoped send callback and a
change notification. This keeps rules testable without a browser or network.

Trystero derives discovery topics from the application namespace and room ID. Public
Nostr relays exchange offers, answers and ICE candidates; the library encrypts
signaling with a room-derived key. It generates ephemeral protocol keys internally;
there is no configured Nostr key or account. Google and Cloudflare STUN endpoints
help WebRTC find network candidates. These public third-party services must be
reachable, but you deploy and maintain none of them.

All names, scores, drawing edits, cursor positions, clues, turns, player controls,
and simulation snapshots use WebRTC data channels. Public WebSockets only handle
signaling. Direct private delivery uses a target peer ID; clue payloads are never
included in broadcast repair snapshots or the application log. Connected recipients
can inspect their own messages; this is not an anti-cheat or sealed-choice protocol.
The bundled app needs no runtime CDN. Connections form a full mesh.

Packets have a version, game ID, event type and payload. The sender ID comes from
the transport. Rules validate payloads and turn/round ownership. Snapshots on join
and every five seconds repair missed initial state. Button counts merge by maximum;
pixel cells merge by Lamport timestamp with peer-ID tie-breaks. Cursor motion is
limited to 20 updates/second. Turn Tiles accepts moves only from the expected seat;
participants supply validated history to late spectators. Simultaneous round starts
resolve by a logical clock and peer-ID tie-break. In competitive games, only the
round author may broadcast authoritative state; other players send controls to it.

Totals and membership are local views of directly connected peers. Partial meshes
can produce different presence/counter views; competitive games require a direct
connection to their host. There is no global quorum or relay forwarding. Click totals
decrease when a player leaves; the shared canvas remains in other peers' memory.

## Diagnostics and limitations

Connection lab shows the namespace, room and local peer IDs, each established peer's
RTC/ICE/signaling state, public relay URLs and socket states, sent/received message
counts, and a bounded event log. It captures relay errors/rejections, peer joins and
leaves, game events, and send failures. High-frequency simulation/movement payloads and private clue contents are not logged. **Copy diagnostics** includes the room
code and IDs. Peer details appear once the data channel opens; Trystero does not
expose every in-progress candidate connection through its public room API.

- Public relays can reject traffic, rate-limit, disappear, or be blocked. An open
  socket does not prove that relay accepts signaling. Retry later or refresh both
  tabs; the default relay list lives in the pinned Trystero package.
- STUN cannot solve every NAT/firewall combination. Symmetric NAT, blocked UDP,
  carrier networks, VPNs and enterprise firewalls can prevent direct connections.
  With **no TURN**, some device pairs will fail. That is an explicit constraint,
  not a promise of universal connectivity.
- Devices sleeping or browsers throttling background tabs can delay state and
  disconnect detection. Closing a tab abruptly can leave a stale player briefly.
- State exists only in memory. There is no reconnect persistence or room history.
  Everyone leaving loses all state. Keep demos to a few friends; full mesh grows
  as `n × (n − 1) / 2` connections and is not a large-room architecture.
- Peers can cheat by modifying their client, and a competitive round host can forge
  outcomes. Payload/turn checks are not anti-cheat, authentication, or a complete
  defense against resource exhaustion. Anyone with the room
  code can join. Room codes are invitations, not authentication or secure secrets.
- WebRTC peers can learn network addresses during connection setup; IPs are not
  player identity. Public signaling/STUN services can observe connection metadata.

## Browser regression check

```sh
npx playwright install chromium
npm run test:browser
```

This builds/runs the production app and uses real public signaling and native
WebRTC. It checks separate IDs, bidirectional clicks, room isolation, late canvas state,
private delivery with a third observer, cursors, pings, turn enforcement and spectators,
both competitive games, host departure/restart, subfolder deployment, mobile width,
keyboard input, and no uncaught page errors. It inspects native data-channel statistics and closes/blocks
signaling sockets after connection to verify gameplay continues directly. Expect
public-network variability; this integration check is separate from deterministic
CI tests. Set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge instead of Chromium,
or `PLAYWRIGHT_BASE_URL` to test an already running local server.

## Sensible next steps

1. Measure connection success, latency and host performance on real phones/networks.
2. Add a ready check and explicit player selection before competitive rounds.
3. Improve movement smoothing/prediction, mobile camera framing and accessibility.
4. Add message budgets, room limits and abuse controls before opening larger rooms.
5. Decide whether persistence, fair competition or automatic host migration is worth
   the extra protocol complexity. Better NAT coverage requires revisiting no-TURN.

References: [Trystero documentation](https://github.com/dmotz/trystero),
[signaling architecture](https://trystero.dev/guides/webrtc-without-signaling-server/),
[GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
