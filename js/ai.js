/* Torah Fighter — CPU opponents (levels 1–9). Produces the same input shape as a human controller. */
'use strict';

const AI = (() => {
  const blank = () => ({ x: 0, y: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, special: false, specialHeld: false, smash: false, smashHeld: false, shield: false, shieldHeld: false, grab: false, pause: false, cx: 0, cy: 0 });

  function overGround(W, x) { return W.stage.ground.some(g => x > g.x + 8 && x < g.x + g.w - 8); }
  function nearestLedge(W, f) {
    let best = null, bd = 1e9;
    for (const L of W.ledges) { const d = Math.abs(L.x - f.x) + Math.abs(L.y - f.y) * 0.5; if (d < bd) { bd = d; best = L; } }
    return best;
  }

  function think(f, W) {
    const lvl = f.cpu || 3;
    const ai = f.ai || (f.ai = { hold: blank(), t: 0, react: 0, plan: null, planT: 0, wait: 0, upBUsed: false, jumpHeldT: 0 });
    const out = blank();
    if (f.dead) return out;
    ai.t++;
    if (f.grounded) ai.upBUsed = false;
    if (W.cfg.mode === 'training' && W.cfg.cpuMode && W.cfg.cpuMode !== 'cpu') {
      if (W.cfg.cpuMode === 'walk') { out.x = Math.sin(W.t * 0.01) > 0 ? 0.5 : -0.5; if (!overGround(W, f.x + out.x * 60)) out.x *= -1; }
      if (W.cfg.cpuMode === 'jump' && f.grounded && W.t % 70 === 0) { out.jump = true; out.jumpHeld = true; }
      if (W.cfg.cpuMode === 'shield') out.shieldHeld = true;
      return recover(W, f, out, ai, lvl) || out;
    }
    if (f.onHalo) { if (ai.t % 50 === 0 && Math.random() < 0.5) out.y = 1; return out; }
    if (f.grabbedBy || f.stun) { if (ai.t % Math.max(2, 10 - lvl) === 0) out.attack = true; return out; }

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
      if ((threat || projThreat) && Math.random() < lvl * 0.07) {
        if (Math.random() < 0.6) { out.shieldHeld = true; ai.shieldT = 14; } else { out.jump = true; out.jumpHeld = true; }
        return out;
      }
    }
    if (ai.shieldT > 0) { ai.shieldT--; out.shieldHeld = true; if (ai.shieldT < 4 && adx < 70 && lvl >= 5) out.attack = true; return out; }

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
    if (f.canAct() && !f.helpless) {
      // projectile users poke from range
      const nsp = f.hero.specials && f.hero.specials.neutral;
      if (nsp && (nsp.kind === 'shoot' || nsp.kind === 'skyfall') && adx > 220 && adx < 650 && Math.abs(dy) < 80 && acting && Math.random() < 0.06 * lvl / 3) {
        if (Math.sign(dx) !== f.facing) out.x = dir * 0.4;
        out.special = true; return out;
      }
      const ssp = f.hero.specials && f.hero.specials.side;
      if (ssp && (ssp.kind === 'dash' || ssp.kind === 'shoot') && adx > 140 && adx < 380 && Math.abs(dy) < 50 && acting && Math.random() < 0.035 * lvl / 3 && f.grounded) {
        out.special = true; out.x = dir; return out;
      }
      if (f.hero.golem && acting && Math.random() < 0.05) {
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
        if (Math.sign(dx) !== f.facing) { out.x = dir * 0.3; return out; }
        if (f.grounded) {
          const r = Math.random();
          if (T.state === 'shield' && r < 0.5) { out.shieldHeld = true; out.attack = true; return out; }
          if (T.damage > 90 - lvl * 3 && r < 0.45) { out.smash = true; out.smashHeld = Math.random() < 0.5; out.x = dir; return out; }
          if (dy < -f.h * 0.4) { out.attack = true; out.y = -1; return out; }
          if (r < 0.3) { out.attack = true; return out; }
          if (r < 0.6) { out.attack = true; out.x = dir; return out; }
          if (r < 0.75) { out.attack = true; out.y = 1; return out; }
          if (r < 0.85) { out.shieldHeld = true; out.attack = true; return out; }
          out.special = true; out.x = Math.random() < 0.5 ? dir : 0; return out;
        } else {
          if (dy < -30) { out.attack = true; out.y = -1; return out; }
          if (dy > 40) { out.attack = true; out.y = 1; return out; }
          out.attack = true; out.x = Math.random() < 0.7 ? dir : 0; return out;
        }
      }
      // approach
      out.x = dir * (adx > 300 ? 1 : 0.85);
      if (f.grounded && !overGround(W, f.x + dir * 70) && !(T.grounded && W.stage.ground.length > 1)) { out.x = 0; }
      if (f.grounded && W.stage.ground.length > 1 && !overGround(W, f.x + dir * 50)) { out.jump = true; out.jumpHeld = true; out.x = dir; }
      if (dy < -90 && f.grounded && acting && Math.random() < 0.3) { out.jump = true; out.jumpHeld = true; }
      if (!f.grounded && dy < -60 && f.jumps > 0 && f.vy > 0 && Math.random() < 0.08) out.jump = true;
      if (f.grounded && f.plat && W.stage.plats.includes(f.plat) && dy > 60 && Math.random() < 0.1) out.y = 1;
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
    const tx = L.x - L.side * 40;
    out.x = Math.sign(tx - f.x) || 0;
    if (f.hitstun > 0) return out;
    if (f.helpless || (f.move && !f.move.def.special)) return out;
    const dyL = f.y - L.y; // positive when below the ledge
    if (f.vy > 0 && dyL > -40 && f.jumps > 0) { out.jump = true; out.jumpHeld = true; return out; }
    if (f.vy > -2 && dyL > (lvl >= 4 ? 20 : -20) && f.jumps === 0 && !ai.upBUsed && !f.move) { out.special = true; out.y = -1; ai.upBUsed = true; return out; }
    if (Math.abs(f.x - L.x) > 280 && f.jumps === 0 && !ai.upBUsed && f.hero.specials && f.hero.specials.side && f.hero.specials.side.kind === 'dash' && !f.usedSideAir && dyL < 60) { out.special = true; out.x = Math.sign(tx - f.x); return out; }
    return out;
  }

  return { think };
})();
