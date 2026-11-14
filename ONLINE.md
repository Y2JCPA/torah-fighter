# Online Versus

Two-player private rooms. Anonymous Firebase Auth identifies players; Realtime Database stores expiring room codes, hero choices and WebRTC signaling. The host simulates the match; the guest sends inputs and renders reference-preserving world snapshots. Gameplay data goes peer-to-peer, not through the database. Host authority is for casual play, not cheat-resistant competitive play.

Firebase project: y2j-torah-fighter-online. Database us-central1. Public client config is in js/firebase-config.js; it is not an admin credential. The root is not publicly readable/writable. Individual room codes are readable by signed-in anonymous users; room creation/ownership and a single guest slot are enforced in database.rules.json. Host disconnect removes the room. New joins expire after two hours.

## Firebase setup
Anonymous sign-in is enabled. Authorized domains include y2jcpa.github.io and localhost. Database rules have been deployed from this repository. Standard Firebase Authentication is used; no billing or paid Identity Platform upgrade was enabled.

## Checks before merge
- node tests/net-codec.cjs and syntax checks.
- Local static server; two isolated browser contexts create/join a room and choose heroes; wait for Connected, host starts.
- Both players move and attack; verify shared positions/damage/stock changes and guest rendering, including specials and match results.
- Third player cannot join a full room or alter another player's signaling. Closing host ends the guest match; leaving removes the test room. Malformed/expired codes fail clearly.
- Local Versus, Training and Classic still boot without Firebase sign-in.
- After Pages deployment, repeat two-player checks against the live URL.

## Limitations
Two players only, with the host tab active. No host migration or reconnect. STUN is configured; there is no paid TURN relay, so restrictive networks may prevent a peer connection. Errors tell players to leave and retry on another network. Further latency/performance testing is required before release.

## Verification — 14 November 2026
- Snapshot codec and engine feel checks passed.
- Two isolated browser sessions created/joined a real Firebase room, selected heroes, connected over WebRTC and entered the match.
- Real keyboard movement and attacks from both sides reached the authoritative simulation; guest snapshots showed shared damage and stocks. A special attack continued to decode/render without JS errors.
- The match-ending test deliberately placed one fighter beyond the blast boundary with one stock, then verified both players saw the same winner. This checks end-state propagation, not a complete naturally played match.
- Full-room rejection and database permission checks passed: unauthenticated root reads, outsider signaling writes, guest takeover and outsider room deletion are denied. Temporary permission-test room/accounts are removed.
- Local Versus, Training and Classic selection screens still boot.
- Disconnect cleanup clears data-channel references, stale unordered snapshots are ignored, and final results also travel over the reliable control channel.

## Repeatable checks
Serve this checkout at localhost:4185. With playwright-core installed and a Chrome debug endpoint available (TF_CDP defaults to http://127.0.0.1:18800):

```sh
node tests/net-codec.cjs
node tests/feel.js
node tests/online.cjs
python3 tests/online-permissions.py
```

The browser test creates isolated contexts and real temporary online rooms, drives actual menu/keyboard actions, and uses deterministic placement only for combat proximity and the final KO. Set TF_URL to the deployed game URL for the live check. The permission test creates and deletes its own temporary anonymous accounts and room; it never edits existing rooms.

Physical-device and separate-household/restrictive-network tests remain outside this browser verification. No TURN relay or host migration is provided.
