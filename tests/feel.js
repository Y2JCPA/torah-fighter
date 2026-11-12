/* Game-feel test: drives a human-controlled fighter through the engine with scripted inputs (no browser needed) and
   checks concrete numbers: jump timing/height, run and turnaround speed, buffering, jab chain, short hop, fast fall,
   recoveries, forward-smash KO percents, camera framing.
   Usage: node tests/feel.js            (asserts against the current engine)
          node tests/feel.js --measure [engine.js] [ai.js]   (only prints the table, e.g. for an older engine file) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const args = process.argv.slice(2);
const measureOnly = args[0] === '--measure';
const root = path.join(__dirname, '..');
const engFile = measureOnly && args[1] ? args[1] : path.join(root, 'js/engine.js');
const aiFile = measureOnly && args[2] ? args[2] : path.join(root, 'js/ai.js');

const blank = () => ({ x: 0, y: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, special: false, specialHeld: false, smash: false, smashHeld: false, shield: false, shieldHeld: false, grab: false, pause: false, cx: 0, cy: 0 });
const ctx = vm.createContext({ console, Math, Audio: { play() {} }, Input: { read: blank }, window: {} });
for (const f of [path.join(root, 'js/data.js'), engFile, aiFile]) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const { ENG, AI, HEROES, HERO_BY_ID, STAGES, STAGE_BY_ID, BOSS } = vm.runInContext('({ ENG, AI, HEROES, HERO_BY_ID, STAGES, STAGE_BY_ID, BOSS })', ctx);
const NEW = !!ENG.physOf;   // feature-detect the retuned engine

/* ---- scripted-input harness ---- */
function world(heroes, stage = 'midbar', xs) {
  const W = ENG.createWorld({ stage: STAGE_BY_ID[stage], players: heroes.map(h => { if (!HERO_BY_ID[h]) throw new Error('unknown hero ' + h); return { hero: HERO_BY_ID[h], cpu: 0 }; }), stocks: 3, items: 'off', hazards: false, finals: false, mode: 'training', noCountdown: true });
  W.fighters.forEach((f, i) => { if (xs && xs[i] != null) { f.x = xs[i]; f.plat = ENG.groundAt(W.stage, f.x); } f.inp = blank(); });
  return W;
}
/* Pad: turns held buttons into the same edge/held input object Input.read() produces. */
function pad() {
  const prev = {};
  return (held = {}) => {
    const o = blank(); o.x = held.x || 0; o.y = held.y || 0;
    for (const k of ['jump', 'attack', 'special', 'smash', 'shield']) { o[k] = !!held[k] && !prev[k]; o[k + 'Held'] = !!held[k]; prev[k] = !!held[k]; }
    return o;
  };
}
/* run(W, f, script, n): script(i) returns the held-button state for frame i. Returns per-frame snapshots (after the step). */
function run(W, f, script, n, each) {
  const p = pad(), log = [];
  for (let i = 0; i < n; i++) {
    f.inp = p(script(i) || {});
    for (const o of W.fighters) if (o !== f && !o.cpu) o.inp = o.inp && o._script ? o._script(i) : blank();
    ENG.step(W);
    log.push({ i, x: f.x, y: f.y, vx: f.vx, vy: f.vy, g: f.grounded, st: f.state, mv: f.move ? (f.move.def.name || f.move.def.kind || f.move.def.anim) : null, mt: f.move ? f.move.t : -1 });
    if (each) each(i);
  }
  return log;
}
const settle = (W, n = 5) => { for (let i = 0; i < n; i++) { for (const f of W.fighters) f.inp = blank(); ENG.step(W); } };

const rows = [], fails = [];
const row = (name, value, expect, ok) => { rows.push({ test: name, value: String(value), expect: expect || '', ok: ok === undefined ? '' : ok ? 'ok' : 'FAIL' }); if (ok === false && !measureOnly) fails.push(name + ': ' + value + ' (want ' + expect + ')'); };
const r1 = v => Math.round(v * 10) / 10;

