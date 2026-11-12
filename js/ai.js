/* Torah Fighter — CPU opponents (levels 1–9). Produces the same input shape as a human controller. */
'use strict';

const AI = (() => {
  const blank = () => ({ x: 0, y: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, special: false, specialHeld: false, smash: false, smashHeld: false, shield: false, shieldHeld: false, grab: false, pause: false, cx: 0, cy: 0 });

  function groundTop(W, x) { const g = W.stage.ground.find(g => x > g.x && x < g.x + g.w); return g ? g.y : 0; }
  function overGround(W, x) { return W.stage.ground.some(g => x > g.x + 8 && x < g.x + g.w - 8); }
  function nearestLedge(W, f) {
    let best = null, bd = 1e9;
    for (const L of W.ledges) { const d = Math.abs(L.x - f.x) + Math.abs(L.y - f.y) * 0.5; if (d < bd) { bd = d; best = L; } }
    return best;
  }

  /* Wrapper: a jump the CPU asks for with jumpHeld is kept held for a few frames so it becomes a full hop
     (a bare `jump` press is a short hop), and a smash it decided to charge stays held. */
  function think(f, W) {
    const out = decide(f, W), ai = f.ai;
    if (!ai) return out;
    // presses are buffered by the engine now, so never mash jump (a second press during jump squat would burn the double jump at once)
    if (out.jump && (f.jumpSquat > 0 || ai.t - (ai.lastJump || -99) < 8)) out.jump = false;
    if (out.jump) ai.lastJump = ai.t;
    // don't drift off the stage by momentum while busy in the air
    if (!f.grounded && f.hitstun <= 0 && !f.helpless && !out.attack && !out.special && f.state !== 'ledge' && overGround(W, f.x) && !overGround(W, f.x + f.vx * 14) && Math.abs(f.vx) > 1) out.x = -Math.sign(f.vx);
    if (out.jump && out.jumpHeld) ai.jumpHold = 14; else if (out.jump) ai.jumpHold = 0;
    else if (ai.jumpHold > 0) { ai.jumpHold--; out.jumpHeld = true; }
    if (out.smash && out.smashHeld && ai.chargeFor > 0) ai.chargeT = ai.chargeFor;
    else if (ai.chargeT > 0) { ai.chargeT--; if (f.move && f.move.def.smash) out.smashHeld = true; else ai.chargeT = 0; }
    ai.chargeFor = 0;
    ai.hadMove = !!f.move;
    return out;
  }

  function decide(f, W) {
    const lvl = f.cpu || 3;
    const ai = f.ai || (f.ai = { hold: blank(), t: 0, react: 0, plan: null, planT: 0, wait: 0, upBUsed: false, jumpHold: 0, chargeT: 0, chargeFor: 0, idle: 0, hadMove: false });
    const out = blank();
    if (f.dead) return out;
    ai.t++;
    // beginners (levels 1-3) stand around for a moment after every attack: that pause is what makes them beatable
    // (levels 4-6 hesitate a little too; 7+ never do)
    if (ai.hadMove && !f.move && !f.grabbing) ai.idle = lvl <= 3 ? (4 - lvl) * 22 + Math.random() * 25 : lvl <= 6 ? (7 - lvl) * 7 * Math.random() : 0;
    if (ai.idle > 0) ai.idle--;
    if (f.grounded) ai.upBUsed = false;
    if (W.cfg.mode === 'training' && W.cfg.cpuMode && W.cfg.cpuMode !== 'cpu') {
      if (W.cfg.cpuMode === 'walk') { out.x = Math.sin(W.t * 0.01) > 0 ? 0.5 : -0.5; if (!overGround(W, f.x + out.x * 60)) out.x *= -1; }
      if (W.cfg.cpuMode === 'jump' && f.grounded && W.t % 70 === 0) { out.jump = true; out.jumpHeld = true; }
      if (W.cfg.cpuMode === 'shield') out.shieldHeld = true;
      return recover(W, f, out, ai, lvl) || out;
    }
    if (f.onHalo) { if (ai.t % 50 === 0 && Math.random() < 0.5) out.y = 1; return out; }
    // holding someone: pummel a little, then throw toward the nearer blast zone (down throw at low percent sets up a follow-up)
    if (f.grabbing) {
      const v = f.grabbing; ai.grabT = (ai.grabT || 0) + 1;
      const wait = lvl <= 2 ? 45 : lvl <= 5 ? 26 : 16;
      if (ai.grabT < wait) { if (ai.grabT % 10 === 9 && lvl >= 3) out.attack = true; return out; }
      ai.grabT = 0;
      if (lvl >= 6 && v.damage < 60) { out.y = 1; return out; }
      if (lvl >= 4) { out.x = f.x >= 0 ? 1 : -1; return out; }
      out.x = f.facing; return out;
    }
    ai.grabT = 0;
    if (f.grabbedBy || f.stun) { if (ai.t % Math.max(2, 10 - lvl) === 0) out.attack = true; return out; }

    // ----- being launched: good CPUs hold in and up (DI) and tech the landing -----
    if ((f.hitlag > 0 || f.hitstun > 0) && f.state === 'hit' && lvl >= 6) {
      out.x = -Math.sign(f.x) || 0; out.y = -1;
      if (lvl >= 8 && f.hitstun > 0 && f.tumble && !f.grounded && f.vy + f.lvy > 3 && overGround(W, f.x) && f.y > -(f.vy + f.lvy) * 4 + groundTop(W, f.x) && Math.random() < 0.5) out.shield = true;
      return out;
    }

    // ----- recovery has priority -----
    const rec = recover(W, f, out, ai, lvl);
    if (rec) return rec;

    // ----- choose target -----
    const enemies = W.fighters.filter(o => o !== f && !o.dead && o.stocks > 0 && !(W.cfg.teams && o.team === f.team));
    if (!enemies.length) return out;
    if (!ai.target || ai.target.dead || ai.target.stocks <= 0 || ai.t % 180 === 0) {
      enemies.sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
      ai.target = Math.random() < 0.75 ? enemies[0] : enemies[Math.floor(Math.random() * enemies.length)];
    }
    const T = ai.target;
    const dx = T.x - f.x, dy = (T.y - T.h / 2) - (f.y - f.h / 2), adx = Math.abs(dx);
    const dir = Math.sign(dx) || 1;

    // final strike
    if (f.finalReady && (adx < 500 || Math.random() < 0.02)) { out.special = true; return out; }

    // reaction gating: low levels act less often
    const thinkEvery = Math.max(1, 11 - lvl);
    const acting = ai.t % thinkEvery === 0;

    // ----- defense -----
    if (lvl >= 3 && f.grounded && f.canAct()) {
      const threat = enemies.find(o => o.move && o.move.def.hits && Math.abs(o.x - f.x) < (o.u * 2.6 + 30) && o.move.t < (o.move.def.hits[0] ? o.move.def.hits[0].s : 0));
      const projThreat = W.projectiles.find(p => p.owner !== f && !(W.cfg.teams && p.owner && p.owner.team === f.team) && Math.abs(p.x - f.x) < 150 && Math.sign(p.vx) === Math.sign(f.x - p.x) && Math.abs(p.y - (f.y - f.h / 2)) < 90);
      if ((threat || projThreat) && Math.random() < (lvl >= 8 ? lvl * 0.1 : lvl * 0.07)) {
        if (Math.random() < 0.6) { out.shieldHeld = true; ai.shieldT = 14; } else { out.jump = true; out.jumpHeld = true; }
        return out;
      }
    }
    if (ai.shieldT > 0) {
      ai.shieldT--; out.shieldHeld = true;
      // out of shield: grab as soon as the attacker is close and stuck in the tail of the move (good CPUs don't wait for the timer)
      const grabR = f.w / 2 + T.w / 2 + f.u * 0.9;
      const punishable = T.move && T.move.def.hits && T.move.t > T.move.def.hits[T.move.def.hits.length - 1].e;
      if (lvl >= 5 && adx < grabR && Math.abs(dy) < 50 && Math.sign(dx) === f.facing && ((lvl >= 7 && punishable && f.shieldStun <= 0) || ai.shieldT < 4)) { out.attack = true; ai.shieldT = 0; }
      else if (lvl >= 7 && ai.shieldT < 10 && !T.move && f.shieldStun <= 0) ai.shieldT = 0;   // nothing coming any more: drop the shield
      return out;
    }

    // ----- items -----
    const orb = W.items.find(i => i.kind === 'ruach');
    if (orb && Math.random() < 0.9) { const r = goHit(W, f, orb.x, orb.y - 20, out, ai, lvl); if (r) return r; }
    if (!f.held && f.grounded) {
      const it = W.items.find(i => i.kind !== 'ruach' && i.def.type !== 'food' && Math.abs(i.x - f.x) < 220 && Math.abs(i.y - f.y) < 40 && i.grounded);
      const food = W.items.find(i => i.def.type === 'food' && Math.abs(i.x - f.x) < 400 && f.damage > 30);
      const want = food || it;
      if (want && adx > 120) {
        if (Math.abs(want.x - f.x) > 18) { out.x = Math.sign(want.x - f.x); return out; }
        if (it && acting) { out.attack = true; return out; }
      }
    }
    if (f.held && acting) {
      const d = f.held.def;
      if ((d.type === 'shooter' || d.type === 'throw') && Math.abs(dy) < 70 && adx < 600) {
        if (Math.sign(dx) !== f.facing) { out.x = dir; return out; }
        out.attack = true; out.x = dir * 0.2; return out;
      }
    }

    // ----- offense -----
    const reach = f.u * 1.5 * (ENG.ARCH[f.hero.arch] || { reach: 1 }).reach * (f.held && f.held.def.reach ? f.held.def.reach : 1) + f.w / 2 + T.w / 2;
    const tStun = T.hitstun > 0 || T.hitlag > 0;
    const helplessT = !!T.stun || T.state === 'down' || T.helpless || (T.landLag > 4);

    // follow-ups while one of our own moves is still running (buffered by the engine, so timing is forgiving)
    if (f.move && !f.move.def.special) {
      const m = f.move, d = m.def;
      // jab > jab2 > finisher
      if (d.next && m.t >= d.chainAt - 2 && adx < reach * 1.4 && (m.hit || lvl <= 5) && Math.random() < 0.12 + lvl * 0.09) { out.attack = true; return out; }
      // launcher connected: jump-cancel and chase
      if (d.jc && m.hit && lvl >= 6 && m.t > d.hits[0].e && T.damage < 110 && Math.random() < lvl * 0.09) { out.jump = true; out.jumpHeld = true; out.x = dir; return out; }
      // charged smash: let go early if the target is about to escape
      return out;
    }

    if (f.canAct() && !f.helpless) {
      if (ai.idle > 0) { // beginner pause: shuffle about, no attacks
        if (adx > reach * 1.5) out.x = dir * 0.5;
        if (f.grounded && !overGround(W, f.x + dir * 50)) out.x = 0;
        return out;
      }
      // air chase: the target is in hitstun above/near us -> swing as soon as it is in range
      if (!f.grounded && lvl >= 5 && tStun && adx < reach * 0.9 + 20 && dy < 20 && dy > -f.h * 1.5 - 30) {
        out.attack = true;
        if (dy < -f.h * 0.45) out.y = -1; else out.x = Math.abs(dx) > 14 ? dir : 0;
        return out;
      }
      // projectile users poke from range (turn first, so it is the neutral special and not the side one)
      const nsp = f.hero.specials && f.hero.specials.neutral;
      if (nsp && (nsp.kind === 'shoot' || nsp.kind === 'skyfall') && adx > 220 && adx < 650 && Math.abs(dy) < 80 && acting && Math.random() < 0.06 * lvl / 3) {
        if (Math.sign(dx) !== f.facing) { out.x = dir * 0.3; return out; }
        out.special = true; return out;
      }
      const ssp = f.hero.specials && f.hero.specials.side;
      if (ssp && (ssp.kind === 'dash' || ssp.kind === 'shoot') && adx > 140 && adx < 380 && Math.abs(dy) < 50 && acting && Math.random() < 0.035 * lvl / 3 && f.grounded) {
        out.special = true; out.x = dir; return out;
      }
      if (f.hero.golem && acting && f.grounded && Math.random() < 0.05) {
        const g = ENG.golemOf(W, f);
        if (!g) { out.special = true; out.y = 1; return out; }
        if (Math.abs(T.x - g.x) < 120 && Math.abs(T.y - g.y) < 120) { out.special = true; return out; }
        if (adx < 350 && Math.random() < 0.4) { out.special = true; out.x = dir; return out; }
      }
      const dsp = f.hero.specials && f.hero.specials.down;
      if (dsp && acting && Math.random() < 0.012 * lvl / 3 && f.grounded && adx > 200) { out.special = true; out.y = 1; return out; }
      if (dsp && (dsp.kind === 'heal') && f.damage > 60 && adx > 300 && acting && Math.random() < 0.08) { out.special = true; out.y = 1; return out; }

      if (adx < reach && Math.abs(dy) < f.h * 0.8 + 20) {
        if (!acting) return out;
        if (Math.sign(dx) !== f.facing && f.grounded) { out.x = dir * 0.3; return out; }
        if (f.grounded) {
          const r = Math.random();
          // would a forward smash from here actually take the stock? (the best CPUs work it out, the others go by a rough percent)
          const sdmg = 16 * (ENG.ARCH[f.hero.arch] || { pow: 1 }).pow * f.hero.power * (f.held && f.held.def.power ? f.held.def.power : 1);
          const room = (dir > 0 ? W.stage.blast.r - T.x : T.x - W.stage.blast.l) / 0.83;
          const kbNeed = Math.sqrt(2 * ENG.KB_DECAY * room) / ENG.KB_SCALE;
          const kbHave = ENG.knockback({ damage: T.damage + sdmg, hero: T.hero }, sdmg, 35, 100);
          const killPct = lvl >= 8 ? kbHave > kbNeed * 0.93 : T.damage > 125 - lvl * 4 || (lvl <= 3 && r < 0.08);
          if (T.state === 'shield' && r < 0.5) { out.shieldHeld = true; out.attack = true; return out; }
          // punish a helpless target with a charged smash (better CPUs charge longer)
          if (helplessT && lvl >= 4 && (killPct || r < 0.5)) {
            // charge only for as long as the target will stay put (a smash takes ~14 frames to come out)
            const stuck = T.stun ? T.stun.t : T.state === 'down' ? 20 - T.stateT : T.landLag;
            out.smash = true; out.smashHeld = true; ai.chargeFor = Math.max(0, Math.min(40, stuck - 20, lvl * 5)); if (dy < -f.h * 0.4 && adx < 50) out.y = -1; else out.x = dir; return out;
          }
          if (killPct && r < 0.4 + lvl * 0.02) { out.smash = true; out.smashHeld = true; ai.chargeFor = Math.random() < 0.3 ? 12 : 0; if (dy < -f.h * 0.4) out.y = -1; else out.x = dir; return out; }
          if (dy < -f.h * 0.4 && adx < 50) { out.attack = true; out.y = -1; return out; }
          if (dy < -f.h * 0.4 && lvl >= 4) { out.jump = true; out.jumpHeld = dy < -120; out.x = dir; return out; }   // target overhead but not in up-tilt range: go up after it
          // at low percent good CPUs like the launchers (down tilt, or up tilt point blank) that start combos
          if (lvl >= 6 && T.damage < 80 && r < 0.25 + lvl * 0.03) { out.attack = true; out.y = adx < 46 && r < 0.12 ? -1 : 1; return out; }
          if (r < 0.34) { out.attack = true; return out; }
          if (r < 0.6) { out.attack = true; out.x = dir; return out; }
          if (r < 0.75) { out.attack = true; out.y = 1; return out; }
          if (r < 0.85) { out.shieldHeld = true; out.attack = true; return out; }
          out.special = true; out.x = Math.random() < 0.5 ? dir : 0; return out;
        } else {
          if (dy < -30) { out.attack = true; out.y = -1; return out; }
          if (dy > 40) { out.attack = true; out.y = 1; return out; }
          out.attack = true; out.x = Math.sign(dx) === f.facing ? (Math.random() < 0.7 ? dir : 0) : dir; return out;
        }
      }
      // whiff punish: the target is stuck in the recovery of a missed move -> rush in
      if (lvl >= 8 && f.grounded && T.move && !T.move.hit && T.move.def.hits && T.move.t > T.move.def.hits[T.move.def.hits.length - 1].e && adx < reach + 110 && Math.abs(dy) < 60) {
        out.x = dir; if (f.state === 'run' && f.stateT >= 6 && adx < reach + 40) out.attack = true; return out;
      }
      // approach (beginners walk, everyone else dashes)
      out.x = dir * (lvl <= 2 ? 0.55 : lvl === 3 ? (adx > 260 ? 1 : 0.6) : 1);
      if (f.grounded && !overGround(W, f.x + dir * 70) && !(T.grounded && W.stage.ground.length > 1)) { out.x = 0; }
      if (f.grounded && W.stage.ground.length > 1 && !overGround(W, f.x + dir * 50)) { out.jump = true; out.jumpHeld = true; out.x = dir; }
      if (dy < -90 && f.grounded && acting && Math.random() < 0.3) { out.jump = true; out.jumpHeld = true; }
      // chase a launched target into the air
      if (lvl >= 6 && f.grounded && tStun && !T.grounded && dy < -50 && adx < 220 && Math.random() < lvl * 0.06) { out.jump = true; out.jumpHeld = true; }
      // short-hop aerial approach
      if (lvl >= 5 && f.grounded && acting && adx > reach && adx < reach + 150 && Math.abs(dy) < 50 && Math.random() < 0.012 * lvl && overGround(W, f.x + dir * 120)) { out.jump = true; out.x = dir; }
      if (!f.grounded && dy < -60 && f.jumps > 0 && f.vy > 0 && Math.random() < 0.08) { out.jump = true; out.jumpHeld = true; }
      if (f.grounded && f.plat && W.stage.plats.includes(f.plat) && dy > 60 && Math.random() < 0.1) out.y = 1;
      // fast-fall back to the ground when nothing is happening up here
      if (lvl >= 6 && !f.grounded && f.vy > 3 && !f.fastfall && dy > 30 && overGround(W, f.x) && overGround(W, f.x + f.vx * 8)) { out.y = 1; out.x *= 0.69; }
      if (lvl <= 2 && Math.random() < 0.3) out.x *= 0.4;
    }
    return out;
  }

  function goHit(W, f, x, y, out, ai, lvl) {
    const dx = x - f.x, dy = y - (f.y - f.h / 2);
    if (Math.abs(dx) > 500) return null;
    if (Math.abs(dx) < 70 && Math.abs(dy) < 90) { if (f.canAct() && ai.t % 4 === 0) { out.attack = true; if (Math.sign(dx) !== f.facing) out.x = Math.sign(dx); if (dy < -40) out.y = -1; } return out; }
    out.x = Math.sign(dx);
    if (!overGround(W, f.x + out.x * 60) && f.grounded) out.x = 0;
    if (dy < -80 && f.grounded) { out.jump = true; out.jumpHeld = true; }
    if (dy < -60 && !f.grounded && f.jumps > 0 && f.vy > 1) out.jump = true;
    return out;
  }

  function recover(W, f, out, ai, lvl) {
    if (f.grounded || f.state === 'ledge') {
      if (f.state === 'ledge' && f.stateT > 10 + Math.random() * 30) { const r = Math.random(); if (r < 0.4) out.y = -1; else if (r < 0.7) out.jump = true; else out.attack = true; return out; }
      return null;
    }
    const off = !overGround(W, f.x) && !W.stage.plats.some(p => f.x > p.x && f.x < p.x + p.w && f.y <= p.y + 4);
    const below = f.y > -10;
    if (!off && !below) return null;
    const L = nearestLedge(W, f);
    if (!L) return null;
    const dyL = f.y - L.y; // positive when below the ledge
    // below the lip: come up beside the ledge (never under the stage, where the up special would bonk); above it: drift in over the stage
    const beside = (f.x - L.x) * L.side > f.w / 2 - 6;
    const tx = dyL > -12 ? L.x + L.side * (f.w / 2 + 14) : L.x - L.side * 40;
    out.x = Math.abs(tx - f.x) < 5 ? 0 : Math.sign(tx - f.x);
    if (f.hitstun > 0) return out;
    if (f.helpless || (f.move && !f.move.def.special)) return out;
    const deep = dyL > 230;
    if (f.vy > 0 && dyL > -40 && f.jumps > 0 && (beside || dyL < 0 || deep)) { out.jump = true; out.jumpHeld = true; return out; }
    if (f.vy > -2 && dyL > (lvl >= 4 ? 20 : -20) && f.jumps === 0 && !ai.upBUsed && !f.move && (beside || deep)) { out.special = true; out.y = -1; ai.upBUsed = true; return out; }
    if (Math.abs(f.x - L.x) > 280 && f.jumps === 0 && !ai.upBUsed && f.hero.specials && f.hero.specials.side && f.hero.specials.side.kind === 'dash' && !f.usedSideAir && dyL < 60) { out.special = true; out.x = Math.sign(tx - f.x); return out; }
    return out;
  }

  return { think };
})();
