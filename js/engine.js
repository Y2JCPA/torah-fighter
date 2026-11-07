/* Torah Fighter — core engine: fighters, moves, physics, knockback, items, projectiles, minions, finals, match rules. */
'use strict';

const ENG = (() => {
  const KB_SCALE = 0.16, KB_DECAY = 0.42, MAX_FALL = 10, FAST_FALL = 15;
  const ARCH = {
    fists: { reach: 0.85, pow: 1.0, spd: 0.85 }, staff: { reach: 1.3, pow: 0.92, spd: 1.0 }, sword: { reach: 1.15, pow: 1.02, spd: 0.95 },
    club: { reach: 1.0, pow: 1.15, spd: 1.08 }, spear: { reach: 1.45, pow: 0.95, spd: 1.0 }, mallet: { reach: 0.95, pow: 1.12, spd: 1.0 }
  };
  const unitOf = (h) => 42 * Math.pow(h / 90, 0.75);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /* ---------- Normal attacks, generated from the hero's archetype ---------- */
  function buildNormals(hero, item) {
    const a = ARCH[hero.arch] || ARCH.fists;
    const reach = a.reach * (item ? item.reach : 1);
    const pow = a.pow * hero.power * (item ? item.power : 1);
    const spd = a.spd * (item && item.slow ? item.slow : 1);
    const T = (frames, hits, anim, extra = {}) => ({
      frames: Math.round(frames * spd), anim,
      hits: hits.map(h => ({ ...h, s: Math.round(h.s * spd), e: Math.round(h.e * spd), dmg: h.dmg * pow })), ...extra
    });
    const r = reach;
    return {
      jab: T(18, [{ s: 3, e: 5, x: 0.2, y: -1.75, w: 1.0 * r, h: 0.6, dmg: 3, bkb: 14, kbg: 30, ang: 45 }], 'jab'),
      jab2: T(22, [{ s: 4, e: 7, x: 0.2, y: -1.8, w: 1.15 * r, h: 0.7, dmg: 5, bkb: 30, kbg: 60, ang: 40 }], 'swing'),
      ftilt: T(26, [{ s: 7, e: 10, x: 0.2, y: -1.6, w: 1.35 * r, h: 0.75, dmg: 8, bkb: 25, kbg: 90, ang: 35 }], 'swing'),
      utilt: T(26, [{ s: 6, e: 11, x: -0.8, y: -3.0, w: 1.7, h: 1.3, dmg: 7, bkb: 30, kbg: 100, ang: 85 }], 'up'),
      dtilt: T(20, [{ s: 5, e: 8, x: 0.2, y: -0.55, w: 1.4 * r, h: 0.55, dmg: 6, bkb: 20, kbg: 70, ang: 22 }], 'low'),
      dash: T(32, [{ s: 6, e: 14, x: 0.0, y: -1.7, w: 1.2 * r, h: 1.1, dmg: 9, bkb: 35, kbg: 80, ang: 50 }], 'thrust', { dash: true }),
      fsmash: T(46, [{ s: 14, e: 18, x: 0.2, y: -1.85, w: 1.7 * r, h: 1.1, dmg: 16, bkb: 35, kbg: 100, ang: 40 }], 'overhead', { charge: 8, smash: true }),
      usmash: T(44, [{ s: 11, e: 16, x: -1.0, y: -3.4, w: 2.0, h: 1.7, dmg: 15, bkb: 35, kbg: 98, ang: 88 }], 'up', { charge: 6, smash: true }),
      dsmash: T(42, [{ s: 9, e: 13, x: -(0.4 + 1.4 * r), y: -0.6, w: 2 * (0.4 + 1.4 * r), h: 0.6, dmg: 13, bkb: 30, kbg: 95, ang: 28, away: true }], 'spin', { charge: 5, smash: true }),
      nair: T(30, [{ s: 4, e: 16, x: -1.0, y: -2.4, w: 2.0, h: 2.4, dmg: 8, bkb: 20, kbg: 80, ang: 45, away: true }], 'spin', { air: true, land: 7 }),
      fair: T(34, [{ s: 8, e: 12, x: 0.2, y: -2.1, w: 1.4 * r, h: 1.4, dmg: 11, bkb: 30, kbg: 95, ang: 42 }], 'overhead', { air: true, land: 10 }),
      bair: T(30, [{ s: 7, e: 11, x: -(0.3 + 1.3 * r), y: -1.9, w: 1.3 * r, h: 1.1, dmg: 12, bkb: 30, kbg: 100, ang: 140 }], 'back', { air: true, land: 9 }),
      uair: T(28, [{ s: 5, e: 10, x: -0.8, y: -3.3, w: 1.6, h: 1.3, dmg: 9, bkb: 25, kbg: 90, ang: 86 }], 'up', { air: true, land: 7 }),
      dair: T(40, [{ s: 10, e: 16, x: -0.6, y: -0.4, w: 1.2, h: 1.1, dmg: 12, bkb: 25, kbg: 85, ang: -75 }], 'down', { air: true, land: 14 }),
      grab: T(30, [{ s: 6, e: 8, x: 0.2, y: -1.8, w: 1.0, h: 1.0, grab: true }], 'grab', { grab: true }),
      getup: T(24, [{ s: 6, e: 10, x: -(0.4 + r), y: -0.8, w: 2 * (0.4 + r), h: 0.8, dmg: 6, bkb: 40, kbg: 40, ang: 30, away: true }], 'spin'),
      ledge: T(26, [{ s: 8, e: 12, x: 0.0, y: -1.2, w: 1.3 * r, h: 1.0, dmg: 7, bkb: 40, kbg: 40, ang: 35 }], 'swing')
    };
  }

  /* ---------- Fighter ---------- */
  class Fighter {
    constructor(hero, slot, opt) {
      this.hero = hero; this.slot = slot; this.team = opt.team ?? slot; this.cpu = opt.cpu || 0; this.device = opt.device || null;
      this.w = hero.w; this.h = hero.h; this.u = unitOf(hero.h);
      this.color = opt.color || hero.color; this.palette = opt.palette || 0;
      this.stocks = opt.stocks; this.damage = 0; this.hp = hero.boss ? hero.hp : 0; this.isBoss = !!hero.boss;
      this.normals = buildNormals(hero, null);
      this.stats = { kos: 0, falls: 0, sds: 0, dealt: 0, taken: 0 };
      this.score = 0; this.lastHitBy = null; this.lastHitT = 0;
      this.inp = null; this.out = false; this.dead = false;
      this.reset(0, -200);
    }
    reset(x, y) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.lvx = 0; this.lvy = 0; this.facing = x > 0 ? -1 : 1;
      this.grounded = false; this.plat = null; this.jumps = this.hero.jumps; this.state = 'fall'; this.stateT = 0;
      this.move = null; this.hitstun = 0; this.hitlag = 0; this.invuln = 0; this.shieldHP = 100; this.shieldStun = 0;
      this.dropT = 0; this.ledge = null; this.ledgeCD = 0; this.fastfall = false; this.held = null; this.grabbing = null; this.grabbedBy = null;
      this.stun = null; this.buffs = {}; this.reflect = null; this.finalReady = false; this.inFinal = false; this.airdodged = false;
      this.helpless = false; this.landLag = 0; this.jumpSquat = 0; this.shortHop = false; this.jabCombo = 0; this.slowAcc = 0;
      this.respawnT = 0; this.onHalo = false; this.armor = 0; this.damageShake = 0; this.trail = [];
    }
    get cx() { return this.x; }
    get cy() { return this.y - this.h / 2; }
    hurtbox() { const sh = this.state === 'crouch' ? 0.65 : 1; return { x: this.x - this.w / 2, y: this.y - this.h * sh, w: this.w, h: this.h * sh }; }
    canAct() { return !this.move && this.hitstun <= 0 && !this.stun && this.landLag <= 0 && this.shieldStun <= 0 && !this.grabbedBy && !this.grabbing && !this.inFinal && this.state !== 'ledge' && this.state !== 'roll' && this.state !== 'spotdodge' && this.state !== 'airdodge' && this.state !== 'down' && this.state !== 'dead'; }
    speedMul() { return (this.buffs.speed ? 1.35 : 1) * (this.held && this.held.def.heavy ? 0.6 : 1); }
  }

  /* ---------- World ---------- */
  function createWorld(cfg) {
    const stage = cfg.stage;
    const W = {
      cfg, stage, t: 0, fighters: [], projectiles: [], items: [], minions: [], fields: [], effects: [], finals: [], hitboxes: [],
      shake: 0, flash: 0, slowmo: 0, cam: { x: 0, y: -200, z: 1 }, over: false, winner: null, timeLeft: cfg.time ? cfg.time * 60 : 0,
      itemTimer: 300, orbTimer: 900 + Math.random() * 600, hazardT: 400, hazard: null, ledges: [], events: [], countdown: cfg.noCountdown ? 0 : 180,
      wallsDown: 0, paused: false, endT: 0
    };
    // ledges from solid ground
    for (const g of stage.ground) {
      W.ledges.push({ x: g.x, y: g.y, side: -1, g, owner: null });
      W.ledges.push({ x: g.x + g.w, y: g.y, side: 1, g, owner: null });
    }
    const spawns = spawnPoints(stage, cfg.players.length);
    cfg.players.forEach((p, i) => {
      const f = new Fighter(p.hero, i, { team: cfg.teams ? p.team : i, cpu: p.cpu, device: p.device, stocks: cfg.stocks || 3, color: PCOLORS[i], palette: p.palette || 0 });
      f.reset(spawns[i], groundYAt(stage, spawns[i]) - 2); f.state = 'idle'; f.grounded = true; f.facing = spawns[i] > 0 ? -1 : 1;
      f.plat = groundAt(stage, spawns[i]);
      if (p.hero.golem) spawnGolem(W, f);
      if (p.hero.boss) { f.stocks = 1; }
      W.fighters.push(f);
    });
    return W;
  }
  const PCOLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];

  function spawnPoints(stage, n) {
    const g = stage.ground.reduce((a, b) => (b.w > a.w ? b : a));
    const pts = [];
    if (stage.ground.length > 1) {
      const gs = stage.ground;
      const opts = [gs[0].x + gs[0].w * 0.35, gs[1].x + gs[1].w * 0.65, gs[0].x + gs[0].w * 0.7, gs[1].x + gs[1].w * 0.3];
      for (let i = 0; i < n; i++) pts.push(opts[i % 4]);
      return pts;
    }
    for (let i = 0; i < n; i++) pts.push(g.x + g.w * (n === 1 ? 0.5 : 0.18 + 0.64 * i / (n - 1)));
    if (n === 2) return [g.x + g.w * 0.25, g.x + g.w * 0.75];
    return pts;
  }
  function groundAt(stage, x) { return stage.ground.find(g => x >= g.x && x <= g.x + g.w) || stage.ground[0]; }
  function groundYAt(stage, x) { const g = groundAt(stage, x); return g.y + (g.slope ? slopeOffset(g, x) : 0); }
  function slopeOffset(g, x) { return 0; }

  /* ---------- Effects ---------- */
  function fx(W, type, x, y, o = {}) { W.effects.push({ type, x, y, t: 0, life: o.life || 20, ...o }); }
  function sparks(W, x, y, n, color, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(2, 8) * power;
      fx(W, 'spark', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: rnd(12, 26) });
    }
  }
  function text(W, x, y, str, color = '#fff', size = 22) { fx(W, 'text', x, y, { str, color, size, life: 50, vy: -1.2 }); }

  /* ---------- Hitbox helpers ---------- */
  function hbRect(f, hb) {
    const u = f.u;
    const w = hb.w * u, h = hb.h * u, y = f.y + hb.y * u;
    const x = f.facing > 0 ? f.x + hb.x * u : f.x - hb.x * u - w;
    return { x, y, w, h };
  }

  function startMove(W, f, def, opts = {}) {
    f.move = { def, t: 0, hitSet: new Set(), charge: 0, data: {}, ...opts };
    if (def.anim) Audio.play('swing');
    if (def.dash && f.grounded) f.vx = f.facing * Math.max(Math.abs(f.vx), f.hero.run * 0.9);
    if (def.onStart) def.onStart(W, f, f.move);
  }

  /* ---------- Specials ---------- */
  function specialDef(W, f, dirKey) {
    const sp = f.hero.specials[dirKey];
    const base = { special: true, name: sp.name, kind: sp.kind, sp };
    switch (sp.kind) {
      case 'shoot': return {
        ...base, frames: sp.startup + sp.end + (sp.stagger ? sp.stagger * sp.count : 0), anim: 'shoot', chargeAt: sp.chargeable ? sp.startup - 2 : null, chargeMax: sp.chargeable || 0,
        onFrame(W, f, m) {
          for (let i = 0; i < sp.count; i++) {
            if (m.t === sp.startup + (sp.stagger ? i * sp.stagger : 0)) {
              const p = sp.proj, mul = 1 + (m.charge / (sp.chargeable || 1)) * (sp.chargeable ? 1.2 : 0);
              const off = sp.stagger ? 0 : (i - (sp.count - 1) / 2);
              const spreadOff = sp.stagger ? (i - (sp.count - 1) / 2) * 0.6 : off;
              spawnProj(W, f, p, {
                vx: p.vx * f.facing * (sp.chargeable ? 0.8 + 0.4 * (mul - 1) / 1.2 + 0.2 : 1), vy: p.vy + spreadOff * (sp.spread || 0) * p.vx,
                dmg: p.dmg * mul * f.hero.power, x: f.x + f.facing * f.w * 0.6, y: p.ground ? f.y - p.h : f.y - f.h * 0.62
              });
              Audio.play(p.type === 'arrow' ? 'arrow' : p.type === 'stone' ? 'sling' : p.type === 'sound' ? 'shofar' : p.type === 'geyser' ? 'water' : 'shoot');
            }
          }
        }
      };
      case 'melee': return {
        ...base, frames: sp.frames, anim: sp.anim, weapon: sp.weapon, hits: sp.hits.map(h => ({ ...h, dmg: h.dmg * f.hero.power })),
        onStart(W, f) { if (sp.lunge) f.vx = f.facing * sp.lunge; if (sp.fall && !f.grounded) f.vy = -4; if (sp.anim === 'flash') Audio.play('shofar'); },
        onFrame(W, f, m) {
          if (sp.fall && !f.grounded && m.t === 10) f.vy = sp.fall;
          if (sp.anim === 'flash' && m.t === 10) { W.flash = 8; fx(W, 'ring', f.x, f.cy, { r: 20, grow: 9, color: '#ffe680', life: 18 }); }
        }
      };
      case 'dash': return {
        ...base, frames: sp.startup + sp.dur + 14, anim: sp.low ? 'crawl' : 'thrust',
        hits: [{ s: sp.startup, e: sp.startup + sp.dur, x: 0.0, y: sp.low ? -1.1 : -1.9, w: 1.2, h: sp.low ? 1.1 : 1.6, ...sp.hit, dmg: sp.hit.dmg * f.hero.power, grabby: sp.grab, steal: sp.steal, lift: sp.lift, stopOnHit: true }],
        onFrame(W, f, m) {
          if (m.t >= sp.startup && m.t < sp.startup + sp.dur && !m.data.stopped) { f.vx = f.facing * sp.speed; if (!f.grounded) f.vy = Math.min(f.vy, 1.5); if (m.t % 3 === 0) fx(W, 'dust', f.x - f.facing * f.w / 2, f.y, { life: 14 }); }
          else if (m.t >= sp.startup + sp.dur) f.vx *= 0.8;
        }
      };
      case 'rise': return {
        ...base, frames: sp.startup + sp.dur, anim: sp.spin ? 'spin' : 'rise', helpless: true, armor: sp.armor, fx: sp.fx,
        hits: [{ s: sp.startup, e: sp.startup + sp.dur - 4, x: -0.8, y: -2.6, w: 1.6, h: 2.8, ...sp.hit, dmg: sp.hit.dmg * f.hero.power, away: false }],
        onStart(W, f) { f.vy = Math.min(f.vy, 0) * 0.3; f.vx *= 0.3; },
        onFrame(W, f, m) {
          if (m.t < sp.startup) { f.vy = Math.min(f.vy, 1); }
          if (m.t === sp.startup) {
            f.vy = sp.vy; f.grounded = false; f.plat = null; const sx = f.inp ? f.inp.x : 0; if (Math.abs(sx) > 0.2) f.facing = Math.sign(sx);
            f.vx = (f.inp ? f.inp.x : 0) * sp.vx; Audio.play('djump');
            if (sp.fx === 'stars' || sp.fx === 'chariot' || sp.fx === 'snow') sparks(W, f.x, f.y, 10, sp.fx === 'snow' ? '#fff' : sp.fx === 'chariot' ? '#ff7a1a' : '#ffe680');
          }
          if (m.t > sp.startup) { f.vx += (f.inp ? f.inp.x : 0) * 0.25; f.vx = clamp(f.vx, -sp.vx * 1.6, sp.vx * 1.6); if (sp.fx === 'chariot' && m.t % 2 === 0) fx(W, 'flame', f.x + rnd(-15, 15), f.y, { life: 18 }); }
          if (sp.armor) f.armor = 2;
        }
      };
      case 'counter': return {
        ...base, frames: sp.frames, anim: 'raise', counter: sp,
        onStart(W, f) { if (!f.grounded) f.vy = Math.min(f.vy, 1); }
      };
      case 'reflect': return {
        ...base, frames: sp.frames, anim: sp.absorb ? 'raise' : 'harp',
        onStart(W, f) {
          f.reflect = { r: sp.radius, absorb: sp.absorb, until: W.t + sp.frames - 6 }; if (!f.grounded) f.vy = Math.min(f.vy, 0);
          Audio.play(sp.absorb ? 'orb' : 'harp'); if (sp.heal) heal(W, f, sp.heal);
        },
        onFrame(W, f) { if (!f.grounded) f.vy = Math.min(f.vy, 1.5); }
      };
      case 'heal': return {
        ...base, frames: sp.frames, anim: 'eat',
        onFrame(W, f, m) {
          if (m.t === (sp.frames / 2 | 0)) {
            heal(W, f, sp.amount); if (sp.buff) { f.buffs[sp.buff] = sp.buffDur; text(W, f.x, f.y - f.h - 20, 'SPEED!', '#ffd34d'); }
            if (f.hero.id === 'eliyahu') for (let i = 0; i < 2; i++) fx(W, 'raven', f.x + (i ? 1 : -1) * 120, f.y - f.h - 80, { tx: f.x, ty: f.y - f.h, life: 40 });
          }
        }
      };
      case 'summon': return {
        ...base, frames: sp.startup + sp.end, anim: 'cast',
        onFrame(W, f, m) {
          if (m.t !== sp.startup) return;
          const mine = W.minions.filter(n => n.owner === f && n.type === sp.minion);
          while (mine.length >= sp.max) { const old = mine.shift(); old.life = 0; }
          if (sp.minion === 'fox') { spawnMinion(W, f, 'fox', { dir: f.facing }); if (sp.pair) spawnMinion(W, f, 'fox', { dir: -f.facing }); }
          else spawnMinion(W, f, sp.minion, { dir: f.facing });
        }
      };
      case 'field': return {
        ...base, frames: sp.startup + sp.end, anim: sp.field === 'sun' ? 'raise' : 'slam',
        onFrame(W, f, m) {
          if (m.t !== sp.startup) return;
          W.fields = W.fields.filter(z => z.owner !== f || z.type !== sp.field);
          if (sp.field === 'snow') W.fields.push({ type: 'snow', owner: f, x: f.x + f.facing * 50, y: f.y, r: 110, life: sp.dur, max: sp.dur, frozeAt: new Map() });
          else { W.fields.push({ type: 'sun', owner: f, x: f.x + f.facing * 90, y: f.y - f.h * 0.5, r: 170, life: sp.dur, max: sp.dur }); Audio.play('orb'); }
        }
      };
      case 'skyfall': return {
        ...base, frames: sp.startup + sp.end, anim: 'raise',
        onFrame(W, f, m) {
          if (m.t === 4) fx(W, 'target', f.x + f.facing * sp.dist, f.y, { life: sp.startup + 8 });
          if (m.t === sp.startup) { spawnProj(W, f, sp.proj, { x: f.x + f.facing * sp.dist - sp.proj.w / 2, y: f.y - 520, vx: 0, vy: sp.proj.vy, dmg: sp.proj.dmg * f.hero.power, life: 60 }); Audio.play('fire'); }
        }
      };
      case 'golem': return golemCmd(W, f, sp);
    }
    return null;
  }

  function heal(W, f, amt) { if (f.isBoss) return; f.damage = Math.max(0, f.damage - amt); text(W, f.x, f.y - f.h - 10, '-' + Math.round(amt) + '%', '#7dff9a'); Audio.play('heal'); }

  /* ---------- Golem (Maharal) ---------- */
  function spawnGolem(W, f) {
    const g = { type: 'golem', owner: f, x: f.x - f.facing * 50, y: f.y, vx: 0, vy: 0, hp: 70, max: 70, life: Infinity, facing: f.facing, grounded: false, act: null, actT: 0, cd: 60, w: 52, h: 112, hitSet: new Set(), kbx: 0 };
    W.minions.push(g); return g;
  }
  function golemOf(W, f) { return W.minions.find(m => m.type === 'golem' && m.owner === f && m.hp > 0 && m.life > 0); }
  function golemCmd(W, f, sp) {
    return {
      special: true, name: sp.name, kind: 'golem', frames: sp.frames, anim: sp.cmd === 'rebuild' ? 'cast' : 'point', sp,
      onFrame(W, f, m) {
        const g = golemOf(W, f);
        if (sp.cmd === 'toss') {
          if (m.t === 1) {
            if (g && Math.abs(g.x - f.x) < 160 && Math.abs(g.y - f.y) < 140) {
              g.act = 'toss'; g.actT = 0; g.facing = Math.sign(f.x - g.x) || 1; f.vy = sp.vy; f.vx = (f.inp ? f.inp.x : 0) * 3; Audio.play('golem');
              m.data.big = true; fx(W, 'ring', f.x, f.y, { r: 10, grow: 6, color: '#c8a47a', life: 14 });
            } else { f.vy = -12; f.vx = (f.inp ? f.inp.x : 0) * 2; }
            f.grounded = false; f.plat = null; m.def.helpless = true;
          }
          if (m.t > 1) { f.vx += (f.inp ? f.inp.x : 0) * 0.25; f.vx = clamp(f.vx, -4, 4); }
          return;
        }
        if (m.t !== 6) return;
        if (sp.cmd === 'rebuild') {
          if (!g) { const ng = spawnGolem(W, f); ng.x = f.x + f.facing * 40; ng.y = f.y - 2; ng.facing = f.facing; sparks(W, ng.x, ng.y - 50, 18, '#a67c52'); text(W, ng.x, ng.y - 130, 'אמת', '#ffe8a3', 30); Audio.play('golem'); }
          else { g.act = 'stomp'; g.actT = 0; }
          return;
        }
        if (!g) { text(W, f.x, f.y - f.h - 20, 'no golem!', '#ccc', 16); return; }
        g.facing = f.facing; g.act = sp.cmd; g.actT = 0; Audio.play('golem');
      }
    };
  }

  function updateGolem(W, g) {
    const f = g.owner;
    if (f.dead || f.stocks <= 0) { g.life = 0; return; }
    g.actT++;
    const tx = f.x - f.facing * 60;
    if (!g.act) {
      const d = tx - g.x;
      if (Math.abs(d) > 30) { g.vx = clamp(d * 0.08, -4.2, 4.2); g.facing = Math.sign(d); } else { g.vx *= 0.7; g.facing = f.facing; }
      if (g.grounded && f.grounded && f.y < g.y - 60 && Math.abs(d) < 220) { g.vy = -14; g.grounded = false; }
      if (g.grounded && !f.grounded && f.y < g.y - 150 && Math.abs(f.x - g.x) < 120 && f.vy > 0) { g.vy = -13; g.grounded = false; }
      // autonomous punch at nearby enemies
      g.cd--;
      if (g.cd <= 0) {
        const e = W.fighters.find(o => o !== f && o.team !== f.team && o.stocks > 0 && !o.dead && Math.abs(o.x - g.x) < 90 && Math.abs(o.y - g.y) < 100);
        if (e) { g.facing = Math.sign(e.x - g.x) || 1; g.act = 'jab'; g.actT = 0; g.cd = 75; }
      }
    } else {
      const A = { punch: [10, 18, 34], charge: [8, 34, 46], toss: [2, 10, 20], stomp: [12, 18, 34], jab: [8, 12, 24] }[g.act];
      if (g.act === 'charge' && g.actT >= A[0] && g.actT < A[1]) g.vx = g.facing * 9; else g.vx *= 0.8;
      if (g.actT === A[0]) g.hitSet = new Set();
      if (g.actT >= A[0] && g.actT <= A[1]) {
        const box = g.act === 'stomp' ? { x: g.x - 110, y: g.y - 40, w: 220, h: 40 } :
          g.act === 'toss' ? { x: g.x - 40, y: g.y - 170, w: 80, h: 80 } :
            { x: g.facing > 0 ? g.x : g.x - 85, y: g.y - 95, w: 85, h: 60 };
        const P = { punch: [14, 40, 95, 40], charge: [11, 45, 80, 45], toss: [6, 40, 50, 85], stomp: [10, 45, 75, 80], jab: [5, 25, 45, 50] }[g.act];
        W.hitboxes.push({ owner: f, src: g, rect: box, dmg: P[0], bkb: P[1], kbg: P[2], ang: P[3], dir: g.act === 'stomp' ? 0 : g.facing, away: g.act === 'stomp', hitSet: g.hitSet, x0: g.x });
        if (g.act === 'stomp' && g.actT === A[0]) { W.shake = Math.max(W.shake, 8); sparks(W, g.x, g.y, 12, '#a67c52'); Audio.play('golem'); }
      }
      if (g.actT >= A[2]) g.act = null;
    }
    g.vx += g.kbx; g.kbx *= 0.85;
    physicsSimple(W, g, 0.6);
    if (g.y > W.stage.blast.b || g.x < W.stage.blast.l || g.x > W.stage.blast.r) { g.hp = 0; }
    if (g.hp <= 0) { g.life = 0; sparks(W, g.x, g.y - 50, 20, '#8b6b4a', 1.5); text(W, g.x, g.y - 120, 'מת', '#ccc', 28); Audio.play('golem'); }
  }

  /* ---------- Simple physics for minions/items ---------- */
  function physicsSimple(W, o, grav = 0.55, bounce = 0) {
    const py = o.y;
    o.vy = Math.min(o.vy + grav, 14);
    o.x += o.vx; o.y += o.vy;
    o.grounded = false;
    const hw = (o.w || 20) / 2;
    for (const g of W.stage.ground) {
      if (o.x + hw > g.x && o.x - hw < g.x + g.w) {
        if (py <= g.y + 1 && o.y >= g.y && o.vy >= 0) { o.y = g.y; if (bounce && o.vy > 3) o.vy = -o.vy * bounce; else { o.vy = 0; o.grounded = true; } o.plat = g; }
        else if (o.y > g.y + 4 && o.y - (o.h || 20) < g.y + g.h) { // side push
          if (o.x < g.x + g.w / 2) o.x = g.x - hw; else o.x = g.x + g.w + hw; o.vx = 0;
        }
      }
    }
    for (const p of activePlats(W)) {
      if (o.x > p.x && o.x < p.x + p.w && py <= p.y + 1 && o.y >= p.y && o.vy >= 0 && !o.dropping) { o.y = p.y; o.vy = bounce && o.vy > 3 ? -o.vy * bounce : 0; o.grounded = o.vy === 0; o.plat = p; }
    }
  }
  function activePlats(W) { return W.stage.plats.filter(p => !(p.wall && W.wallsDown > 0)); }

  /* ---------- Minions ---------- */
  function spawnMinion(W, f, type, o = {}) {
    const base = { type, owner: f, x: f.x + (o.dir || f.facing) * 30, y: f.y - 4, vx: 0, vy: -2, facing: o.dir || f.facing, hp: 12, life: 360, hitSet: new Set(), grounded: false, w: 34, h: 24, t: 0, kbx: 0 };
    if (type === 'fox') Object.assign(base, { life: 200, hp: 8, vx: (o.dir || f.facing) * 6, w: 36, h: 24 });
    if (type === 'snake') Object.assign(base, { life: 420, hp: 10, w: 44, h: 16, vx: (o.dir || f.facing) * 2.4 });
    if (type === 'eshel') Object.assign(base, { life: 660, hp: 30, w: 50, h: 120, vx: 0, x: f.x + f.facing * 40 });
    Object.assign(base, o.over || {});
    W.minions.push(base); Audio.play(type === 'eshel' ? 'heal' : 'shoot');
    return base;
  }
  function updateMinion(W, m) {
    m.t++; m.life--;
    if (m.type === 'golem') return updateGolem(W, m);
    const f = m.owner;
    if (m.type === 'fox') {
      m.vx = m.facing * 6.5;
      if (m.t % 3 === 0) fx(W, 'flame', m.x - m.facing * 18, m.y - 22, { life: 16 });
      if (m.t % 20 === 0) m.hitSet = new Set();
      W.hitboxes.push({ owner: f, src: m, rect: { x: m.x - 20, y: m.y - 28, w: 40, h: 28 }, dmg: 7, bkb: 30, kbg: 55, ang: 50, dir: m.facing, hitSet: m.hitSet, fire: true, x0: m.x, onHit: () => { m.life = Math.min(m.life, 10); } });
    } else if (m.type === 'snake') {
      const e = nearestEnemy(W, f, m.x, m.y);
      if (e && m.grounded) { m.facing = Math.sign(e.x - m.x) || m.facing; }
      m.vx = m.facing * 2.6;
      if (m.grounded && atLedge(W, m)) { m.facing *= -1; m.vx = m.facing * 2.6; }
      if (m.t % 40 === 0) m.hitSet = new Set();
      W.hitboxes.push({ owner: f, src: m, rect: { x: m.x - 24, y: m.y - 22, w: 48, h: 22 }, dmg: 6, bkb: 25, kbg: 50, ang: 60, dir: m.facing, hitSet: m.hitSet, x0: m.x });
    } else if (m.type === 'eshel') {
      m.vx = 0;
      for (const o of W.fighters) if ((o === f || (W.cfg.teams && o.team === f.team)) && !o.dead && Math.abs(o.x - m.x) < 90 && Math.abs(o.y - m.y) < 140 && o.damage > 0) {
        o.damage = Math.max(0, o.damage - 0.06); if (W.t % 30 === 0) fx(W, 'text', o.x, o.y - o.h - 10, { str: '+', color: '#7dff9a', size: 20, life: 30, vy: -1 });
      }
    }
    m.vx += m.kbx; m.kbx *= 0.8;
    physicsSimple(W, m, 0.6);
    if (m.y > W.stage.blast.b) m.life = 0;
    if (m.hp <= 0) { m.life = 0; sparks(W, m.x, m.y - 10, 10, '#ccc'); }
  }
  function atLedge(W, m) {
    const g = m.plat; if (!g) return false;
    return (m.facing > 0 && m.x > g.x + g.w - 16) || (m.facing < 0 && m.x < g.x + 16);
  }
  function nearestEnemy(W, f, x, y) {
    let best = null, bd = 1e9;
    for (const o of W.fighters) {
      if (o === f || o.dead || o.stocks <= 0 || (W.cfg.teams && o.team === f.team)) continue;
      const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /* ---------- Projectiles ---------- */
  function spawnProj(W, f, p, o) {
    const pr = { owner: f, type: p.type, x: o.x, y: o.y, vx: o.vx ?? p.vx, vy: o.vy ?? p.vy, grav: p.grav || 0, w: p.w, h: p.h, dmg: o.dmg ?? p.dmg, bkb: p.bkb, kbg: p.kbg, ang: p.ang,
      life: o.life ?? p.life, pierce: !!p.pierce, multi: p.multi || 0, wind: !!p.wind, fire: !!p.fire, sleep: p.sleep || 0, ground: !!p.ground, hitSet: new Set(), t: 0, item: o.item || null, explode: o.explode || null, summon: o.summon || null };
    if (pr.ground) pr.y = f.y - p.h;
    W.projectiles.push(pr); return pr;
  }
  function updateProj(W, p) {
    p.t++; p.life--;
    p.vy += p.grav; p.x += p.vx; p.y += p.vy;
    if (p.multi && p.t % p.multi === 0) p.hitSet = new Set();
    if (p.ground) { // geyser travels along the ground; dies at ledge
      const g = W.stage.ground.find(g => p.x + p.w / 2 > g.x && p.x + p.w / 2 < g.x + g.w);
      if (!g) p.life = Math.min(p.life, 0);
      if (p.t % 3 === 0) fx(W, 'drop', p.x + rnd(0, p.w), p.y + rnd(0, p.h * 0.4), { vx: rnd(-2, 2), vy: rnd(-5, -1), life: 18 });
    }
    if (p.fire && p.t % 3 === 0) fx(W, 'flame', p.x + p.w / 2, p.y + p.h / 2, { life: 12 });
    if (p.type === 'firebolt' && p.t % 2 === 0) fx(W, 'flame', p.x + rnd(0, p.w), p.y + rnd(0, p.h), { life: 14 });
    // hit stage
    if (!p.ground && p.type !== 'sound') {
      for (const g of W.stage.ground) if (overlap(p, g)) {
        if (p.type === 'firebolt') { fx(W, 'ring', p.x + p.w / 2, g.y, { r: 10, grow: 5, color: '#ff8c1a', life: 14 }); }
        projDie(W, p, g.y); return;
      }
      if (p.vy > 0) for (const pl of activePlats(W)) if (p.x + p.w / 2 > pl.x && p.x + p.w / 2 < pl.x + pl.w && p.y + p.h >= pl.y && p.y + p.h - p.vy <= pl.y && (p.item || p.type === 'hail' || p.type === 'firebolt')) { projDie(W, p, pl.y); return; }
    }
    W.hitboxes.push({ owner: p.owner, proj: p, rect: { x: p.x, y: p.y, w: p.w, h: p.h }, dmg: p.dmg, bkb: p.bkb, kbg: p.kbg, ang: p.ang, dir: Math.sign(p.vx) || 1, hitSet: p.hitSet, fire: p.fire, sleep: p.sleep, wind: p.wind, x0: p.x });
    if (p.life <= 0) projDie(W, p);
  }
  function projDie(W, p, groundY) {
    if (p.dead) return; p.dead = true;
    if (p.explode) { explode(W, p.owner, p.x + p.w / 2, p.y + p.h / 2, p.explode); }
    else if (p.summon) { const m = spawnMinion(W, p.owner, p.summon, { dir: Math.sign(p.vx) || 1 }); m.x = p.x; m.y = (groundY ?? p.y) - 2; sparks(W, p.x, p.y, 8, '#6a4'); }
    else if (p.item && groundY !== undefined) { const it = p.item; it.x = p.x + p.w / 2; it.y = groundY; it.vx = 0; it.vy = 0; it.thrown = null; it.life = Math.min(it.life, 400); W.items.push(it); }
    else if (p.item) { const it = p.item; it.x = p.x + p.w / 2; it.y = p.y + p.h; it.vx = -p.vx * 0.2; it.vy = -4; it.life = Math.min(it.life, 400); W.items.push(it); }
    else if (p.type === 'hail' || p.type === 'stone') sparks(W, p.x, p.y, 5, '#ddd');
  }
  function explode(W, owner, x, y, e) {
    W.hitboxes.push({ owner, rect: { x: x - e.r, y: y - e.r, w: e.r * 2, h: e.r * 2 }, dmg: e.dmg, bkb: e.bkb, kbg: e.kbg, ang: 50, away: true, x0: x, hitSet: new Set(), fire: e.fire, hitsOwner: false });
    fx(W, 'boom', x, y, { r: e.r, life: 22 }); sparks(W, x, y, 20, '#ff9b30', 1.4); W.shake = Math.max(W.shake, 10); Audio.play('fire');
  }

  /* ---------- Items ---------- */
  function spawnItem(W, kind, x, y) {
    const def = ITEMS[kind];
    const it = { kind, def, x, y, vx: 0, vy: 0, w: 30, h: 26, life: kind === 'ruach' ? 1200 : 900, ammo: def.ammo || 0, hp: def.hp || 0, t: 0, grounded: false, bob: Math.random() * 6 };
    W.items.push(it); fx(W, 'ring', x, y, { r: 6, grow: 3, color: '#fff', life: 12 });
    return it;
  }
  function itemTick(W) {
    const cfg = W.cfg;
    if (cfg.items !== 'off' && !W.finals.length) {
      W.itemTimer--;
      if (W.itemTimer <= 0) {
        const freq = { low: 900, medium: 540, high: 280 }[cfg.items] || 540;
        W.itemTimer = freq * rnd(0.7, 1.3);
        if (W.items.length < 4) {
          const pool = Object.keys(ITEMS).filter(k => k !== 'ruach' && (!cfg.itemList || cfg.itemList.includes(k)));
          let tot = 0; pool.forEach(k => tot += ITEMS[k].weight); let r = Math.random() * tot, pick = pool[0];
          for (const k of pool) { r -= ITEMS[k].weight; if (r <= 0) { pick = k; break; } }
          const g = W.stage.ground[Math.floor(Math.random() * W.stage.ground.length)];
          spawnItem(W, pick, rnd(g.x + 40, g.x + g.w - 40), -600);
        }
      }
      if (cfg.finals !== false && (!cfg.itemList || cfg.itemList.includes('ruach'))) {
        W.orbTimer--;
        if (W.orbTimer <= 0 && !W.items.some(i => i.kind === 'ruach') && !W.fighters.some(f => f.finalReady || f.inFinal)) {
          W.orbTimer = rnd(1500, 2400); const it = spawnItem(W, 'ruach', rnd(-300, 300), -420); it.vx = rnd(-1.5, 1.5); it.vy = rnd(-1, 1);
        }
      }
    }
    for (const it of W.items) {
      it.t++; it.life--;
      if (it.kind === 'ruach') { // floats around
        it.vx += rnd(-0.08, 0.08); it.vy += rnd(-0.08, 0.08) + (it.y < -500 ? 0.06 : it.y > -60 ? -0.08 : 0);
        it.vx = clamp(it.vx, -2, 2); it.vy = clamp(it.vy, -1.5, 1.5); if (Math.abs(it.x) > 600) it.vx -= Math.sign(it.x) * 0.1;
        it.x += it.vx; it.y += it.vy; it.w = 40; it.h = 40;
        if (it.t % 4 === 0) fx(W, 'spark', it.x + rnd(-20, 20), it.y + rnd(-20, 20) - 20, { vx: 0, vy: -1, color: '#fff3a0', life: 16 });
      } else {
        physicsSimple(W, it, 0.5, 0.3);
        it.vx *= it.grounded ? 0.8 : 0.99;
      }
      if (it.y > W.stage.blast.b) it.life = 0;
    }
    W.items = W.items.filter(i => i.life > 0 && !i.taken);
  }
  function tryPickup(W, f) {
    if (f.held) return false;
    const hb = f.hurtbox(); hb.x -= 14; hb.w += 28;
    for (const it of W.items) {
      if (it.kind === 'ruach' || it.def.type === 'food') continue;
      if (overlap(hb, { x: it.x - it.w / 2, y: it.y - it.h, w: it.w, h: it.h })) {
        it.taken = true; f.held = { kind: it.kind, def: it.def, ammo: it.ammo, life: it.life }; Audio.play('pickup');
        if (it.def.type === 'melee') f.normals = buildNormals(f.hero, it.def);
        return true;
      }
    }
    return false;
  }
  function touchFood(W, f) {
    const hb = f.hurtbox();
    for (const it of W.items) {
      if (it.def.type !== 'food' || it.taken) continue;
      if (overlap(hb, { x: it.x - it.w / 2, y: it.y - it.h, w: it.w, h: it.h })) {
        it.taken = true; heal(W, f, it.def.heal);
        if (it.def.buff) { f.buffs[it.def.buff] = it.def.buffDur; text(W, f.x, f.y - f.h - 30, 'SPEED!', '#ffd34d'); }
      }
    }
  }
  function dropHeld(W, f, throwIt, dirx = 0, diry = 0) {
    const h = f.held; if (!h) return;
    f.held = null; f.normals = buildNormals(f.hero, null);
    const it = { kind: h.kind, def: h.def, x: f.x, y: f.y - f.h * 0.6, vx: 0, vy: 0, w: 30, h: 26, life: h.life, ammo: h.ammo, hp: 0, t: 0, grounded: false };
    if (h.def.type === 'shooter' && h.ammo <= 0) { sparks(W, f.x, f.y - f.h / 2, 6, '#ccc'); return; }
    if (!throwIt) { it.y = f.y; it.vy = -3; it.vx = f.facing * 2; W.items.push(it); return; }
    let vx = f.facing * 15, vy = -3;
    if (diry < -0.5) { vx = dirx * 3; vy = -17; } else if (diry > 0.5 && !f.grounded) { vx = 0; vy = 15; } else if (Math.abs(dirx) > 0.3) vx = Math.sign(dirx) * 15;
    if (vx) f.facing = Math.sign(vx) || f.facing;
    const d = h.def;
    spawnProj(W, f, { type: 'item', w: 30, h: 26, grav: 0.3, bkb: 35, kbg: 70, ang: 40, life: 120 },
      { x: f.x - 15, y: f.y - f.h * 0.7, vx, vy, dmg: (d.throwDmg || 9) * f.hero.power, item: d.explode || d.summon ? null : it, explode: d.explode || null, summon: d.summon || null }).itemKind = h.kind;
    Audio.play('swing');
  }
  function useHeld(W, f, inp) {
    const h = f.held, d = h.def;
    if (d.type === 'shooter') {
      if (h.ammo <= 0) { dropHeld(W, f, true, inp.x, inp.y); return true; }
      if (Math.abs(inp.x) > 0.3) f.facing = Math.sign(inp.x);
      startMove(W, f, { frames: 22, anim: 'shoot', item: true, onFrame(W, f, m) {
        if (m.t === 6) { h.ammo--; spawnProj(W, f, d.proj, { x: f.x + f.facing * f.w * 0.6, y: f.y - f.h * 0.62, vx: d.proj.vx * f.facing, vy: d.proj.vy, dmg: d.proj.dmg }); Audio.play(h.kind === 'shofar' ? 'shofar' : 'sling'); }
      } });
      return true;
    }
    if (d.type === 'throw') {
      startMove(W, f, { frames: 16, anim: 'throw', item: true, onFrame(W, f, m) { if (m.t === 5) dropHeld(W, f, true, inp.x, inp.y); } });
      return true;
    }
    return false;
  }

  /* ---------- Hit resolution ---------- */
  function knockback(victim, dmg, bkb, kbg) {
    const p = victim.damage, wgt = victim.hero.weight;
    return (((p / 10 + p * dmg / 20) * 200 / (wgt + 100) * 1.4) + 18) * kbg / 100 + bkb;
  }

  function applyHit(W, att, victim, hb, mult = 1) {
    const dmg = hb.dmg * mult * (att && att.buffs && att.buffs.power ? 1.3 : 1);
    let dir = hb.dir;
    if (hb.away) dir = Math.sign(victim.x - (hb.x0 ?? (att ? att.x : victim.x))) || 1;
    // counters
    const vm = victim.move;
    if (vm && vm.def.counter && vm.t >= vm.def.counter.window[0] && vm.t <= vm.def.counter.window[1] && !vm.data.countered && !hb.final) {
      vm.data.countered = true; vm.t = vm.def.counter.window[1];
      const src = att || victim;
      victim.facing = Math.sign(src.x - victim.x) || victim.facing;
      W.flash = 4; Audio.play('heavy'); text(W, victim.x, victim.y - victim.h - 20, victim.hero.id === 'moshe' ? 'וְגָבַר!' : 'COUNTER!', '#ffe680', 24);
      W.hitboxes.push({ owner: victim, rect: { x: victim.facing > 0 ? victim.x : victim.x - victim.u * 2.4, y: victim.y - victim.h, w: victim.u * 2.4, h: victim.h }, dmg: Math.max(8, dmg * vm.def.counter.mult), bkb: 50, kbg: 90, ang: 40, dir: victim.facing, hitSet: new Set([victim]), x0: victim.x });
      if (hb.proj && !hb.proj.pierce) hb.proj.dead = true;
      return false;
    }
    if (victim.isBoss) { victim.hp -= dmg; }
    victim.damage = Math.min(999, victim.damage + dmg);
    if (att) { att.stats.dealt += dmg; } victim.stats.taken += dmg;
    victim.lastHitBy = att; victim.lastHitT = W.t;
    let kb = knockback(victim, dmg, hb.bkb, hb.kbg);
    if (victim.isBoss) kb *= 0.55;
    const ang = (hb.ang || 0) * Math.PI / 180;
    // let go of grabs
    if (victim.grabbing) releaseGrab(victim); if (victim.grabbedBy) releaseGrab(victim.grabbedBy);
    const lag = Math.min(14, Math.floor(dmg * 0.45 + 3));
    if (att && !hb.proj && !hb.src) att.hitlag = lag;
    victim.hitlag = lag; victim.damageShake = lag;
    if (victim.armor > 0 && kb < 140) { Audio.play('hit', 0.7); sparks(W, victim.x, victim.cy, 6, '#fff'); return true; }
    if (victim.isBoss && kb < 70) { Audio.play('hit', 0.7); sparks(W, victim.x, victim.cy, 6, '#fff'); return true; }
    victim.move = null; victim.reflect = null; victim.state = 'hit'; victim.helpless = false; victim.stun = null; victim.ledge && leaveLedge(victim);
    const sp = kb * KB_SCALE;
    victim.lvx = Math.cos(ang) * sp * dir; victim.lvy = -Math.sin(ang) * sp;
    victim.vx = 0; victim.vy = 0;
    if (victim.lvy < -2 || ang < 0) { victim.grounded = false; victim.plat = null; victim.y -= 2; }
    if (ang < 0 && victim.grounded) { victim.lvy = Math.abs(victim.lvy) * 0.6; victim.lvy *= -1; } // spikes on ground pop up a bit
    victim.hitstun = Math.floor(kb * 0.42);
    victim.tumble = kb > 75;
    victim.facing = -dir || victim.facing;
    if (hb.sleep) { victim.stun = { type: 'sleep', t: hb.sleep + victim.damage * 0.5 }; victim.lvx *= 0.2; victim.lvy = -2; Audio.play('sleep'); }
    if (hb.stun) { victim.stun = { type: 'dizzy', t: hb.stun }; }
    if (hb.bury && victim.grounded) { victim.stun = { type: 'buried', t: 40 + victim.damage * 0.4 }; victim.lvx = 0; victim.lvy = 0; }
    if (hb.lift) { victim.stun = null; }
    if (hb.steal && victim.held && att && !att.held) { att.held = victim.held; victim.held = null; victim.normals = buildNormals(victim.hero, null); if (att.held.def.type === 'melee') att.normals = buildNormals(att.hero, att.held.def); text(W, att.x, att.y - att.h - 20, 'STOLEN!', '#9ff', 18); }
    // fx
    const big = kb > 120;
    sparks(W, victim.x, victim.cy, big ? 16 : 8, hb.fire ? '#ff8c1a' : '#fff6b0', big ? 1.6 : 1);
    if (hb.fire) for (let i = 0; i < 5; i++) fx(W, 'flame', victim.x + rnd(-15, 15), victim.cy + rnd(-20, 20), { life: 20 });
    fx(W, 'hitring', victim.x, victim.cy, { r: big ? 30 : 16, life: 10 });
    if (big) { W.shake = Math.max(W.shake, Math.min(18, kb / 14)); Audio.play('heavy'); } else Audio.play('hit', Math.min(1.4, 0.5 + dmg / 12));
    if (kb > 200 && victim.damage > 90) { W.slowmo = 12; fx(W, 'zoomline', victim.x, victim.cy, { life: 20 }); }
    return true;
  }

  function resolveHits(W) {
    for (const hb of W.hitboxes) {
      if (hb.proj && hb.proj.dead) continue;
      for (const v of W.fighters) {
        if (v.dead || v.stocks <= 0 || v.out) continue;
        if (v === hb.owner && !hb.hitsOwner) continue;
        if (W.cfg.teams && hb.owner && v.team === hb.owner.team && !W.cfg.friendlyFire) continue;
        if (hb.hitSet && hb.hitSet.has(v)) continue;
        if (v.invuln > 0 || v.inFinal || v.state === 'dead') continue;
        const hurt = v.hurtbox();
        // reflect / absorb bubble
        if (hb.proj && v.reflect && W.t <= v.reflect.until) {
          const d = Math.hypot(hb.proj.x + hb.proj.w / 2 - v.x, hb.proj.y + hb.proj.h / 2 - v.cy);
          if (d < v.reflect.r + 20) {
            const p = hb.proj;
            if (v.reflect.absorb) { p.dead = true; heal(W, v, p.dmg * 0.6); fx(W, 'ring', v.x, v.cy, { r: 20, grow: 3, color: '#9cf', life: 12 }); }
            else { p.vx = -p.vx * 1.15; p.vy = -Math.abs(p.vy) * 0.3; p.owner = v; p.dmg *= 1.25; p.hitSet = new Set(); p.life = Math.max(p.life, 60); sparks(W, p.x, p.y, 6, '#bdf'); Audio.play('shield'); }
            hb.dead = true; break;
          }
        }
        if (!overlap(hb.rect, hurt)) continue;
        if (hb.hitSet) hb.hitSet.add(v);
        // grabs
        if (hb.grab && hb.mv) {
          if (v.state === 'shield' || !v.grabbedBy) { startGrab(W, hb.owner, v); hb.mv.t = hb.mv.def.frames; }
          break;
        }
        // shield
        if (v.state === 'shield' && !hb.grabby && !hb.final) {
          const facingOk = true;
          if (facingOk) {
            const d = hb.dmg * (hb.wind ? 3 : 1.4);
            v.shieldHP -= d; v.shieldStun = Math.floor(hb.dmg * 0.7 + 3);
            v.vx = (hb.dir || Math.sign(v.x - hb.x0) || 1) * Math.min(8, 1 + hb.dmg * 0.35);
            if (hb.owner && !hb.proj && !hb.src) hb.owner.hitlag = 4;
            Audio.play('shield'); sparks(W, v.x, v.cy, 5, '#9cf');
            if (hb.proj && !hb.proj.pierce) hb.proj.dead = true;
            if (v.shieldHP <= 0) shieldBreak(W, v);
            continue;
          }
        }
        if (hb.wind && v.grounded && !v.isBoss) { /* sound waves push hard */ }
        const ok = applyHit(W, hb.owner, v, hb);
        if (ok && hb.mv && hb.stopOnHit) { hb.mv.data.stopped = true; if (hb.owner) hb.owner.vx *= 0.2; }
        if (ok && hb.onHit) hb.onHit(v);
        if (hb.proj && !hb.proj.pierce) { projDie(W, hb.proj); break; }
      }
      // hit minions (golem, snakes, eshel) and the ruach orb
      if (hb.proj && hb.proj.dead) continue;
      for (const m of W.minions) {
        if (!hb.owner || m.owner === hb.owner || (W.cfg.teams && m.owner.team === hb.owner.team) || m.life <= 0) continue;
        if (hb.src === m) continue;
        const mr = { x: m.x - m.w / 2, y: m.y - m.h, w: m.w, h: m.h };
        if (!overlap(hb.rect, mr)) continue;
        const key = 'm' + (hb.mvId || 0);
        hb.mhit = hb.mhit || new Set(); if (hb.mhit.has(m)) continue;
        if (hb.hitSet && hb.hitSet.has(m)) continue;
        hb.hitSet && hb.hitSet.add(m);
        m.hp -= hb.dmg; m.kbx = (hb.dir || Math.sign(m.x - hb.x0) || 1) * Math.min(10, hb.dmg * 0.6); sparks(W, m.x, m.y - m.h / 2, 5, '#fff'); Audio.play('hit', 0.6);
        if (hb.proj && !hb.proj.pierce) { projDie(W, hb.proj); break; }
      }
      if (hb.proj && hb.proj.dead) continue;
      for (const it of W.items) {
        if (it.kind !== 'ruach' || !hb.owner || it.taken) continue;
        const r = { x: it.x - 22, y: it.y - 44, w: 44, h: 44 };
        if (!overlap(hb.rect, r)) continue;
        if (hb.hitSet && hb.hitSet.has(it)) continue; hb.hitSet && hb.hitSet.add(it);
        it.hp--; it.vx = (hb.dir || 1) * 3; it.vy = -2; sparks(W, it.x, it.y - 20, 8, '#fff3a0'); Audio.play('orb');
        if (it.hp <= 0) { it.taken = true; hb.owner.finalReady = true; W.flash = 10; text(W, hb.owner.x, hb.owner.y - hb.owner.h - 30, 'RUACH!', '#fff3a0', 30); Audio.play('final'); }
        if (hb.proj && !hb.proj.pierce) { projDie(W, hb.proj); break; }
      }
    }
    W.lastHB = W.hitboxes;
    W.hitboxes = [];
  }

  function shieldBreak(W, v) {
    v.state = 'dizzy'; v.stun = { type: 'dizzy', t: 220 }; v.shieldHP = 30; v.vy = -12; v.grounded = false; v.plat = null;
    Audio.play('shieldbreak'); sparks(W, v.x, v.cy, 20, '#9cf', 1.5); text(W, v.x, v.y - v.h - 20, 'SHIELD BREAK!', '#9cf', 20);
  }

  /* ---------- Grabs ---------- */
  function startGrab(W, a, v) {
    a.grabbing = v; v.grabbedBy = a; a.grabT = 0; a.move = null; a.state = 'grabbing'; v.state = 'grabbed'; v.move = null; v.hitstun = 0; v.stun = null;
    v.grabTime = 70 + v.damage * 0.6; a.vx = 0; Audio.play('hit', 0.5);
  }
  function releaseGrab(a) { const v = a.grabbing; if (v) { v.grabbedBy = null; if (v.state === 'grabbed') v.state = 'fall'; } a.grabbing = null; if (a.state === 'grabbing') a.state = 'idle'; }
  function updateGrab(W, a, inp) {
    const v = a.grabbing; a.grabT++;
    v.x = a.x + a.facing * (a.w / 2 + v.w / 2 - 6); v.y = a.y; v.vx = v.vy = v.lvx = v.lvy = 0; v.facing = -a.facing;
    if (v.inp && (v.inp.attack || v.inp.special || v.inp.jump || v.inp.shield)) v.grabTime -= 6;
    v.grabTime--;
    if (inp.attack && a.grabT > 8) { v.damage += 2; v.stats.taken += 2; a.stats.dealt += 2; sparks(W, v.x, v.cy, 4, '#fff'); Audio.play('hit', 0.5); a.grabT = 2; }
    let th = null;
    if (inp.x * a.facing > 0.5) th = 'f'; else if (inp.x * a.facing < -0.5) th = 'b'; else if (inp.y < -0.5) th = 'u'; else if (inp.y > 0.5) th = 'd';
    if (inp.smash || inp.special) th = th || 'f';
    if (a.grabT > 300) th = 'f';
    if (th) {
      const P = { f: [8, 55, 70, 40, 1], b: [10, 55, 75, 40, -1], u: [8, 60, 75, 90, 1], d: [6, 70, 45, 75, 1] }[th];
      releaseGrab(a);
      if (th === 'b') a.facing *= -1;
      applyHit(W, a, v, { dmg: P[0] * a.hero.power, bkb: P[1], kbg: P[2], ang: P[3], dir: a.facing, x0: a.x });
      a.landLag = 12; a.state = 'idle'; Audio.play('heavy');
      return;
    }
    if (v.grabTime <= 0) { releaseGrab(a); v.lvx = -a.facing * 0 + (v.x > a.x ? 5 : -5); a.lvx = v.x > a.x ? -4 : 4; v.state = 'fall'; a.landLag = 16; }
  }

  /* ---------- Ledges ---------- */
  function tryLedge(W, f) {
    if (f.ledgeCD > 0 || f.grounded || f.vy < -1 || f.hitstun > 0 || f.grabbedBy || f.inFinal || f.isBoss) return;
    for (const L of W.ledges) {
      if (L.owner && L.owner !== f) continue;
      const handX = f.x + (L.side < 0 ? 1 : -1) * 0;
      const dx = L.side < 0 ? L.x - f.x : f.x - L.x; // positive when fighter is outside the ledge
      if (dx > -10 && dx < f.w / 2 + 26 && f.y > L.y + 6 && f.y - f.h < L.y + 30 && f.y < L.y + f.h + 30) {
        f.ledge = L; L.owner = f; f.state = 'ledge'; f.stateT = 0; f.move = null; f.helpless = false; f.vx = f.vy = f.lvx = f.lvy = 0;
        f.facing = -L.side; f.x = L.x + L.side * (f.w / 2 - 2); f.y = L.y + f.h * 0.78; f.jumps = f.hero.jumps; f.airdodged = false; f.fastfall = false;
        f.invuln = Math.max(f.invuln, 45); return;
      }
    }
  }
  function leaveLedge(f) { if (f.ledge) f.ledge.owner = null; f.ledge = null; f.ledgeCD = 30; }

  /* ---------- Fighter update ---------- */
  function updateFighter(W, f) {
    if (f.dead) {
      if (f.stocks > 0) {
        f.respawnT--;
        if (f.respawnT <= 0) {
          f.reset(0, -380); f.dead = false; f.onHalo = true; f.state = 'idle'; f.grounded = true; f.invuln = 150; f.haloT = 240;
          if (f.hero.golem && !golemOf(W, f)) { const g = spawnGolem(W, f); g.x = 40; g.y = -380; }
        }
      }
      return;
    }
    const inp = f.inp || Input.read('none');
    if (f.hitlag > 0) { f.hitlag--; if (f.damageShake > 0) f.damageShake--; return; }
    f.stateT++;
    if (f.invuln > 0) f.invuln--;
    if (f.ledgeCD > 0) f.ledgeCD--;
    if (f.dropT > 0) f.dropT--;
    if (f.armor > 0) f.armor--;
    for (const k in f.buffs) if (--f.buffs[k] <= 0) delete f.buffs[k];
    if (f.reflect && W.t > f.reflect.until) f.reflect = null;
    if (f.state !== 'shield') f.shieldHP = Math.min(100, f.shieldHP + 0.12);
    if (f.landLag > 0) f.landLag--;
    if (f.shieldStun > 0) f.shieldStun--;
    if (f.held && f.held.def.type === 'melee') { f.held.life--; if (f.held.life <= 0) { f.held = null; f.normals = buildNormals(f.hero, null); } }
    touchFood(W, f);

    // halo (respawn platform)
    if (f.onHalo) {
      f.haloT--; f.vx = f.vy = 0; f.grounded = true;
      if (f.haloT <= 0 || Math.abs(inp.x) > 0.3 || inp.jump || inp.attack || inp.special || inp.y > 0.5) { f.onHalo = false; f.grounded = false; f.state = 'fall'; f.invuln = Math.max(f.invuln, 60); }
      if (inp.jump) { f.vy = -f.hero.jump * 0.8; }
      return;
    }

    // final strike in progress: frozen & invulnerable
    if (f.inFinal) return;

    // stun states
    if (f.stun) {
      f.stun.t -= 1 + (inp.attack || inp.special || inp.jump || inp.shield ? 3 : 0) * (f.stun.type !== 'dizzy' ? 1 : 0.3);
      if (f.stun.t <= 0) { f.stun = null; if (f.state === 'dizzy') f.state = 'idle'; }
      if (f.stun && f.stun.type === 'buried') { f.vx = 0; f.vy = 0; return; }
      physics(W, f, { x: 0, y: 0 });
      return;
    }

    if (f.grabbedBy) return;
    if (f.grabbing) { updateGrab(W, f, inp); return; }

    // hitstun
    if (f.hitstun > 0) {
      f.hitstun--;
      if (f.stateT % 2 === 0 && Math.hypot(f.lvx, f.lvy) > 6) fx(W, 'smoke', f.x, f.cy, { life: 22 });
      physics(W, f, { x: inp.x * 0.15, y: 0 }, true);
      if (f.hitstun <= 0) f.state = f.grounded ? 'idle' : 'fall';
      return;
    }

    if (f.state === 'ledge') return ledgeState(W, f, inp);
    if (f.state === 'down') { f.vx *= 0.8; physics(W, f, { x: 0, y: 0 }); if (f.stateT > 26 || ((inp.attack || inp.jump || Math.abs(inp.x) > 0.5) && f.stateT > 8)) { f.state = 'idle'; f.invuln = Math.max(f.invuln, 14); if (inp.attack) startMove(W, f, f.normals.getup); } return; }

    // dodges
    if (f.state === 'roll' || f.state === 'spotdodge' || f.state === 'airdodge') {
      const dur = f.state === 'roll' ? 26 : f.state === 'spotdodge' ? 22 : 32;
      if (f.state === 'roll') { const p = f.stateT / dur; f.vx = f.rollDir * (p < 0.75 ? 7.2 * (1 - p) + 1 : 0.5); }
      if (f.state === 'airdodge') { f.vx *= 0.9; f.vy *= 0.9; if (f.stateT > 14) f.vy += 0.3; }
      physics(W, f, { x: 0, y: 0 }, false, f.state === 'airdodge');
      if (f.stateT >= dur) { f.state = f.grounded ? 'idle' : 'fall'; if (f.state === 'fall' && f.airdodgeDir) f.helpless = false; }
      if (f.state === 'airdodge' && f.grounded) { f.state = 'idle'; f.landLag = 8; }
      return;
    }

    // current move
    if (f.move) {
      const m = f.move, d = m.def;
      // charging smash / chargeable specials
      let charging = false;
      if (d.charge && m.t === d.charge && (inp.smashHeld || inp.attackHeld) && m.charge < 60) { charging = true; m.charge++; if (m.charge % 6 === 0) sparks(W, f.x + rnd(-20, 20), f.y - f.h * rnd(0.3, 1), 1, '#fff6a0', 0.5); }
      if (d.chargeAt != null && m.t === d.chargeAt && inp.specialHeld && m.charge < d.chargeMax) { charging = true; m.charge++; if (m.charge % 5 === 0) sparks(W, f.x + f.facing * 20, f.y - f.h * 0.6, 1, '#fff6a0', 0.5); }
      if (!charging) m.t++;
      if (d.onFrame) d.onFrame(W, f, m);
      if (!f.move) return; // onFrame can end the move
      if (d.hits) for (const h of d.hits) {
        if (m.t >= h.s && m.t <= h.e) {
          if (h.rehit && (m.t - h.s) % h.rehit === 0) m.hitSet = new Set();
          const cm = d.smash ? 1 + m.charge / 60 * 0.45 : 1;
          W.hitboxes.push({ owner: f, mv: m, rect: hbRect(f, h), dmg: (h.dmg || 0) * cm, bkb: h.bkb, kbg: h.kbg, ang: h.ang, dir: f.facing, away: h.away, x0: f.x, hitSet: m.hitSet,
            grab: h.grab, grabby: h.grabby, steal: h.steal, lift: h.lift, stun: h.stun, sleep: h.sleep, bury: h.bury, fire: h.fire, stopOnHit: h.stopOnHit });
        }
      }
      // movement during a move
      if (d.special && (d.kind === 'rise' || d.kind === 'golem' || d.kind === 'dash')) physics(W, f, { x: 0, y: 0 }, false, true);
      else physics(W, f, { x: f.grounded ? 0 : inp.x * 0.6, y: inp.y }, false, false, true);
      if (d.air && f.grounded) { f.landLag = d.land || 6; f.move = null; return; }
      if (m.t >= d.frames) {
        f.move = null;
        if (d.helpless && !f.grounded) { f.helpless = true; f.state = 'fall'; }
        if (d.grab) f.landLag = 8;
      }
      return;
    }

    // ---- free state ----
    if (f.landLag > 0 || f.shieldStun > 0) { physics(W, f, { x: 0, y: 0 }); return; }

    // final strike
    if (inp.special && f.finalReady && !f.helpless) { startFinal(W, f); return; }

    if (f.grounded) groundState(W, f, inp); else airState(W, f, inp);
  }

  function groundState(W, f, inp) {
    const h = f.hero;
    // jump squat
    if (f.jumpSquat > 0) {
      f.jumpSquat--;
      // up attacks out of jump squat (lets keyboard "W" users do up-tilt/up-smash/up-special)
      if (inp.special) { f.jumpSquat = 0; return doSpecial(W, f, { x: inp.x, y: -1 }); }
      if (inp.smash) { f.jumpSquat = 0; return startMove(W, f, f.normals.usmash); }
      if (inp.attack) { f.jumpSquat = 0; if (f.held && useHeld(W, f, inp)) return; return startMove(W, f, f.normals.utilt); }
      if (!inp.jumpHeld) f.shortHop = true;
      if (f.jumpSquat === 0) {
        f.vy = -(f.shortHop ? h.jump * 0.68 : h.jump); f.grounded = false; f.plat = null; f.state = 'jump'; Audio.play('jump');
        fx(W, 'dust', f.x, f.y, { life: 14 });
      }
      physics(W, f, { x: 0, y: 0 }); return;
    }
    if (inp.jump) { f.jumpSquat = 3; f.shortHop = false; return; }

    // shield / dodge / grab
    if (inp.shieldHeld) {
      if (inp.attack || inp.grab) { if (f.held) { dropHeld(W, f, true, inp.x, inp.y); return; } f.state = 'idle'; return startMove(W, f, f.normals.grab); }
      if (Math.abs(inp.x) > 0.6 && f.state === 'shield' && f.stateT > 1 && f.prevX !== Math.sign(inp.x)) { f.state = 'roll'; f.stateT = 0; f.rollDir = Math.sign(inp.x); f.invuln = 18; f.facing = -f.rollDir; return; }
      if (inp.y > 0.6 && f.state === 'shield' && f.prevY < 0.6) { f.state = 'spotdodge'; f.stateT = 0; f.invuln = 16; return; }
      if (f.state !== 'shield') { f.state = 'shield'; f.stateT = 0; }
      f.prevX = Math.abs(inp.x) > 0.6 ? Math.sign(inp.x) : 0; f.prevY = inp.y;
      f.shieldHP -= 0.16; if (f.shieldHP <= 0) return shieldBreak(W, f);
      if (inp.jump) { f.state = 'idle'; f.jumpSquat = 3; }
      physics(W, f, { x: 0, y: 0 }); return;
    }
    if (inp.grab) { if (f.held) { dropHeld(W, f, true, inp.x, inp.y); return; } return startMove(W, f, f.normals.grab); }
    if (f.state === 'shield') f.state = 'idle';

    // specials
    if (inp.special) return doSpecial(W, f, inp);
    // smash attacks
    if (inp.smash) {
      if (f.held && f.held.def.type !== 'melee') { dropHeld(W, f, true, inp.x || inp.cx, inp.y || inp.cy); return; }
      const sx = inp.cx || inp.x, sy = inp.cy || inp.y;
      if (Math.abs(sx) > 0.3 && Math.abs(sx) >= Math.abs(sy)) f.facing = Math.sign(sx);
      return startMove(W, f, sy < -0.5 ? f.normals.usmash : sy > 0.5 ? f.normals.dsmash : f.normals.fsmash);
    }
    if (inp.attack) {
      if (!f.held && tryPickup(W, f)) return;
      if (f.held && useHeld(W, f, inp)) return;
      const running = Math.abs(f.vx) > h.run * 0.75;
      if (running) return startMove(W, f, f.normals.dash);
      if (inp.y < -0.5) return startMove(W, f, f.normals.utilt);
      if (inp.y > 0.5) return startMove(W, f, f.normals.dtilt);
      if (Math.abs(inp.x) > 0.3) { f.facing = Math.sign(inp.x); return startMove(W, f, f.normals.ftilt); }
      f.jabCombo = (W.t - (f.lastJab || 0) < 26) ? f.jabCombo + 1 : 0; f.lastJab = W.t;
      return startMove(W, f, f.jabCombo % 3 === 2 ? f.normals.jab2 : f.normals.jab);
    }
    // drop through platform
    if (inp.y > 0.7 && f.plat && !f.plat.g && W.stage.plats.includes(f.plat) && f.stateT > 4) { f.dropT = 12; f.grounded = false; f.plat = null; f.state = 'fall'; f.y += 2; return; }
    // walking/running/crouch
    if (inp.y > 0.6 && Math.abs(inp.x) < 0.4) { if (f.state !== 'crouch') { f.state = 'crouch'; f.stateT = 0; } }
    else if (Math.abs(inp.x) > 0.15) {
      if (Math.sign(inp.x) !== f.facing && f.state !== 'run') f.facing = Math.sign(inp.x);
      const run = Math.abs(inp.x) > 0.7;
      if (Math.sign(inp.x) !== f.facing && f.state === 'run') { f.facing = Math.sign(inp.x); f.vx *= 0.3; }
      const st = run ? 'run' : 'walk'; if (f.state !== st) { f.state = st; f.stateT = 0; }
    } else if (f.state !== 'idle') { f.state = 'idle'; f.stateT = 0; }
    physics(W, f, inp);
  }

  function airState(W, f, inp) {
    const h = f.hero;
    if (f.helpless) { physics(W, f, { x: inp.x * 0.7, y: 0 }); tryLedge(W, f); return; }
    if (inp.jump && f.jumps > 0) {
      f.jumps--; f.vy = -h.jump * 0.92; f.fastfall = false; Audio.play('djump'); fx(W, 'ring', f.x, f.y, { r: 6, grow: 2, color: '#fff', life: 12 });
      if (Math.abs(inp.x) > 0.3) { f.vx = Math.sign(inp.x) * h.air; } f.state = 'jump'; f.stateT = 0;
      return;
    }
    if (inp.shield && !f.airdodged) {
      f.state = 'airdodge'; f.stateT = 0; f.invuln = 26; f.airdodged = true;
      const mag = Math.hypot(inp.x, inp.y);
      if (mag > 0.4) { f.vx = inp.x / mag * 9; f.vy = inp.y / mag * 9; f.airdodgeDir = true; } else { f.vy = Math.min(f.vy, 1); f.airdodgeDir = false; }
      return;
    }
    if (inp.special) return doSpecial(W, f, inp);
    if (inp.attack || inp.smash || inp.grab) {
      if ((inp.grab || inp.smash) && f.held) { dropHeld(W, f, true, inp.x || inp.cx, inp.y || inp.cy); return; }
      if (inp.attack && !f.held && tryPickup(W, f)) return;
      if (inp.attack && f.held && useHeld(W, f, inp)) return;
      const sx = inp.cx || inp.x, sy = inp.cy || inp.y;
      let mv = f.normals.nair;
      if (sy < -0.5 && Math.abs(sy) >= Math.abs(sx)) mv = f.normals.uair;
      else if (sy > 0.5 && Math.abs(sy) >= Math.abs(sx)) mv = f.normals.dair;
      else if (Math.abs(sx) > 0.3) mv = Math.sign(sx) === f.facing ? f.normals.fair : f.normals.bair;
      return startMove(W, f, mv);
    }
    if (inp.y > 0.7 && f.vy > 0 && !f.fastfall) { f.fastfall = true; fx(W, 'spark', f.x, f.y - f.h, { vx: 0, vy: -1, color: '#fff', life: 8 }); }
    f.state = f.vy < 0 ? 'jump' : 'fall';
    physics(W, f, inp);
    tryLedge(W, f);
  }

  function doSpecial(W, f, inp) {
    let key = 'neutral';
    if (inp.y < -0.5 && Math.abs(inp.y) >= Math.abs(inp.x) * 0.8) key = 'up';
    else if (inp.y > 0.5 && Math.abs(inp.y) >= Math.abs(inp.x)) key = 'down';
    else if (Math.abs(inp.x) > 0.3) { key = 'side'; f.facing = Math.sign(inp.x); }
    if (f.isBoss) return bossSpecial(W, f, key);
    const def = specialDef(W, f, key);
    if (!def) return;
    if (key === 'side' && !f.grounded) { if (f.usedSideAir) { def.frames = def.frames; } f.usedSideAir = true; }
    startMove(W, f, def);
  }

  function ledgeState(W, f, inp) {
    const L = f.ledge;
    f.vx = f.vy = 0;
    if (f.stateT > 320 || (inp.y > 0.6) || (inp.x * L.side > 0.6)) { leaveLedge(f); f.state = 'fall'; f.x += L.side * 6; f.y += 6; f.invuln = 0; return; }
    if (f.stateT < 8) return;
    const climb = (st) => { leaveLedge(f); f.x = L.x - L.side * (f.w / 2 + 8); f.y = L.y; f.grounded = true; f.plat = L.g; f.state = 'idle'; f.facing = -L.side; f.invuln = Math.max(f.invuln, 16); if (st) startMove(W, f, f.normals.ledge); };
    if (inp.jump) { leaveLedge(f); f.vy = -f.hero.jump * 1.02; f.vx = -L.side * 1.5; f.state = 'jump'; f.y -= 6; Audio.play('jump'); return; }
    if (inp.attack || inp.smash) return climb(true);
    if (inp.y < -0.6 || inp.x * L.side < -0.6) return climb(false);
    if (inp.shield) { climb(false); f.state = 'roll'; f.stateT = 0; f.rollDir = -L.side; f.invuln = 20; }
  }

  /* ---------- Physics ---------- */
  function physics(W, f, inp, inHit = false, noControl = false, inMove = false) {
    const h = f.hero, sm = f.speedMul();
    const timeScale = f.slow ? 0.45 : 1;
    if (f.grounded) {
      if (!noControl && !inMove && (f.state === 'walk' || f.state === 'run')) {
        const target = inp.x * (f.state === 'run' ? h.run : h.walk) * sm;
        f.vx += (target - f.vx) * 0.28;
      } else f.vx *= inHit ? 0.88 : 0.78;
      if (f.stateT % 9 === 0 && f.state === 'run') fx(W, 'dust', f.x - f.facing * 10, f.y, { life: 12 });
    } else if (!noControl) {
      const target = inp.x * h.air * sm;
      if (Math.abs(inp.x) > 0.1) f.vx += (target - f.vx) * 0.09; else f.vx *= 0.985;
    }
    if (!f.grounded) {
      const g = h.grav * (inHit ? 0.75 : 1);
      f.vy += g;
      const mf = (f.fastfall && !inHit ? FAST_FALL : MAX_FALL) * (h.grav / 0.55);
      if (f.vy > mf) f.vy = mf;
    }
    // launch decay
    const lm = Math.hypot(f.lvx, f.lvy);
    if (lm > 0) { const nm = Math.max(0, lm - KB_DECAY); f.lvx *= nm / lm; f.lvy *= nm / lm; }
    const dx = (f.vx + f.lvx) * timeScale, dy = (f.vy + f.lvy) * timeScale;
    const py = f.y;
    f.x += dx; f.y += dy;
    collide(W, f, py, inHit);
  }

  function collide(W, f, py, inHit) {
    const wasGrounded = f.grounded;
    f.grounded = false;
    const hw = f.w / 2;
    for (const g of W.stage.ground) {
      if (f.x + hw * 0.6 > g.x && f.x - hw * 0.6 < g.x + g.w) {
        // landing
        if (py <= g.y + 2 && f.y >= g.y && (f.vy + f.lvy) >= 0) { land(W, f, g, inHit); continue; }
        // walking along
        if (wasGrounded && f.plat === g && Math.abs(f.y - g.y) < 4) { f.y = g.y; f.grounded = true; continue; }
        // bump head
        if (f.y - f.h < g.y + g.h && py - f.h >= g.y + g.h - 1 && f.y > g.y + g.h) { f.y = g.y + g.h + f.h; f.vy = Math.max(0, f.vy); f.lvy = Math.abs(f.lvy) * 0.5; continue; }
      }
      // side walls
      if (f.y > g.y + 2 && f.y - f.h < g.y + g.h && f.x + hw > g.x && f.x - hw < g.x + g.w) {
        if (f.x < g.x + g.w / 2) { f.x = g.x - hw; } else { f.x = g.x + g.w + hw; }
        if (Math.abs(f.lvx) > 8) { f.lvx = -f.lvx * 0.6; sparks(W, f.x, f.cy, 6, '#ccc'); } else { f.vx = 0; f.lvx = 0; }
      }
    }
    if (!f.grounded) for (const p of activePlats(W)) {
      if (f.x > p.x - 4 && f.x < p.x + p.w + 4) {
        if (wasGrounded && f.plat === p && Math.abs(f.y - p.y) < 4) { f.y = p.y; f.grounded = true; break; }
        if (py <= p.y + 2 && f.y >= p.y && (f.vy + f.lvy) >= 0 && f.dropT <= 0 && !(f.inp && f.inp.y > 0.85 && f.fastfall)) { land(W, f, p, inHit); break; }
      }
    }
    if (!f.grounded && wasGrounded) { f.plat = null; if (f.state === 'walk' || f.state === 'run' || f.state === 'idle' || f.state === 'crouch') f.state = 'fall'; if (f.state === 'shield') f.state = 'fall'; }
  }

  function land(W, f, g, inHit) {
    const impact = f.vy + f.lvy;
    f.y = g.y; f.grounded = true; f.plat = g;
    if (inHit && f.hitstun > 0) {
      if (f.tumble && impact > 6) { // bounce or knockdown
        if (impact > 14) { f.lvy = -Math.abs(f.lvy) * 0.5; f.vy = -impact * 0.35; f.grounded = false; f.y -= 1; sparks(W, f.x, f.y, 6, '#ccc'); Audio.play('land'); return; }
        f.hitstun = 0; f.state = 'down'; f.stateT = 0; f.lvx *= 0.3; f.lvy = 0; f.vy = 0; Audio.play('land'); return;
      }
      f.lvy = 0; f.vy = 0; return;
    }
    if (f.lvy > 0) f.lvy = 0;
    if (f.vy > 2) { fx(W, 'dust', f.x, f.y, { life: 10 }); if (f.vy > 7) Audio.play('land'); }
    f.vy = 0; f.jumps = f.hero.jumps; f.fastfall = false; f.airdodged = false; f.usedSideAir = false;
    if (f.helpless) { f.helpless = false; f.landLag = 10; }
    if (f.state === 'fall' || f.state === 'jump' || f.state === 'hit') { f.state = 'idle'; f.stateT = 0; }
  }

  /* ---------- Finals ---------- */
  function startFinal(W, f) {
    f.finalReady = false; f.inFinal = true; f.invuln = 9999; f.move = null; f.vx = f.vy = f.lvx = f.lvy = 0;
    const fin = f.hero.final;
    const F = { kind: fin.kind, owner: f, t: 0, dur: 150, fin, hitSet: new Set(), dir: f.facing, data: {} };
    if (fin.kind === 'rain') F.dur = 190;
    if (fin.kind === 'quake') F.dur = 130;
    if (fin.kind === 'flood') F.dur = 140;
    if (fin.kind === 'giant') F.dur = 170;
    if (fin.kind === 'beam') F.dur = 110;
    W.finals.push(F); W.flash = 18; W.finalBanner = { name: fin.name, he: fin.he, hero: f.hero, t: 0 };
    Audio.play('final');
  }
  function updateFinal(W, F) {
    F.t++;
    const f = F.owner, fin = F.fin, st = W.stage;
    const enemies = W.fighters.filter(o => o !== f && !o.dead && o.stocks > 0 && !(W.cfg.teams && o.team === f.team));
    const hitAll = (cond, P, dirFn) => {
      for (const o of enemies) if (!F.hitSet.has(o) && cond(o)) {
        F.hitSet.add(o); o.invuln = 0;
        applyHit(W, f, o, { dmg: P.dmg, bkb: P.bkb, kbg: P.kbg, ang: P.ang, dir: dirFn ? dirFn(o) : F.dir, x0: f.x, final: true });
      }
    };
    const L = st.blast.l * 0.55, R = st.blast.r * 0.55;
    if (F.t < 30) return; // banner pause
    const t = F.t - 30, span = F.dur - 30;
    switch (fin.kind) {
      case 'sweep': {
        const x = F.dir > 0 ? L + (R - L) * t / span : R - (R - L) * t / span;
        F.data.x = x;
        if (t % 5 === 0) { Audio.play(fin.sprite === 'shofars' ? 'shofar' : 'hit', 0.5); fx(W, 'dust', x, 0, { life: 16 }); }
        hitAll(o => Math.abs(o.x - x) < 80, { dmg: fin.dmg, bkb: 80, kbg: 95, ang: 45 });
        break;
      }
      case 'flood': {
        const p = t / span; F.data.p = p;
        if (t % 6 === 0) Audio.play('water');
        const lx = L + (0 - L) * Math.min(1, p * 1.6), rx = R - R * Math.min(1, p * 1.6);
        hitAll(o => o.x < lx + 40 || o.x > rx - 40, { dmg: fin.dmg, bkb: 85, kbg: 95, ang: 80 }, o => o.x < 0 ? 1 : -1);
        break;
      }
      case 'rain': {
        const n = fin.count;
        if (t % Math.max(2, Math.floor(span / n)) === 0) {
          let x;
          if (Math.random() < 0.5 && enemies.length) { const e = enemies[Math.floor(Math.random() * enemies.length)]; x = e.x + rnd(-60, 60); }
          else x = rnd(-560, 560);
          const typ = fin.sprite === 'hail' ? 'hail' : fin.sprite === 'fire' ? 'firebolt' : 'star';
          const sz = typ === 'hail' ? 46 : typ === 'star' ? 34 : 30;
          const pr = spawnProj(W, f, { type: typ, w: sz, h: typ === 'firebolt' ? 56 : sz, grav: 0.3, bkb: 45, kbg: 60, ang: 70, life: 140, pierce: false },
            { x: x - sz / 2, y: -900, vx: typ === 'star' ? rnd(-3, 3) : 0, vy: 12, dmg: fin.dmg });
          pr.final = true; pr.hitSet = new Set(); pr.finalOwner = f;
          if (typ === 'star' && t % 8 === 0) Audio.play('star');
        }
        if (t === span - 2) for (const o of enemies) if (o.damage > 0) { /* last stone heavier */ }
        break;
      }
      case 'quake': {
        W.shake = Math.max(W.shake, 10);
        if (t % 16 === 0) { Audio.play('golem'); for (const o of enemies) if (o.grounded) { o.invuln = 0; applyHit(W, f, o, { dmg: 3, bkb: 30, kbg: 0, ang: 90, dir: 1, final: true }); } }
        if (t === span - 1) hitAll(o => true, { dmg: fin.dmg * 0.5, bkb: 90, kbg: 100, ang: 85 }, o => Math.sign(o.x) || 1);
        break;
      }
      case 'pillars': {
        const p = Math.min(1, t / (span * 0.55)); F.data.p = p;
        if (p >= 1 && !F.data.crashed) {
          F.data.crashed = true; W.shake = 22; Audio.play('heavy'); Audio.play('golem');
          hitAll(o => true, { dmg: fin.dmg, bkb: 85, kbg: 100, ang: 60 }, o => Math.sign(o.x) || 1);
          for (let i = 0; i < 40; i++) fx(W, 'spark', rnd(-500, 500), rnd(-300, 0), { vx: rnd(-4, 4), vy: rnd(-6, 2), color: '#c9b38a', life: 40 });
        }
        break;
      }
      case 'giant': {
        const x = F.dir > 0 ? L + (R - L) * t / span : R - (R - L) * t / span;
        F.data.x = x; if (t % 20 === 0) { W.shake = Math.max(W.shake, 8); Audio.play('golem'); }
        hitAll(o => Math.abs(o.x - x) < 150 && o.y > -360, { dmg: fin.dmg, bkb: 85, kbg: 95, ang: 50 });
        break;
      }
      case 'beam': {
        F.data.p = t / span;
        if (t === 10) { W.shake = 16; Audio.play('heavy'); }
        if (t >= 10 && t < 40) hitAll(o => (o.x - f.x) * F.dir > -30 && Math.abs(o.cy - f.cy) < 160, { dmg: fin.dmg, bkb: 90, kbg: 95, ang: 35 });
        break;
      }
    }
  }
  function endFinal(W, F) { const f = F.owner; f.inFinal = false; f.invuln = 60; f.state = f.grounded ? 'idle' : 'fall'; }

  /* ---------- Fields ---------- */
  function updateFields(W) {
    for (const f of W.fighters) f.slow = false;
    for (const z of W.fields) {
      z.life--;
      for (const o of W.fighters) {
        if (o === z.owner || o.dead || (W.cfg.teams && o.team === z.owner.team) || o.inFinal) continue;
        if (z.type === 'sun') { if (Math.hypot(o.x - z.x, o.cy - z.y) < z.r) o.slow = true; }
        if (z.type === 'snow') {
          if (o.grounded && Math.abs(o.x - z.x) < z.r && Math.abs(o.y - z.y) < 20 && !o.stun && o.invuln <= 0) {
            const last = z.frozeAt.get(o) || -999;
            if (W.t - last > 150) { z.frozeAt.set(o, W.t); o.stun = { type: 'frozen', t: 50 + o.damage * 0.3 }; o.move = null; o.vx = 0; o.damage += 4; Audio.play('shield'); sparks(W, o.x, o.cy, 10, '#e0f7ff'); }
          }
        }
      }
    }
    W.fields = W.fields.filter(z => z.life > 0);
  }

  /* ---------- Stage hazards ---------- */
  function updateHazards(W) {
    if (!W.cfg.hazards) return;
    const hz = W.stage.hazard; if (!hz) return;
    if (W.wallsDown > 0) W.wallsDown--;
    W.hazardT--;
    if (W.hazard) {
      const H = W.hazard; H.t++;
      if (hz === 'lightning' && H.t === 70) {
        W.flash = 6; W.shake = 8; Audio.play('heavy');
        W.hitboxes.push({ owner: null, rect: { x: H.x - 40, y: -1200, w: 80, h: 1300 }, dmg: 12, bkb: 50, kbg: 70, ang: 70, away: true, x0: H.x, hitSet: new Set() });
      }
      if (hz === 'fire' && H.t >= 60 && H.t < 100) {
        if (H.t % 3 === 0) fx(W, 'flame', rnd(-80, 80), -110 - rnd(0, 40), { life: 22 });
        if (H.t === 60) { Audio.play('fire'); H.hs = new Set(); }
        W.hitboxes.push({ owner: null, rect: { x: -90, y: -260, w: 180, h: 150 }, dmg: 10, bkb: 45, kbg: 60, ang: 80, away: true, x0: 0, hitSet: H.hs, fire: true });
      }
      if (hz === 'walls' && H.t === 50) { W.wallsDown = 480; W.shake = 14; Audio.play('shofar'); for (const p of W.stage.plats) if (p.wall) for (let i = 0; i < 16; i++) fx(W, 'spark', p.x + rnd(0, p.w), p.y, { vx: rnd(-3, 3), vy: rnd(-4, 2), color: '#c9a36b', life: 40 }); }
      if (H.t > 110) W.hazard = null;
    } else if (W.hazardT <= 0) {
      W.hazardT = rnd(700, 1100);
      W.hazard = { t: 0, x: rnd(-400, 400) };
      if (hz === 'walls') Audio.play('shofar');
    }
  }

  /* ---------- KOs & match ---------- */
  function checkKO(W, f) {
    if (f.dead) return;
    const b = W.stage.blast;
    const bossDown = f.isBoss && f.hp <= 0;
    if (f.isBoss && !bossDown && (f.x < b.l + 250 || f.x > b.r - 250 || f.y > 200 || f.y - f.h < b.t + 100)) {
      // Golyat can't be thrown off the stage: he leaps back in and loses stamina instead
      f.hp -= 25; f.x = 0; f.y = -500; f.vx = f.vy = f.lvx = f.lvy = 0; f.hitstun = 0; f.state = 'fall'; f.invuln = 60;
      text(W, 0, -560, '-25 HP', '#ff8080', 28); W.shake = 14; Audio.play('golem');
      return;
    }
    if (f.x < b.l || f.x > b.r || f.y > b.b || f.y - f.h < b.t || bossDown) {
      if (f.y - f.h < b.t && f.hitstun <= 0 && !bossDown) return; // only star-KO when launched
      ko(W, f, bossDown);
    }
  }
  function ko(W, f, bossDown) {
    f.dead = true; f.stocks--; f.respawnT = 80; f.state = 'dead';
    if (f.ledge) leaveLedge(f);
    if (f.grabbing) releaseGrab(f); if (f.grabbedBy) releaseGrab(f.grabbedBy);
    if (f.held) { f.held = null; f.normals = buildNormals(f.hero, null); }
    const b = W.stage.blast;
    const kx = clamp(f.x, b.l + 40, b.r - 40), ky = clamp(f.y - f.h / 2, b.t + 40, b.b - 40);
    fx(W, 'ko', kx, ky, { color: f.color, life: 50, ang: Math.atan2(f.y - W.cam.y, f.x - W.cam.x) });
    W.shake = 18; Audio.play('ko');
    const killer = (f.lastHitBy && W.t - f.lastHitT < 480) ? f.lastHitBy : null;
    f.stats.falls++; f.score--;
    if (killer && killer !== f) { killer.stats.kos++; killer.score++; } else f.stats.sds++;
    if (W.cfg.mode === 'training') { f.stocks = 99; }
    if (bossDown) { f.stocks = 0; }
    W.events.push({ type: 'ko', f, killer });
    // remove this fighter's golem if out of stocks
    if (f.stocks <= 0) W.minions.forEach(m => { if (m.owner === f) m.life = 0; });
  }

  function checkEnd(W) {
    if (W.over) return;
    if (W.cfg.mode === 'training') return;
    if (W.cfg.time && W.timeLeft <= 0) {
      W.over = true; W.endT = 0;
      const best = [...W.fighters].sort((a, b) => b.score - a.score || a.damage - b.damage)[0];
      W.winner = W.cfg.teams ? { team: best.team } : best;
      return;
    }
    const alive = W.fighters.filter(f => f.stocks > 0);
    const teamsAlive = new Set(alive.map(f => f.team));
    if (teamsAlive.size <= 1) {
      W.over = true; W.endT = 0;
      W.winner = alive[0] || null;
      if (W.cfg.teams && alive[0]) W.winner = { team: alive[0].team, f: alive[0] };
    }
  }

  /* ---------- Camera ---------- */
  function updateCamera(W, vw, vh) {
    const live = W.fighters.filter(f => !f.dead || f.respawnT > 40);
    let minx = -350, maxx = 350, miny = -360, maxy = 60;
    if (live.length) {
      minx = Math.min(...live.map(f => f.x)) - 220; maxx = Math.max(...live.map(f => f.x)) + 220;
      miny = Math.min(...live.map(f => f.y - f.h)) - 180; maxy = Math.max(...live.map(f => f.y)) + 140;
    }
    for (const F of W.finals) { minx = Math.min(minx, -620); maxx = Math.max(maxx, 620); miny = Math.min(miny, -520); }
    const b = W.stage.blast;
    minx = Math.max(minx, b.l + 100); maxx = Math.min(maxx, b.r - 100); miny = Math.max(miny, b.t + 100); maxy = Math.min(maxy, b.b - 60);
    const bw = Math.max(700, maxx - minx), bh = Math.max(420, maxy - miny);
    let z = Math.min(vw / bw, vh / bh);
    z = clamp(z, Math.min(vw, vh) / 1500, Math.min(vw, vh) / 520);
    const tx = (minx + maxx) / 2, ty = (miny + maxy) / 2;
    const c = W.cam;
    c.x += (tx - c.x) * 0.08; c.y += (ty - c.y) * 0.08; c.z += (z - c.z) * 0.06;
  }

  /* ---------- Boss (Golyat) ---------- */
  function bossSpecial(W, f, key) {
    const P = f.hero.power;
    if (key === 'neutral' || key === 'down') return startMove(W, f, { special: true, frames: 60, anim: 'overhead', hits: [{ s: 26, e: 32, x: 0.0, y: -2.6, w: 3.4, h: 2.6, dmg: 22 * P, bkb: 45, kbg: 95, ang: 40 }],
      onFrame(W, f, m) { if (m.t === 26) { W.shake = 12; Audio.play('heavy'); } } });
    if (key === 'side') return startMove(W, f, { special: true, frames: 50, anim: 'shoot', onFrame(W, f, m) {
      if (m.t === 20) { spawnProj(W, f, { type: 'javelin', w: 60, h: 10, grav: 0.08, bkb: 35, kbg: 80, ang: 30, life: 120 }, { x: f.x + f.facing * 40, y: f.y - f.h * 0.75, vx: f.facing * 13, vy: -2, dmg: 13 }); Audio.play('arrow'); }
    } });
    if (key === 'up') return startMove(W, f, { special: true, frames: 70, anim: 'slam', onFrame(W, f, m) {
      if (m.t === 8) { f.vy = -12; f.grounded = false; f.plat = null; }
      if (m.t > 8 && f.grounded && !m.data.landed) { m.data.landed = true; W.shake = 18; Audio.play('golem');
        W.hitboxes.push({ owner: f, rect: { x: f.x - 260, y: f.y - 50, w: 520, h: 50 }, dmg: 15, bkb: 55, kbg: 80, ang: 80, away: true, x0: f.x, hitSet: new Set() });
        sparks(W, f.x, f.y, 24, '#a08060', 1.5); }
    } });
  }

  /* ---------- Step ---------- */
  function step(W) {
    if (W.paused) return;
    W.t++;
    if (W.countdown > 0) { W.countdown--; for (const f of W.fighters) { f.inp = null; } return; }
    if (W.slowmo > 0) { W.slowmo--; if (W.slowmo % 2 === 1) return; }
    if (W.cfg.time && !W.over) W.timeLeft--;
    const finalActive = W.finals.length > 0;
    for (const f of W.fighters) {
      if (finalActive && !f.inFinal && W.finals[0].t < 30) continue; // freeze during banner
      if (f.slow) { f.slowAcc += 0.5; if (f.slowAcc < 1) continue; f.slowAcc -= 1; }
      updateFighter(W, f);
      if (f.isBoss && !f.dead && f.stocks > 0) f.damage = Math.min(f.damage, 80);
    }
    for (const F of W.finals) updateFinal(W, F);
    W.finals = W.finals.filter(F => { if (F.t >= F.dur) { endFinal(W, F); return false; } return true; });
    if (W.finalBanner) { W.finalBanner.t++; if (W.finalBanner.t > 70) W.finalBanner = null; }
    for (const m of W.minions) updateMinion(W, m);
    W.minions = W.minions.filter(m => m.life > 0);
    for (const p of W.projectiles) if (!p.dead) updateProj(W, p);
    W.projectiles = W.projectiles.filter(p => !p.dead);
    itemTick(W);
    updateFields(W);
    updateHazards(W);
    resolveHits(W);
    for (const f of W.fighters) checkKO(W, f);
    for (const e of W.effects) { e.t++; if (e.vx !== undefined) { e.x += e.vx; e.y += e.vy; if (e.type === 'spark' || e.type === 'drop') e.vy += 0.25; } }
    W.effects = W.effects.filter(e => e.t < e.life);
    if (W.effects.length > 700) W.effects.splice(0, W.effects.length - 700);
    if (W.shake > 0) W.shake *= 0.86; if (W.shake < 0.5) W.shake = 0;
    if (W.flash > 0) W.flash--;
    checkEnd(W);
    if (W.over) W.endT++;
  }

  return { createWorld, step, updateCamera, Fighter, buildNormals, knockback, spawnItem, PCOLORS, ARCH, golemOf, activePlats, nearestEnemy, groundAt, overlap, clamp, KB_SCALE, KB_DECAY };
})();