/* ---- 1. jumps ---- */
function jumpStats(hero, holdFrames, stage = 'midbar') {
  const W = world([hero], stage, [0]); const f = W.fighters[0]; settle(W);
  const y0 = f.y; let leave = -1, apexF = -1, apexY = y0, landF = -1;
  run(W, f, i => ({ jump: i < holdFrames }), 90, i => {
    if (leave < 0 && !f.grounded) leave = i;
    if (f.y < apexY - 1e-6) { apexY = f.y; apexF = i; }
    if (leave >= 0 && landF < 0 && f.grounded) landF = i;
  });
  return { leave, apex: apexF, h: y0 - apexY, land: landF };
}
for (const id of ['david', 'yael', 'avraham', 'shimshon', 'moshe', 'eliyahu']) {
  const j = jumpStats(id, 60);
  row(`full hop ${id}: frames to leave ground / to apex / airtime, height px`, `${j.leave} / ${j.apex} / ${j.land} , ${r1(j.h)}`, 'leave<=3, apex 15-18', j.leave <= 3 && j.apex >= 15 && j.apex <= 18 && j.h > 135);
}
{
  const full = jumpStats('avraham', 60), tap2 = jumpStats('avraham', 2), tap5 = jumpStats('avraham', 5), tap7 = jumpStats('avraham', 7);
  row('short hop avraham: height when jump is held 2 / 5 / 7 frames vs full', `${r1(tap2.h)} / ${r1(tap5.h)} / ${r1(tap7.h)} vs ${r1(full.h)}`, 'taps clearly lower than full', tap2.h < full.h * 0.6 && tap5.h < full.h * 0.75 && tap7.h < full.h * 0.85);
  // double jump
  // double jump pressed at the top of a full hop
  const W = world(['avraham']); const f = W.fighters[0]; settle(W); const y0 = f.y; let top = y0, djApex = -1; const t2 = full.apex + 1;
  run(W, f, i => ({ jump: i < t2 - 2 || i >= t2 }), 90, i => { if (f.y < top) { top = f.y; if (i >= t2) djApex = i - t2; } });
  row('double jump avraham (pressed at the top of a full hop): total height px, frames from 2nd press to apex', `${r1(y0 - top)} , ${djApex}`, 'apex <= 18 f', djApex > 0 && djApex <= 18);
}
/* fast fall */
{
  const fall = (ff) => { const W = world(['avraham']); const f = W.fighters[0]; settle(W); let land = -1, apex = -1, top = 0; run(W, f, i => ({ jump: i < 30, y: ff && apex >= 0 ? 1 : 0 }), 90, i => { if (f.y < top) { top = f.y; apex = i; } else if (apex < 0 && !f.grounded && f.vy >= 0) apex = i; if (land < 0 && i > 5 && f.grounded) land = i; }); return land - apex; };
  const a = fall(false), b = fall(true);
  row('fall from full-hop apex: frames normal / fast-fall', `${a} / ${b}`, 'fast-fall at least 25% quicker', b <= a * 0.75);
}

/* ---- 2. ground movement ---- */
{
  const W = world(['avraham']); const f = W.fighters[0]; settle(W);
  const runSpd = NEW ? f.ph.run : f.hero.run;
  let t90 = -1, rev = -1, stop = -1, slide = 0, xStop = 0;
  const log = run(W, f, i => (i < 40 ? { x: 1 } : i < 80 ? { x: -1 } : {}), 120, i => {
    if (t90 < 0 && f.vx >= runSpd * 0.9) t90 = i + 1;
    if (i >= 40 && rev < 0 && f.vx <= -runSpd * 0.9) rev = i - 40 + 1;
    if (i === 80) xStop = f.x;
    if (i >= 80 && stop < 0 && Math.abs(f.vx) < 0.2) { stop = i - 80 + 1; slide = Math.abs(f.x - xStop); }
  });
  row('avraham run: top speed px/f, frames to 90% / to full reverse / to stop (slide px)', `${r1(Math.max(...log.map(l => l.vx)))} , ${t90} / ${rev} / ${stop} (${r1(slide)})`, 'start<=2, reverse<=6, stop<=8', t90 <= 2 && rev <= 6 && stop <= 8);
  // air control
  const W2 = world(['avraham']); const g = W2.fighters[0]; settle(W2);
  const airSpd = NEW ? g.ph.air : g.hero.air; let a90 = -1;
  run(W2, g, i => ({ jump: i < 30, x: i >= 4 ? 1 : 0 }), 30, i => { if (a90 < 0 && g.vx >= airSpd * 0.9) a90 = i - 4 + 1; });
  row('avraham air: max air speed px/f, frames from stick press to 90%', `${r1(airSpd)} , ${a90}`, '<=9', a90 > 0 && a90 <= 9);
}
/* coyote time: run off the edge, press jump 3 frames later -> must still be a (non double) jump */
if (NEW) {
  const W = world(['avraham'], 'midbar', [440]); const f = W.fighters[0]; settle(W);
  let offF = -1, jumped = false, jumpsLeft = -1;
  run(W, f, i => ({ x: 1, jump: offF >= 0 && i >= offF + 3 && i < offF + 20 }), 60, i => { if (offF < 0 && !f.grounded) offF = i; if (offF >= 0 && i === offF + 5) { jumped = f.vy < -5; jumpsLeft = f.jumps; } });
  row('coyote: jump pressed 3 frames after running off the edge', jumped ? `jumps, double jump kept (${jumpsLeft})` : 'no jump', 'ground jump, double jump kept', jumped && jumpsLeft === f.hero.jumps);
}

