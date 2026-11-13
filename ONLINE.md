# Online Versus (prepared; not enabled in production yet)

Two-player private rooms. Anonymous Firebase Auth identifies players; Realtime Database stores expiring room codes, hero choices and WebRTC signaling. The host simulates the match; the guest sends inputs and renders reference-preserving world snapshots. Gameplay data goes peer-to-peer, not through the database. Host authority is for casual play, not cheat-resistant competitive play.

Firebase project: y2j-torah-fighter-online. Database us-central1. Public client config is in js/firebase-config.js; it is not an admin credential. The root is not publicly readable/writable. Individual room codes are readable by signed-in anonymous users; room creation/ownership and a single guest slot are enforced in database.rules.json. Host disconnect removes the room. New joins expire after two hours.

## Blocker before release
Firebase Authentication is not initialized. The Firebase console requires enabling Google account two-step verification for the owner y2jadvisors@gmail.com. The public Identity Platform initialization API requires billing; no billing was enabled. Once owner access works, initialize normal Firebase Authentication and enable Anonymous sign-in. Authorize y2jcpa.github.io and localhost. Do not merge this feature before real two-browser testing passes.

## Checks before merge
- node tests/net-codec.cjs and syntax checks.
- Local static server; two isolated browser contexts create/join a room and choose heroes; wait for Connected, host starts.
- Both players move and attack; verify shared positions/damage/stock changes and guest rendering, including specials and match results.
- Third player cannot join a full room or alter another player's signaling. Closing host ends the guest match; leaving removes the test room. Malformed/expired codes fail clearly.
- Local Versus, Training and Classic still boot without Firebase sign-in.
- After Pages deployment, repeat two-player checks against the live URL.

## Limitations
Two players only, with the host tab active. No host migration or reconnect. STUN is configured; there is no paid TURN relay, so restrictive networks may prevent a peer connection. Errors tell players to leave and retry on another network. Further latency/performance testing is required before release.

## Verified so far
Snapshot codec preserves circular fighter references, shared objects, Sets, Infinity and fighter methods. Local game boots; Online menu appears and fails gracefully with auth/configuration-not-found while auth is unavailable. Production main has not been changed.
