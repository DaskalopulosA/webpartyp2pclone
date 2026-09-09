# WebParty / Button Club

[Play the live demo](https://daskalopulosa.github.io/webpartyp2pclone/)

A deliberately tiny browser-to-browser party game. Create a room, share its code or
link, and press a button. Everyone sees the connected players and their click counts.
No host election, accounts, persistent scores, or framework scaffolding.

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

- `src/network.js`: Trystero Nostr adapter, room lifecycle, message transport,
  relay/peer diagnostics. It does not know about clicking or scoreboard rules.
- `src/game.js`: a small in-memory map of player-owned counters, snapshot validation,
  and duplicate/stale-update handling. No network or DOM dependency.
- `src/main.js`: DOM rendering, buttons, room lifecycle, and snapshot exchange.
- `src/room-code.js`: eight-character random room codes and hash URL helpers.

Trystero derives discovery topics from a shared application namespace and room ID.
Its public Nostr relays exchange connection offers, answers, and ICE candidates;
Trystero encrypts signaling using a room-derived key. No Nostr account or configured
key is required. The library generates any ephemeral protocol keys in the browser.
Google and Cloudflare STUN endpoints help WebRTC find usable network candidates.
These third-party services exist and must be reachable, but you deploy and maintain
none of them. There is no application WebSocket backend, database, function, or TURN
service. Nostr uses public WebSocket connections only for discovery/signaling.

Nicknames and counters travel exclusively through Trystero actions over reliable,
ordered WebRTC data channels. Relay sockets may stay open for new arrivals and
reconnection, but they never carry gameplay. Bundled assets require no runtime CDN.
The browsers form a full mesh: one direct connection for every connected pair.

Each player broadcasts `{v: 1, name, clicks}` immediately on a click, directly to a
new peer on connection, and every five seconds as a repair snapshot. Receivers bind
the update to the transport's sender ID, validate it, and take the maximum count for
that sender. Concurrent clicks from different players cannot overwrite each other.
The total is derived locally from the currently connected players, so it can decrease
when someone leaves. Partial meshes/network partitions can show different totals;
this POC has no global authoritative membership or indirect forwarding.

## Diagnostics and limitations

Connection lab shows the namespace, room and local peer IDs, each established peer's
RTC/ICE/signaling state, public relay URLs and socket states, sent/received message
counts, and a bounded event log. It captures relay errors/rejections, peer joins and
leaves, changed scores, and send failures. **Copy diagnostics** includes the room
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
- Peers can cheat by changing their own client/counter. Payload checks prevent
  malformed state, not dishonest play or resource exhaustion. Anyone with the room
  code can join. Room codes are invitations, not authentication or secure secrets.
- WebRTC peers can learn network addresses during connection setup; IPs are not
  player identity. Public signaling/STUN services can observe connection metadata.

## Browser regression check

```sh
npx playwright install chromium
npm run test:browser
```

This builds/runs the production app and uses real public signaling and native
WebRTC. It checks separate IDs in one browser context, two-way and simultaneous
clicks, late state, room isolation, leaving, mobile width, keyboard input, and no
uncaught page errors. It inspects native data-channel statistics and closes/blocks
signaling sockets after connection to verify gameplay continues directly. Expect
public-network variability; this integration check is separate from deterministic
CI tests. Set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge instead of Chromium,
or `PLAYWRIGHT_BASE_URL` to test an already running local server.

## Sensible next steps

1. Measure connection success and time-to-connect on real device/network pairs.
2. Add one more tiny game using the same transport; only then extract shared APIs.
3. Add room size limits, message size/rate budgets, and clearer reconnect feedback.
4. Decide whether a future game needs a host, rounds, or consensus before introducing
   authority/migration complexity. Decide explicitly whether better NAT coverage
   warrants relaxing the no-TURN constraint.

References: [Trystero documentation](https://github.com/dmotz/trystero),
[signaling architecture](https://trystero.dev/guides/webrtc-without-signaling-server/),
[GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