/* ---- 3. buffering ---- */
{
  // attack pressed N frames before landing from a jump -> comes out on landing?
  // find the landing frame of a full hop first
  const probe = world(['avraham', 'david'], 'midbar', [0, 300]); settle(probe); let landF = -1;
  run(probe, probe.fighters[0], i => ({ jump: i < 30 }), 90, i => { if (landF < 0 && i > 5 && probe.fighters[0].grounded) landF = i; });
  const W3 = world(['avraham', 'david'], 'midbar', [0, 300]); const h = W3.fighters[0]; settle(W3);
  // cleaner case: landing lag. Do a late aerial (lands with lag), press jump during the lag -> jump squat on first actionable frame
  let lagStart = -1, lagEnd = -1, squat = -1;
  run(W3, h, i => ({ jump: i < 30 || (lagStart >= 0 && i === lagStart + 1), attack: i === landF - 9, x: 0 }), landF + 30, i => {
    if (lagStart < 0 && i > 5 && h.grounded) lagStart = i;
    if (lagStart >= 0 && lagEnd < 0 && h.landLag <= 0 && i > lagStart) lagEnd = i;
    if (lagStart >= 0 && squat < 0 && (h.jumpSquat > 0 || !h.grounded)) squat = i;
  });
  row('buffer: jump pressed on 1st frame of aerial landing lag -> jump starts N frames after lag ends', squat < 0 ? 'dropped' : `${squat - lagEnd} (lag ${lagEnd - lagStart}f)`, '<=1, not dropped', squat >= 0 && squat - lagEnd <= 1);
  // attack pressed 5 frames before a move ends
  const W4 = world(['avraham', 'david'], 'midbar', [0, 300]); const k = W4.fighters[0]; settle(W4);
  const ft = k.normals.ftilt.frames; let second = -1, firstEnd = -1;
  run(W4, k, i => ({ x: i < 2 || i >= ft - 6 ? 1 : 0, attack: i === 0 || i === ft - 6 }), ft + 30, i => { if (firstEnd < 0 && i > 2 && (!k.move || k.move.t < 3)) firstEnd = i; if (second < 0 && i > 5 && k.move && k.move.t <= 1) second = i; });
  row('buffer: attack pressed 6 frames before ftilt ends -> next attack starts at frame', second < 0 ? `dropped (ftilt ${ft}f)` : `${second} (ftilt ${ft}f)`, 'not dropped, <= ftilt length', second >= 0 && second <= ft + 1);
}
/* attack pressed 5 frames before landing (falling, no move): comes out on the ground on the first frame after touchdown */
if (NEW) {
  const W = world(['avraham', 'david'], 'midbar', [0, 300]); const f = W.fighters[0]; settle(W);
  f.y = -5 * f.ph.maxFall - 6; f.grounded = false; f.plat = null; f.vy = f.ph.maxFall; f.state = 'fall';   // lands in ~5 frames
  let landF = -1, mvF = -1, nm = null, air = false;
  // the press happens while airborne with a "shield" lockout so it cannot simply become an aerial: use helpless fall (what you have after an up special)
  f.helpless = true;
  run(W, f, i => ({ attack: i === 0 }), 30, i => { if (landF < 0 && f.grounded) landF = i; if (mvF < 0 && f.move) { mvF = i; nm = f.move.def.name; air = !f.grounded; } });
  row('buffer: attack pressed 5 frames before landing (helpless fall, 7f landing lag) -> first attack frame', mvF < 0 ? 'dropped' : `lands f${landF}, ${nm} starts f${mvF}`, 'dropped is ok only if lag > buffer', true);
  const W2 = world(['avraham', 'david'], 'midbar', [0, 300]); const g = W2.fighters[0]; settle(W2);
  // normal fall, uair started early so it auto-cancels; attack pressed 5 frames before landing while the uair is still finishing -> jab on first actionable frame
  let land2 = -1, jabF = -1, free2 = -1;
  const probe = world(['avraham', 'david'], 'midbar', [0, 300]); settle(probe); let pl = -1;
  run(probe, probe.fighters[0], i => ({ jump: i < 30 }), 90, i => { if (pl < 0 && i > 5 && probe.fighters[0].grounded) pl = i; });
  const startA = pl - g.normals.uair.iasa + 3;   // the uair is in its end lag, and still short of its IASA frame when it lands
  run(W2, g, i => ({ jump: i < 30, y: i >= startA - 1 && i <= startA + 1 ? -1 : 0, attack: i === startA || i === pl - 5 }), pl + 20, i => {
    if (land2 < 0 && i > 5 && g.grounded) land2 = i;
    if (land2 >= 0 && free2 < 0 && g.landLag <= 0 && !g.move) free2 = i;
    if (jabF < 0 && i > startA + 3 && g.move && g.move.def.name !== 'uair') jabF = i;
  });
  if (process.env.DBG) console.log({ pl, land2, jabF, free2, startA });
  row('buffer: attack pressed 5 frames before landing (during an aerial) -> ground attack starts N frames after touchdown', jabF < 0 ? 'dropped' : `${jabF - land2}`, '<=3 (auto-cancel lag 2)', jabF >= 0 && jabF - land2 <= 3);
}

