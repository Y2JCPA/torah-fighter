# ⚔️ Torah Fighter · גִּבּוֹרֵי הַתּוֹרָה

A platform brawler in the style of the classic party fighters, starring the heroes of Tanach. Every special move comes from a passuk or a gemara. The sources were researched with the [Sefaria](https://www.sefaria.org) API, and the in-game **Sefer** pulls the live Hebrew and English text from Sefaria.

Plain HTML, CSS and JS with no build step. Graphics are **3D**, rendered with a vendored copy of Three.js:
- **Heroes:** professionally modelled, skeletally animated characters (the CC0 KayKit Adventurers by Kay Lousberg), recoloured and dressed in code for each hero. Attack animations are time-warped so the swing lands on the exact frame the hitbox goes active. If the models cannot load, the game falls back to its built-in procedural figures.
- **Stages:** textured stone and grass with grass blowing in the wind, a procedural sky with sun, clouds and stars, and layered hills fading into haze.
- **Effects:** Smash-style swing trails, hit flashes, and bloom with film tone mapping.

Quality steps down automatically on slower devices. A classic 2D renderer is still available under Settings → Graphics. It runs on PC (keyboard or gamepad) and on phones and tablets (touch controls). Open `index.html` through any static server, or turn on GitHub Pages.

## Character select
The roster is a wall of hero tiles, styled after Smash Ultimate. Each player has a token (P1–P4, or CPU) that sits on their hero; drag it to another tile to switch, or drop it off the roster to clear. Player panels along the bottom show the hero in 3D, the HMN/CPU toggle, controller and CPU level. When everyone has picked, a **READY TO FIGHT** banner appears. The announcer reads out each hero's name, using the browser's speech engine. Rules are behind the chip in the top-right corner.

## Modes
- **Versus**: 1–4 fighters, any mix of humans and CPUs (levels 1–9). Stock or time rules, teams, items, stage hazards, and the Ruach Orb for Final Strikes.
- **Classic Journey**: seven battles across Tanach (Michmash, Elah, a Yericho team battle, Carmel, Yam Suf, Sinai), then a boss fight against **Golyat**, who has stamina instead of percent. Beat it with a hero to earn that hero a ⭐.
- **Training**: practice on a dummy. Options for dummy behaviour, item spawning, a combo counter, damage reset and a hitbox view.
- **The Sefer**: every hero, move, item and stage with its source and a "Read from Sefaria" button.

## Heroes
| Hero | Special | Side | Up (recovery) | Down | Final Strike |
|---|---|---|---|---|---|
| Avraham Avinu | Dust to Swords (Taanit 21a) | Sand & Straw to Arrows (Sanhedrin 108b) | Count the Stars (Bereishis 15:5) | Plant the Eshel, heals (21:33) | 318 Servants |
| Moshe Rabbeinu, 10 amos tall (Berachos 54b) | Staff to Serpent | Strike the Rock | Leap at Og | Raised Hands counter (Shemos 17:11) | The Sea Returns |
| David HaMelech | Smooth Stone (chargeable sling) | Lion & Bear grab | Dance before Hashem | Kinnor (reflects) | The Giant Falls |
| Shimshon HaGibor | Jawbone of a Donkey | Tear the Lion | Gates of Aza (armored) | Foxes & Torches | The Two Pillars |
| Benaya ben Yehoyada | Mighty Bow (chargeable) | Snatch the Spear (steals items) | Out of the Pit | Snowy Day ice patch | Lion in the Pit |
| Yonatan ben Shaul | Three Arrows (I Shmuel 20:20) | Hands and Feet (14:13) | Climb at Michmash | Taste of Honey (heal + speed) | The Earth Trembles |
| The Maharal (guest) | fights alongside a **golem** that follows him and attacks on its own: Strike / Charge / Lift Me / Emes–Mes rebuild (Sanhedrin 65b) |||| Giant Golem |
| Yehoshua bin Nun | Shofar of Yericho | Outstretched Kidon | Ascent of Beis Choron | Sun, Stand Still (slow field) | Hailstones |
| Eliyahu HaNavi | Fire from Heaven | Rolled Mantle | Chariot of Fire | Ravens Bring Bread | Fire on Carmel |
| Gideon | Break the Jars (stun flash) | Thrown Torch | "A Sword for Hashem!" | The Fleece (counter) | 300 Shofros |
| Pinchas | Romach (3 hits) | Zealous Charge (Sanhedrin 82b) | Raised Lintel | Covenant of Peace (absorbs) | The Plague is Stopped |
| Yael | Tent Peg | Bowl of Milk (sleep) | Tent Pole Vault | Hammer Down (buries) | The Stars Fought (Shoftim 5:20) |

## Items
Jawbone of a Donkey · **Sword of Golyat** (a huge buster-style broadsword, I Shmuel 21:10) · Sling & Stones · Shofar · Gideon's Jar & Torch · Tent Peg · Hailstone · Staff of Aharon (becomes a snake) · Manna (heals) · Honeycomb (speed) · Ruach Orb (Final Strike).

## Stages
Valley of Elah · Har Sinai (lightning) · Walls of Yericho (the walls fall) · Har HaCarmel (fire on the altar) · Pass of Michmash · Splitting of the Sea · Prague Rooftops · The Midbar.

## Controls
| | Keyboard (1P) | Gamepad | Touch |
|---|---|---|---|
| Move / jump | WASD or arrows, Space | stick, X/Y | joystick, ⤒ |
| Attack / Special / Smash | J K L (or Z X C) | A / B / right stick | A / B / S |
| Shield, dodge | ; V Shift | LB/LT/RT | 🛡 |
| Grab | Shield + Attack | RB | 🛡 + A |

Two players on one keyboard: P1 uses WASD with F/G/H and Left Shift. P2 uses the arrows with `,` `.` `/` and Right Shift (or Numpad 1/2/3/0).

## Code
| File | What |
|---|---|
| `js/data.js` | heroes, specials, items, stages and their Sefaria refs |
| `js/engine.js` | physics, knockback, moves, items, minions, finals, match rules |
| `js/ai.js` | CPU opponents |
| `js/boot.js` | loads Three.js (ES module build, GLTFLoader, SkeletonUtils from `js/vendor/`) and then the game scripts in order |
| `js/chars3d.js` | the heroes: loads the skinned KayKit models, recolours and dresses them per hero (beards, headwear, robes), and drives their skeletal animation from the fighter state |
| `js/render3d.js` | the 3D renderer: weapons, stages, effects, portraits, and the procedural fallback heroes (Three.js) |
| `js/art.js` | the 2D art (classic mode), the shared animation poses, HUD and overlay |
| `js/ui.js` | menus, modes, game loop |
| `js/input.js`, `js/audio.js` | keyboard/gamepad/touch; synthesized sound and music |


`node tests/smoke.js` (with `python3 -m http.server 8123` running) loads the game in headless Chromium, simulates a CPU match on every stage plus the boss fight, and saves screenshots. `node tests/screens.js <dir>` renders several stages in 3D. `node tests/select.js <dir>` exercises the character select screen. `node tests/feel.js` needs no browser or server: it drives a fighter through the engine with scripted inputs and checks the game-feel numbers (jump timing, run/turn speed, input buffering, jab chain, recoveries, smash KO percents, camera). `node tools/check-sources.js` checks every source ref against the Sefaria API.

## Credits
The hero models and their animations are the **KayKit Adventurers Character Pack** by [Kay Lousberg](https://www.kaylousberg.com) (CC0), in `assets/kaykit/` with its licence file. The four models used are shipped with the animation clips stored once (in `Mage.glb`) and shared between them, since they have the same skeleton. Three.js is MIT licensed.