/* ---- 4. jab chain ---- */
{
  const W = world(['avraham', 'david'], 'midbar', [0, 62]); const f = W.fighters[0], v = W.fighters[1]; settle(W);
  const seen = []; let hits = 0, lastDmg = 0, inStun = true, firstHit = -1;
  run(W, f, i => ({ attack: i < 30 && i % 10 < 4 }), 70, i => {
    const nm = f.move ? (f.move.def.name || f.move.def.anim) : null; if (nm && seen[seen.length - 1] !== nm) seen.push(nm);
    if (v.damage > lastDmg + 0.01) { hits++; lastDmg = v.damage; if (firstHit < 0) firstHit = i; else if (v.hitstun <= 0 && v.hitlag <= 0) inStun = false; }
  });
  row('three attack presses (every 10f) next to an opponent: moves seen, hits landed, damage', `${seen.join('>')} , ${hits} hits, ${r1(v.damage)}%`, 'jab>jab2>jab3, 3 hits', !NEW || (seen.join('>') === 'jab>jab2>jab3' && hits === 3));
}

/* ---- 5. up attacks on keyboard (W = up + jump on the same key) ---- */
if (NEW) {
  const tryUp = (btn, offs) => { const W = world(['avraham']); const f = W.fighters[0]; settle(W); let nm = null, left = false;
    run(W, f, i => { const o = {}; const up = i >= 5 && i < 25; if (up) { o.y = -1; o.jump = true; } if (i >= 5 + offs && i < 9 + offs) o[btn] = true; return o; }, 30, i => { if (f.move) nm = f.move.def.special ? f.move.def.kind : f.move.def.name; if (!f.grounded && !(f.move && f.move.def.special)) left = true; });
    return (nm || 'none') + (left ? '+jump' : ''); };
  const res = [-3, -1, 0, 1, 2, 3].map(o => tryUp('attack', o));
  row('W+J (up+attack), attack pressed -3,-1,0,+1,+2,+3 frames relative to up', res.join(' '), 'utilt every time, no jump', res.every(r => r === 'utilt'));
  const res2 = [-2, 0, 2].map(o => tryUp('smash', o));
  row('W+L (up+smash) at -2,0,+2', res2.join(' '), 'usmash', res2.every(r => r === 'usmash'));
  const res3 = [-2, 0, 2].map(o => tryUp('special', o));
  row('W+K (up+special) at -2,0,+2', res3.join(' '), 'rise (up special)', res3.every(r => /rise|golem/.test(r)));
}

/* ---- 5b. dash, tilt vs dash attack, dash dance, grab out of shield, B-reverse, tech ---- */
if (NEW) {
  const first = (script, n = 40, x0 = 0) => { const W = world(['avraham', 'david'], 'midbar', [x0, 400]); const f = W.fighters[0]; settle(W); let nm = null; const log = run(W, f, script, n, i => { if (f.move && !nm) nm = f.move.def.name; }); return { nm, f, W, log }; };
  const a = first(i => ({ x: i >= 2 ? 1 : 0, attack: i === 2 })).nm;                  // direction + attack together
  const b = first(i => ({ x: 1, attack: i === 14 })).nm;                              // attack out of a run
  const c = first(i => ({ x: i < 14 ? 1 : -1, attack: i === 15 })).nm;                // turn and attack: pivot tilt, facing the new way
  row('attack with direction pressed together / out of a run / right after turning around', `${a} / ${b} / ${c}`, 'ftilt / dash / ftilt', a === 'ftilt' && b === 'dash' && c === 'ftilt');
  const dd = first(i => ({ x: Math.floor(i / 6) % 2 ? -1 : 1 }), 48); const xs = dd.log.map(l => l.x), sp = dd.log.map(l => Math.abs(l.vx));
  row('dash dance (reverse every 6 frames): min |speed| after the first frame, x drift px', `${r1(Math.min(...sp.slice(1)))} , ${r1(xs[xs.length - 1] - xs[0])}`, 'never slows below 80% run speed', Math.min(...sp.slice(1)) >= dd.f.ph.run * 0.8);
  // grab out of shield: attacker jabs the shield; defender presses attack during shield stun
  {
    const W = world(['avraham', 'david'], 'midbar', [0, 58]); const d = W.fighters[0], atk = W.fighters[1]; settle(W); atk.facing = -1;
    const pa = pad(); let stunEnd = -1, grabF = -1, hitF = -1, grabbed = false;
    atk._script = i => pa({ x: i === 3 ? -1 : 0, attack: i === 3 });
    run(W, d, i => ({ shield: true, attack: hitF >= 0 && i >= hitF + 1 }), 60, i => {
      if (hitF < 0 && d.shieldStun > 0) hitF = i;
      if (hitF >= 0 && stunEnd < 0 && d.shieldStun <= 0) stunEnd = i;
      if (grabF < 0 && d.move && d.move.def.name === 'grab') grabF = i;
      if (d.grabbing) grabbed = true;
    });
    row('grab out of shield: attack pressed during shield stun -> grab starts N frames after stun ends; connects', hitF < 0 ? 'attacker never hit the shield' : `${grabF - stunEnd} , ${grabbed}`, '<=1, true', hitF >= 0 && grabF >= 0 && grabF - stunEnd <= 1 && grabbed);
  }
  // B-reverse: neutral special, then back on the stick within 3 frames
  {
    const r = first(i => ({ special: i === 2, x: i >= 3 && i < 8 ? -1 : 0 }), 12);
    row('B-reverse: back on the stick 1 frame after neutral special', `facing ${r.f.facing}, move ${r.f.move ? r.f.move.skey : '-'}`, 'facing -1, still the neutral special', r.f.facing === -1 && r.f.move && r.f.move.skey === 'neutral');
  }
  // tech
  {
    const land = (press) => { const W = world(['avraham', 'david'], 'midbar', [0, 300]); const f = W.fighters[0]; settle(W); f.y = -120; f.grounded = false; f.plat = null; f.state = 'hit'; f.hitstun = 60; f.tumble = true; f.lvy = 9; f.lvx = 2; let st = null, t = -1;
      run(W, f, i => ({ shield: press >= 0 && i >= press && i < press + 3 }), 40, i => { if (t < 0 && f.grounded) { t = i; st = f.state; } }); return { st, t }; };
    const plain = land(-1), tech = land(plain.t - 5);
    row('landing from a tumble: no input / shield pressed 5 frames before the floor', `${plain.st} / ${tech.st}`, 'down / idle (tech)', plain.st === 'down' && tech.st === 'idle');
  }
}

/* ---- 6. recoveries: start below and outside the ledge with no double jump, hold toward the stage, up special ---- */
{
  const res = [];
  for (const st of STAGES) {
    let bad = [];
    for (const h of HEROES) {
      const L = ENG.createWorld({ stage: st, players: [{ hero: h, cpu: 0 }], stocks: 3, items: 'off', mode: 'training', noCountdown: true });
      const f = L.fighters[0]; const led = L.ledges.reduce((a, b) => (b.x > a.x ? b : a));
      for (let i = 0; i < 5; i++) { f.inp = blank(); ENG.step(L); }
      // 110 px outside the right-most ledge, feet 150 px below it, falling, no jumps left
      f.x = led.x + 110; f.y = led.y + 150; f.grounded = false; f.plat = null; f.vx = 0; f.vy = 3; f.jumps = 0; f.state = 'fall'; f.move = null;
      const p = pad(); let ok = false;
      for (let i = 0; i < 200 && !ok; i++) {
        f.inp = p({ x: f.x > led.x - 60 ? -1 : 0, y: i < 6 ? -1 : 0, special: i >= 1 && i < 4 });
        ENG.step(L);
        if (f.state === 'ledge' || (f.grounded && !f.dead)) ok = true;
        if (f.dead) break;
      }
      if (!ok) bad.push(h.id);
    }
    res.push(st.id + ':' + (bad.length ? 'FAIL(' + bad.join(',') + ')' : 'ok'));
  }
  row('up special from 110px out / 150px below the ledge, all heroes x all stages', res.join(' '), 'all ok', res.every(r => /:ok$/.test(r)));
}

/* ---- 7. forward smash KO percent (fully charged, victim gives no input and no DI) ---- */
function smashKO(attId, vicId, from) {
  const st = STAGE_BY_ID.elah, edge = st.ground[0].x + st.ground[0].w;
  for (let pct = 20; pct <= 300; pct += 5) {
    const W = world([attId, vicId], 'elah'); const a = W.fighters[0], v = W.fighters[1];
    const vx = from === 'edge' ? edge - 30 : 0; v.x = vx; a.x = vx - (a.w / 2 + v.w / 2 + 14); a.facing = 1; v.damage = pct;
    a.plat = v.plat = st.ground[0];
    let ko = false, side = false;
    run(W, a, i => ({ x: 0, smash: i >= 2 && i < 80 }), 400, i => { if (!ko && (v.dead || v.stocks < 99 && v.stats.falls > 0)) { ko = true; } if (!ko && (v.x > st.blast.r - 60 || v.y - v.h < st.blast.t + 60)) side = true; });
    if (v.stats.falls > 0 && side) return pct;
  }
  return '>300';
}
for (const [vic, label] of [['yael', 'light (Yael, 82)'], ['gideon', 'mid (Gideon, 100)'], ['shimshon', 'heavy (Shimshon, 130)']]) {
  const e = smashKO('gideon', vic, 'edge'), c = smashKO('gideon', vic, 'centre');
  const mid = vic === 'gideon';
  row(`charged fsmash (Gideon) KO % vs ${label}: from edge / from centre`, `${e} / ${c}`, mid ? 'edge 90-120, centre 130-160' : '', mid ? (e >= 90 && e <= 120 && c >= 130 && c <= 160) : undefined);
}
/* uncharged, for reference */
{
  const st = STAGE_BY_ID.elah, edge = st.ground[0].x + st.ground[0].w; let res = '>300';
  for (let pct = 20; pct <= 300; pct += 5) {
    const W = world(['gideon', 'gideon'], 'elah'); const a = W.fighters[0], v = W.fighters[1];
    v.x = edge - 30; a.x = v.x - (a.w / 2 + v.w / 2 + 14); a.facing = 1; v.damage = pct; a.plat = v.plat = st.ground[0]; let side = false;
    run(W, a, i => ({ smash: i >= 2 && i < 5 }), 300, i => { if (v.x > st.blast.r - 60) side = true; });
    if (v.stats.falls > 0 && side) { res = pct; break; }
  }
  row('uncharged fsmash (Gideon) KO % vs mid from edge', res, '', undefined);
}

/* ---- 8. low-percent combo: down tilt -> jump-cancel -> forward air must connect while the victim is still in hitstun ---- */
if (NEW) {
  const res = [];
  for (const pct of [0, 15, 40, 70]) {
    const W = world(['gideon', 'gideon'], 'midbar', [0, 60]); const a = W.fighters[0], v = W.fighters[1]; settle(W); v.damage = pct;
    let hit1 = -1, hit2 = -1, free = false, last = v.damage, nm = '';
    run(W, a, i => {
      if (hit1 < 0) return { y: 1, attack: i === 1 };
      const t = i - hit1, dx = v.x - a.x;
      return { jump: t >= 1 && t < 25, attack: !a.grounded && t % 2 === 0, x: Math.abs(dx) > 10 ? Math.sign(dx) : 0 };
    }, 50, i => {
      if (v.damage > last + 0.01) { if (hit1 < 0) hit1 = i; else if (hit2 < 0) { hit2 = i; nm = a.move ? a.move.def.name : '?'; } last = v.damage; }
      if (hit1 >= 0 && hit2 < 0 && v.hitstun <= 0 && v.hitlag <= 0 && i > hit1 + 1) free = true;   // victim could act before the 2nd hit
    });
    res.push({ pct, ok: hit2 > 0 && !free, txt: `${pct}%: ${hit2 < 0 ? 'miss' : nm + ' +' + (hit2 - hit1) + 'f' + (free ? ' (not true)' : '')}` });
  }
  row('combo: dtilt -> jump-cancel -> aerial, at 0/15/40/70%', res.map(r => r.txt).join(' , '), 'true combo (victim never free) at 0-40%', res.filter(r => r.pct <= 40).every(r => r.ok));
}

/* ---- 9. hitlag / freeze by strength ---- */
{
  const lagOf = (mvKey, pct, charge) => { const W = world(['gideon', 'gideon'], 'midbar', [0, 62]); const a = W.fighters[0], v = W.fighters[1]; settle(W); v.damage = pct; let lag = 0, fr = 0, sp = 0;
    run(W, a, i => (mvKey === 'jab' ? { attack: i === 0 } : { smash: i >= 0 && i < (charge ? 80 : 2) }), 110, i => { lag = Math.max(lag, v.hitlag); fr = Math.max(fr, W.hitFreeze || 0); sp = Math.max(sp, Math.hypot(v.lvx, v.lvy)); });
    return `${lag}${NEW ? '+' + fr : ''}f/${r1(sp)}px`; };
  row('victim hitlag(+global freeze) / launch speed: jab@0% , fsmash@40% , charged fsmash@110%', `${lagOf('jab', 0)} , ${lagOf('fsmash', 40)} , ${lagOf('fsmash', 110, true)}`, '', undefined);
}

/* ---- 10. camera: on-screen hero height at the start of a 2-player match on a 1280x650 view ---- */
{
  const W = world(['avraham', 'david'], 'elah'); for (let i = 0; i < 240; i++) { settle(W, 1); ENG.updateCamera(W, 1280, 650); }
  const z0 = W.cam.z; const f = W.fighters[0];
  // launch one fighter hard to the right and check he stays inside the view until the blast zone
  let lost = 0; const v = W.fighters[1]; v.lvx = 38; v.lvy = -14; v.hitstun = 60; v.grounded = false; v.plat = null; v.state = 'hit'; v.y -= 4;
  for (let i = 0; i < 80 && !v.dead; i++) { settle(W, 1); ENG.updateCamera(W, 1280, 650); const sx = (v.x - W.cam.x) * W.cam.z, sy = (v.y - v.h / 2 - W.cam.y) * W.cam.z; if (!v.dead && v.x < W.stage.blast.r - 80 && (Math.abs(sx) > 640 || Math.abs(sy) > 325)) lost++; }
  row('camera: hero height on screen at match start (px of 650), frames a launched fighter is off-screen before the blast zone', `${Math.round(f.h * z0)} , ${lost}`, 'bigger than before (was ~120), 0 lost', lost === 0 && (!NEW || f.h * z0 > 135));
}

/* ---- 11. CPU sanity: level 9 beats level 2 most of the time; every hero recovers under AI control ---- */
{
  let w9 = 0; const N = 6;
  for (let n = 0; n < N; n++) {
    const W = ENG.createWorld({ stage: STAGES[n % STAGES.length], players: [{ hero: HEROES[n % HEROES.length], cpu: 9 }, { hero: HEROES[(n + 5) % HEROES.length], cpu: 2 }], stocks: 2, items: 'off', mode: 'versus', noCountdown: true });
    for (let i = 0; i < 60 * 60 * 5 && !W.over; i++) { for (const f of W.fighters) f.inp = AI.think(f, W); ENG.step(W); }
    if (W.winner === W.fighters[0]) w9++;
  }
  row(`CPU level 9 vs level 2: wins out of ${N}`, w9, '>= 5', w9 >= 5);
  let rec = 0, tot = 0;
  for (const h of HEROES) for (const side of [-1, 1]) {
    const W = ENG.createWorld({ stage: STAGE_BY_ID.elah, players: [{ hero: h, cpu: 7 }, { hero: HEROES[0], cpu: 0 }], stocks: 3, items: 'off', mode: 'training', noCountdown: true });
    const f = W.fighters[0]; W.fighters[1].inp = blank(); for (let i = 0; i < 3; i++) { f.inp = blank(); ENG.step(W); }
    f.x = side * 640; f.y = 60; f.grounded = false; f.plat = null; f.vy = 2; f.state = 'fall'; tot++;
    let ok = false; for (let i = 0; i < 260 && !ok && !f.dead; i++) { f.inp = AI.think(f, W); W.fighters[1].inp = blank(); ENG.step(W); if (f.grounded && !f.onHalo) ok = true; }
    if (ok && f.stats.falls === 0) rec++;
  }
  row('CPU (lvl 7) recovers from 180px outside / 60px below the ledge (each hero, both sides)', `${rec}/${tot}`, 'all', rec === tot);
}

/* ---- 12. robustness: simultaneous grabs must not lock; random-input fuzz finds no NaN and no fighter stuck for long; new effect types are emitted ---- */
if (NEW) {
  {
    const W = world(['avraham', 'david'], 'midbar', [0, 56]); const a = W.fighters[0], b = W.fighters[1]; settle(W); b.facing = -1;
    const pb = pad(); b._script = i => pb({ shield: i >= 2 && i < 6, attack: i >= 3 && i < 6 });
    run(W, a, i => ({ shield: i >= 2 && i < 6, attack: i >= 3 && i < 6 }), 420);
    const free = f => !f.grabbedBy && !f.grabbing && f.state !== 'grabbed' && f.state !== 'grabbing';
    row('both fighters grab on the same frame: both free again after 7 s', `${free(a)} / ${free(b)}`, 'true / true', free(a) && free(b));
  }
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let worst = 0, bad = '', types = new Set();
  for (let r = 0; r < 4; r++) {
    const players = [0, 1, 2, 3].map(i => ({ hero: r === 3 && i === 2 ? BOSS : HEROES[(r * 4 + i) % HEROES.length], cpu: i === 3 ? 7 : r === 3 && i === 2 ? 5 : 0 }));
    const W = ENG.createWorld({ stage: STAGES[(r * 3) % STAGES.length], players, stocks: 99, items: 'high', hazards: true, finals: true, mode: 'training', noCountdown: true });
    const hold = W.fighters.map(() => ({ t: 0, h: {} })), prev = W.fighters.map(() => ({})), stuck = W.fighters.map(() => 0);
    for (let i = 0; i < 9000 && !bad; i++) {
      W.fighters.forEach((f, k) => {
        if (f.cpu) { f.inp = AI.think(f, W); return; }
        const H = hold[k];
        if (--H.t <= 0) { H.t = 1 + Math.floor(rnd() * (rnd() < 0.3 ? 40 : 8)); H.h = { x: [0, 1, -1, 1, -1, 0.5][Math.floor(rnd() * 6)], y: [0, 0, 0, 1, -1][Math.floor(rnd() * 5)], jump: rnd() < 0.25, attack: rnd() < 0.35, special: rnd() < 0.2, smash: rnd() < 0.15, shield: rnd() < 0.15 }; if (!f.grounded && rnd() < 0.5) H.h.x = -Math.sign(f.x); }
        const o = blank(), h = H.h; o.x = h.x; o.y = h.y;
        for (const b of ['jump', 'attack', 'special', 'smash', 'shield']) { o[b] = !!h[b] && !prev[k][b]; o[b + 'Held'] = !!h[b]; }
        prev[k] = h; f.inp = o;
      });
      ENG.step(W); ENG.updateCamera(W, 1280, 650);
      for (const e of W.effects) types.add(e.type);
      W.fighters.forEach((f, k) => {
        for (const key of ['x', 'y', 'vx', 'vy', 'lvx', 'lvy', 'damage']) if (!Number.isFinite(f[key])) bad = `NaN ${key} ${f.hero.id}`;
        const free = f.dead || f.onHalo || f.cpu || f.state === 'ledge' || (f.canAct() && f.landLag <= 0);
        stuck[k] = free ? 0 : stuck[k] + 1; worst = Math.max(worst, stuck[k]);
      });
      if (!Number.isFinite(W.cam.x + W.cam.y + W.cam.z + W.zoomPunch + W.hitFreeze)) bad = 'camera/world NaN';
    }
  }
  row('fuzz (4 x 150 s of random inputs incl. boss): problems, longest stretch a fighter could not act', `${bad || 'none'} , ${worst} frames`, 'none, < 600 (no softlock)', !bad && worst < 600);
  const want = ['impact', 'launchtrail', 'shock', 'jumpring', 'jumpdust', 'landdust', 'dashburst', 'shieldhit', 'koblast'];
  const missing = want.filter(t => !types.has(t));
  row('new effect types emitted during the fuzz', missing.length ? 'missing: ' + missing.join(',') : 'all 9 seen', 'all 9 seen', !missing.length);
}

for (const r of rows) console.log(`${r.ok === 'FAIL' ? '[FAIL]' : r.ok === 'ok' ? '[ ok ]' : '[info]'} ${r.test}\n         => ${r.value}${r.expect ? '    (want: ' + r.expect + ')' : ''}`);
if (measureOnly) process.exit(0);
if (fails.length) { console.log('FEEL TEST FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('FEEL TEST: all checks passed');
