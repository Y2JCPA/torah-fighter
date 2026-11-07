/* Torah Fighter — all art drawn in code: heroes, weapons, items, stages, effects, finals. */
'use strict';

const Art = (() => {
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

  function shade(hex, amt) {
    let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function limb(ctx, x1, y1, x2, y2, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  /* ---------- Pose ---------- */
  function pose(f, t) {
    const P = { fa: 0.9, ba: 1.2, lean: 0, legA: 0, legB: 0, crouch: 0, spin: 0, bob: 0, tuck: 0, weaponOut: false, eyes: 'o', squash: 1, horiz: 0 };
    const st = f.state, m = f.move;
    if (st === 'idle' || st === 'shield') { P.bob = Math.sin(t * 0.08) * 1.5; P.fa = 1.0; P.ba = 1.25; }
    if (st === 'walk' || st === 'run') {
      const sp = st === 'run' ? 0.32 : 0.18, amp = st === 'run' ? 0.75 : 0.45;
      const s = Math.sin(f.stateT * sp);
      P.legA = s * amp; P.legB = -s * amp; P.fa = 0.9 - s * 0.6; P.ba = 0.9 + s * 0.6; P.lean = st === 'run' ? 0.12 : 0.04; P.bob = Math.abs(s) * -2;
    }
    if (st === 'jump' || st === 'fall') { P.tuck = st === 'jump' ? 0.6 : 0.25; P.fa = st === 'jump' ? -0.5 : 0.2; P.ba = 0.3; P.legA = 0.3; P.legB = -0.4; }
    if (st === 'crouch') { P.crouch = 0.28; P.fa = 1.3; }
    if (st === 'hit' || f.hitstun > 0) { P.lean = -0.35; P.fa = -2.2; P.ba = -1.0; P.legA = 0.5; P.legB = -0.3; P.eyes = 'x'; if (f.tumble && !f.grounded) P.spin = f.stateT * 0.25; }
    if (st === 'down') { P.horiz = 1; P.eyes = 'x'; }
    if (st === 'ledge') { P.fa = -2.0; P.ba = -1.8; P.legA = 0.2; P.legB = 0.4; }
    if (st === 'roll') { P.spin = (f.stateT / 26) * TAU; P.tuck = 1; }
    if (st === 'spotdodge') { P.crouch = 0.15; }
    if (st === 'airdodge') { P.tuck = 0.8; P.fa = -0.4; }
    if (st === 'grabbing') { P.fa = 0; P.ba = 0.2; }
    if (st === 'grabbed') { P.fa = -1.8; P.ba = -1.2; P.eyes = 'x'; }
    if (f.stun) { P.eyes = f.stun.type === 'sleep' ? '-' : 'x'; P.fa = 1.3; P.ba = 1.3; if (f.stun.type === 'dizzy') P.lean = Math.sin(t * 0.15) * 0.15; }
    if (f.helpless && !f.grounded) { P.fa = -1.4; P.ba = -1.0; P.tuck = 0.2; }
    if (f.inFinal) { P.fa = -1.6; P.ba = -1.6; P.weaponOut = true; }
    if (m) {
      const d = m.def, fr = d.frames || 30;
      const firstHit = d.hits && d.hits.length ? d.hits[0].s : Math.max(4, fr * 0.35);
      const pre = ease(m.t / firstHit), post = ease((m.t - firstHit) / Math.max(1, fr - firstHit));
      P.weaponOut = true;
      const A = d.anim;
      if (A === 'jab') { P.fa = m.t >= firstHit && m.t < firstHit + 5 ? -0.05 : 0.6; P.lean = 0.08; }
      else if (A === 'swing' || A === 'whip') { P.fa = m.t < firstHit ? lerp(0.8, -2.1, pre) : lerp(-2.1, 0.75, ease((m.t - firstHit) / 4)); P.lean = m.t >= firstHit ? 0.15 : -0.05; }
      else if (A === 'overhead' || A === 'slam') { P.fa = m.t < firstHit ? lerp(0.5, -2.7, pre) : lerp(-2.7, 1.0, ease((m.t - firstHit) / 4)); P.lean = m.t >= firstHit ? 0.2 : -0.12; if (A === 'slam') P.crouch = m.t >= firstHit ? 0.15 : 0; }
      else if (A === 'thrust') { P.fa = 0; P.ba = 0.3; P.lean = m.t >= firstHit ? 0.25 : -0.05; }
      else if (A === 'crawl') { P.horiz = m.t > firstHit - 2 ? 0.85 : 0.3; P.fa = 0; }
      else if (A === 'up' || A === 'rise') { P.fa = m.t < firstHit ? lerp(0.6, 1.4, pre) : lerp(1.4, -1.65, ease((m.t - firstHit) / 5)); P.ba = -1.2; P.lean = -0.05; if (A === 'rise') P.tuck = 0.3; }
      else if (A === 'low') { P.crouch = 0.25; P.fa = m.t >= firstHit ? 0.45 : 1.0; P.lean = 0.2; }
      else if (A === 'spin') { P.spin = m.t >= firstHit - 2 ? ((m.t - firstHit + 2) / 12) * TAU : 0; P.fa = 0.1; P.ba = 0.1 + Math.PI; }
      else if (A === 'back') { P.fa = Math.PI - 0.3; P.ba = Math.PI - 0.5; P.lean = -0.1; }
      else if (A === 'down') { P.fa = m.t < firstHit ? lerp(-1.2, -2.6, pre) : 1.55; P.ba = 1.2; P.tuck = 0.5; }
      else if (A === 'shoot') { P.fa = -0.05; P.ba = 0.0; P.lean = -0.04; P.shooting = true; P.charge = m.charge || 0; }
      else if (A === 'cast' || A === 'point') { P.fa = A === 'point' ? -0.25 : -1.1; P.ba = A === 'point' ? 1.0 : -1.3; }
      else if (A === 'raise') { P.fa = -1.65; P.ba = -1.45; }
      else if (A === 'harp') { P.fa = 0.2; P.ba = 0.4; P.harp = true; }
      else if (A === 'eat') { P.fa = -2.2 + Math.sin(m.t * 0.5) * 0.2; P.ba = 1.0; }
      else if (A === 'grab') { P.fa = 0; P.ba = 0.1; P.lean = 0.12; }
      else if (A === 'throw') { P.fa = m.t < 5 ? -2.4 : 0.2; }
      else if (A === 'flash') { P.fa = m.t < firstHit ? -1.0 : -1.75; P.ba = m.t < firstHit ? -0.8 : -1.5; P.flash = m.t >= firstHit; }
      if (d.smash && m.charge > 0 && m.t === d.charge) { P.shake = 1.5; }
      P.anim = A; P.post = post;
    }
    return P;
  }

  /* ---------- Weapons ---------- */
  function handWeapon(f) {
    if (f.held) return f.held.kind;
    const m = f.move;
    if (m && m.def.weapon) return m.def.weapon;
    if (m && m.def.anim === 'shoot' && f.hero.look.weapon.startsWith('bow')) return 'bowdraw';
    if (m && m.def.anim === 'shoot' && f.hero.id === 'david') return 'slingdraw';
    if (m && m.def.anim === 'flash') return 'jartorch';
    if (m && m.def.anim === 'harp') return 'harp';
    if (m && m.def.sp && m.def.sp.proj && m.def.sp.proj.type === 'torch') return 'torch';
    if (m && m.def.sp && m.def.sp.proj && (m.def.sp.proj.type === 'sound')) return 'shofar';
    if (m && m.def.sp && m.def.sp.proj && (m.def.sp.proj.type === 'milk')) return 'bowl';
    const L = f.hero.look;
    switch (f.hero.arch) {
      case 'club': return 'club';
      case 'sword': return 'sword';
      case 'spear': return 'spear';
      case 'mallet': return 'mallet';
      case 'staff': return L.weapon === 'mantle' ? 'mantle' : L.weapon;
      default: return null;
    }
  }

  function drawWeapon(ctx, kind, H, ang, P, f) {
    // drawn at hand origin, x-axis pointing along `ang`
    const k = H / 90;
    ctx.save(); ctx.rotate(ang);
    switch (kind) {
      case 'staff': case 'cane': case 'shepherd': {
        const len = kind === 'shepherd' ? 52 : kind === 'cane' ? 60 : 72;
        limb(ctx, -len * 0.35 * k, 0, len * 0.65 * k, 0, 4.5 * k, '#7b5230');
        if (kind === 'shepherd' || kind === 'cane') { ctx.strokeStyle = '#7b5230'; ctx.lineWidth = 4.5 * k; ctx.beginPath(); ctx.arc(len * 0.65 * k, -6 * k, 6 * k, Math.PI / 2, -Math.PI / 2, true); ctx.stroke(); }
        break;
      }
      case 'bigstaff': {
        limb(ctx, -40 * k, 0, 70 * k, 0, 5 * k, '#6b4423');
        ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 5 * k; ctx.beginPath(); ctx.arc(70 * k, -7 * k, 7 * k, Math.PI / 2, -Math.PI * 0.9, true); ctx.stroke();
        break;
      }
      case 'mantle': {
        ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.moveTo(0, -5 * k);
        const L = (P && P.anim === 'whip') ? 95 : 40;
        for (let i = 0; i <= 8; i++) ctx.lineTo(i / 8 * L * k, Math.sin(i * 0.9 + (f ? f.stateT : 0) * 0.3) * 3 * k - 4 * k);
        for (let i = 8; i >= 0; i--) ctx.lineTo(i / 8 * L * k, Math.sin(i * 0.9 + (f ? f.stateT : 0) * 0.3) * 3 * k + 5 * k);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 1.5; ctx.stroke();
        break;
      }
      case 'club': limb(ctx, -6 * k, 0, 40 * k, 0, 6 * k, '#6e4a2a'); limb(ctx, 26 * k, 0, 42 * k, 0, 10 * k, '#5a3a1e'); break;
      case 'sword':
        limb(ctx, -6 * k, 0, 6 * k, 0, 4 * k, '#5b3a1a'); limb(ctx, 6 * k, -7 * k, 6 * k, 7 * k, 3 * k, '#c9a227');
        ctx.fillStyle = '#dfe6e9'; ctx.beginPath(); ctx.moveTo(7 * k, -3 * k); ctx.lineTo(44 * k, -2.5 * k); ctx.lineTo(50 * k, 0); ctx.lineTo(44 * k, 2.5 * k); ctx.lineTo(7 * k, 3 * k); ctx.fill();
        ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 1; ctx.stroke(); break;
      case 'spear': {
        limb(ctx, -40 * k, 0, 62 * k, 0, 3.5 * k, '#8b5a2b');
        ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(60 * k, -5 * k); ctx.lineTo(80 * k, 0); ctx.lineTo(60 * k, 5 * k); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 1; ctx.stroke();
        break;
      }
      case 'mallet': limb(ctx, -4 * k, 0, 30 * k, 0, 4 * k, '#8b5a2b'); ctx.fillStyle = '#6d4c2f'; rr(ctx, 26 * k, -9 * k, 12 * k, 18 * k, 3 * k); ctx.fill(); break;
      case 'jawbone': {
        ctx.fillStyle = '#f2e8cf'; ctx.strokeStyle = '#9c8b6a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-4 * k, -4 * k); ctx.quadraticCurveTo(20 * k, -14 * k, 46 * k, -10 * k); ctx.lineTo(48 * k, 4 * k); ctx.quadraticCurveTo(22 * k, 2 * k, 8 * k, 8 * k); ctx.lineTo(-4 * k, 6 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { ctx.fillRect((18 + i * 6) * k, -10 * k + i * 0.3, 3 * k, 4 * k); }
        break;
      }
      case 'goliath': { // buster-style giant broadsword
        ctx.fillStyle = '#3d2b1f'; ctx.fillRect(-12 * k, -3.5 * k, 20 * k, 7 * k); // grip
        ctx.fillStyle = '#8e9aa3'; ctx.fillRect(8 * k, -10 * k, 6 * k, 20 * k); // guard
        const grd = ctx.createLinearGradient(0, -11 * k, 0, 11 * k); grd.addColorStop(0, '#f4f6f7'); grd.addColorStop(0.5, '#aab7b8'); grd.addColorStop(1, '#6c7a7d');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(14 * k, -11 * k); ctx.lineTo(108 * k, -11 * k); ctx.lineTo(120 * k, 2 * k); ctx.lineTo(108 * k, 11 * k); ctx.lineTo(14 * k, 11 * k); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#4b5557'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.arc(24 * k, 0, 3 * k, 0, TAU); ctx.arc(34 * k, 0, 3 * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(40 * k, -8 * k); ctx.lineTo(106 * k, -8 * k); ctx.stroke();
        break;
      }
      case 'busters': // boss: giant spear + sword look
        limb(ctx, -50 * k, 0, 90 * k, 0, 5 * k, '#5b3a1a'); ctx.fillStyle = '#8d8d8d'; ctx.beginPath(); ctx.moveTo(88 * k, -7 * k); ctx.lineTo(112 * k, 0); ctx.lineTo(88 * k, 7 * k); ctx.fill(); break;
      case 'sling': case 'slingdraw': {
        ctx.strokeStyle = '#8b6b3e'; ctx.lineWidth = 2;
        const sw = P && P.shooting ? ((f.stateT || 0) * 0.6) : 0.3;
        ctx.beginPath(); ctx.moveTo(0, 0); const ex = Math.cos(sw) * 22 * k, ey = Math.sin(sw) * 22 * k; ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.arc(ex, ey, 4 * k, 0, TAU); ctx.fill();
        break;
      }
      case 'bowdraw': {
        ctx.strokeStyle = '#6e4a1f'; ctx.lineWidth = 3.5 * k; ctx.beginPath(); ctx.arc(-6 * k, 0, 24 * k, -1.2, 1.2); ctx.stroke();
        const pull = Math.min(14, 4 + ((P && P.charge) || 0) * 0.3) * k;
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6 * k + Math.cos(-1.2) * 24 * k, Math.sin(-1.2) * 24 * k); ctx.lineTo(-pull - 6 * k, 0); ctx.lineTo(-6 * k + Math.cos(1.2) * 24 * k, Math.sin(1.2) * 24 * k); ctx.stroke();
        limb(ctx, -pull - 6 * k, 0, 26 * k, 0, 1.6 * k, '#8b5a2b'); ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(26 * k, -3 * k); ctx.lineTo(32 * k, 0); ctx.lineTo(26 * k, 3 * k); ctx.fill();
        break;
      }
      case 'shofar': {
        ctx.strokeStyle = '#d9b77e'; ctx.lineWidth = 7 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(14 * k, -16 * k, 30 * k, -8 * k); ctx.stroke();
        ctx.strokeStyle = '#b8935a'; ctx.lineWidth = 11 * k; ctx.beginPath(); ctx.moveTo(28 * k, -9 * k); ctx.lineTo(34 * k, -6 * k); ctx.stroke(); break;
      }
      case 'jar': case 'jartorch': {
        ctx.fillStyle = '#b5651d'; ctx.beginPath(); ctx.ellipse(10 * k, 0, 9 * k, 11 * k, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#8e4a12'; ctx.fillRect(6 * k, -14 * k, 8 * k, 5 * k);
        flame(ctx, 10 * k, -16 * k, 9 * k, (f ? f.stateT : 0)); break;
      }
      case 'torch': limb(ctx, -4 * k, 0, 26 * k, 0, 4 * k, '#7b5230'); flame(ctx, 30 * k, -2 * k, 9 * k, f ? f.stateT : 0); break;
      case 'peg': limb(ctx, 0, 0, 30 * k, 0, 4 * k, '#a07a4a'); ctx.fillStyle = '#a07a4a'; ctx.beginPath(); ctx.moveTo(30 * k, -3 * k); ctx.lineTo(38 * k, 0); ctx.lineTo(30 * k, 3 * k); ctx.fill(); break;
      case 'hail': ctx.fillStyle = '#d6eaf8'; ctx.strokeStyle = '#85c1e9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(14 * k, 0, 14 * k, 0, TAU); ctx.fill(); ctx.stroke(); break;
      case 'staffitem': case 'staff_item': break;
      case 'bowl': ctx.fillStyle = '#c8a165'; ctx.beginPath(); ctx.arc(10 * k, -2 * k, 10 * k, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fffbe8'; ctx.fillRect(0, -3 * k, 20 * k, 3 * k); break;
      case 'harp': {
        ctx.strokeStyle = '#c49a3c'; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.moveTo(4 * k, 10 * k); ctx.quadraticCurveTo(0, -20 * k, 18 * k, -22 * k); ctx.lineTo(22 * k, 10 * k); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo((7 + i * 3) * k, 8 * k); ctx.lineTo((7 + i * 3) * k, -14 * k + i); ctx.stroke(); }
        break;
      }
    }
    if (kind === 'staff' && f && f.held) { /* Aharon's staff blossoms */ }
    ctx.restore();
  }

  function flame(ctx, x, y, r, t) {
    const fl = 1 + Math.sin(t * 0.7) * 0.15;
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y - r * 2.2 * fl, x + r * 0.7, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(x - r * 0.35, y); ctx.quadraticCurveTo(x, y - r * 1.3 * fl, x + r * 0.35, y); ctx.closePath(); ctx.fill();
  }

  /* ---------- Fighter ---------- */
  function drawHead(ctx, L, k, hr, eyes, t, hero) {
    // hair behind
    if (L.head === 'none' || L.head === 'circlet' || L.head === 'crown') {
      ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(-1 * k, 0, hr * 1.03, Math.PI * 0.75, Math.PI * 2.1); ctx.fill();
      if (L.hairy || hero.id === 'moshe') { ctx.beginPath(); ctx.ellipse(-hr * 0.7, hr * 0.3, hr * 0.5, hr * 0.9, 0.3, 0, TAU); ctx.fill(); }
    }
    if (L.head === 'locks') {
      ctx.strokeStyle = L.hair; ctx.lineWidth = 3.4 * k; ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) { const a = Math.PI * 0.55 + i * 0.16; const sx = Math.cos(a) * hr, sy = Math.sin(a) * hr * 0.2 - hr * 0.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx - 8 * k, sy + hr, sx - 4 * k + Math.sin(t * 0.1 + i) * 2, sy + hr * 2.2); ctx.stroke(); }
      ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(0, -hr * 0.1, hr * 1.05, Math.PI, TAU); ctx.fill();
    }
    if (L.head === 'scarf') { ctx.fillStyle = L.headColor; ctx.beginPath(); ctx.ellipse(-hr * 0.35, hr * 0.4, hr * 0.9, hr * 1.5, 0.2, 0, TAU); ctx.fill(); }
    // face
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    // beard
    if (L.beard && L.beardLen > 0) {
      ctx.fillStyle = L.beard; ctx.beginPath();
      ctx.moveTo(-hr * 0.55, hr * 0.15); ctx.quadraticCurveTo(-hr * 0.3, hr * (0.9 + L.beardLen * 0.9), hr * 0.45, hr * (0.7 + L.beardLen * 0.8));
      ctx.quadraticCurveTo(hr * 1.0, hr * 0.5, hr * 0.95, hr * 0.15); ctx.quadraticCurveTo(hr * 0.5, hr * 0.45, hr * 0.15, hr * 0.35); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hr * 0.5, hr * 0.32, hr * 0.32, hr * 0.12, 0, 0, TAU); ctx.fill();
    }
    // eyes
    ctx.fillStyle = '#1a1a1a'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.6 * k;
    const ex = hr * 0.45, ey = -hr * 0.12;
    if (eyes === 'x') { ctx.beginPath(); ctx.moveTo(ex - 3 * k, ey - 3 * k); ctx.lineTo(ex + 3 * k, ey + 3 * k); ctx.moveTo(ex + 3 * k, ey - 3 * k); ctx.lineTo(ex - 3 * k, ey + 3 * k); ctx.stroke(); }
    else if (eyes === '-') { ctx.beginPath(); ctx.moveTo(ex - 3 * k, ey); ctx.lineTo(ex + 3 * k, ey); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(ex, ey, 2.2 * k, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(ex - 4 * k, ey - 5 * k); ctx.lineTo(ex + 4 * k, ey - 4 * k); ctx.stroke(); }
    if (!L.beard || L.beardLen < 0.4) { ctx.beginPath(); ctx.moveTo(hr * 0.3, hr * 0.42); ctx.lineTo(hr * 0.62, hr * 0.38); ctx.stroke(); }
    // headwear
    const hc = L.headColor || '#888';
    switch (L.head) {
      case 'turban': ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.ellipse(-1 * k, -hr * 0.55, hr * 1.12, hr * 0.62, 0, Math.PI, TAU); ctx.fill(); ctx.fillRect(-hr * 1.12, -hr * 0.6, hr * 2.24, hr * 0.32);
        ctx.strokeStyle = hc; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.moveTo(-hr * 1.1, -hr * 0.45); ctx.quadraticCurveTo(0, -hr * 0.95, hr * 1.1, -hr * 0.45); ctx.stroke(); break;
      case 'crown': ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(0, -hr * 0.2, hr * 1.02, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = hc; ctx.beginPath(); ctx.moveTo(-hr * 0.8, -hr * 0.6); for (let i = 0; i <= 4; i++) { ctx.lineTo(-hr * 0.8 + i * hr * 0.4, -hr * (i % 2 ? 0.95 : 1.35)); } ctx.lineTo(hr * 0.8, -hr * 0.6); ctx.closePath(); ctx.fill(); break;
      case 'helmet': ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, -hr * 0.2, hr * 1.08, Math.PI * 1.02, TAU * 0.995); ctx.fill(); ctx.fillRect(-hr * 1.08, -hr * 0.3, hr * 2.16, hr * 0.22);
        ctx.fillStyle = shade(hc, -40); ctx.fillRect(hr * 0.2, -hr * 0.2, hr * 0.18, hr * 0.6); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(-hr * 0.1, -hr * 1.25, hr * 0.7, hr * 0.22, -0.1, 0, TAU); ctx.fill(); break;
      case 'bosshelm': ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, -hr * 0.15, hr * 1.12, Math.PI, TAU); ctx.fill(); ctx.fillRect(-hr * 1.12, -hr * 0.2, hr * 0.6, hr * 0.9);
        ctx.fillStyle = '#e74c3c'; for (let i = 0; i < 6; i++) ctx.fillRect(-hr * 0.9 + i * hr * 0.32, -hr * 1.6, hr * 0.18, hr * 0.5); break;
      case 'circlet': ctx.fillStyle = hc; ctx.fillRect(-hr, -hr * 0.55, hr * 2, hr * 0.2); ctx.beginPath(); ctx.arc(hr * 0.6, -hr * 0.45, hr * 0.14, 0, TAU); ctx.fillStyle = '#3498db'; ctx.fill(); break;
      case 'biret': ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(0, -hr * 0.7, hr * 1.35, hr * 0.28, 0, 0, TAU); ctx.fill(); rr(ctx, -hr * 0.85, -hr * 1.45, hr * 1.7, hr * 0.8, hr * 0.25); ctx.fill(); break;
      case 'kerchief': ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, -hr * 0.15, hr * 1.06, Math.PI * 0.95, TAU * 1.0); ctx.fill(); ctx.beginPath(); ctx.moveTo(-hr, -hr * 0.2); ctx.lineTo(-hr * 1.6, hr * 0.9); ctx.lineTo(-hr * 0.7, hr * 0.6); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-hr * 1.05, -hr * 0.45, hr * 2.1, hr * 0.14); break;
      case 'kohen': ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -hr * 0.85, hr * 0.95, hr * 0.75, 0, 0, TAU); ctx.fill(); ctx.fillRect(-hr * 0.95, -hr * 0.85, hr * 1.9, hr * 0.5); ctx.strokeStyle = '#3b5bdb'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(-hr * 0.95, -hr * 0.5); ctx.lineTo(hr * 0.95, -hr * 0.5); ctx.stroke(); break;
      case 'scarf': ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(0, -hr * 0.1, hr * 1.1, Math.PI * 0.9, TAU * 1.02); ctx.fill(); break;
      case 'locks': break;
      case 'none': if (hero.id === 'moshe') { const g = ctx.createRadialGradient(0, 0, hr * 0.8, 0, 0, hr * 1.9); g.addColorStop(0, 'rgba(255,240,160,.45)'); g.addColorStop(1, 'rgba(255,240,160,0)'); ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, hr * 1.9, 0, TAU); ctx.fill(); ctx.restore(); } break;
    }
  }

  function drawBody(ctx, hero, H, W, P, t, f) {
    const L = hero.look, k = H / 90;
    const wide = W / 46;
    const hipY = -H * 0.42, shY = -H * 0.73, headY = -H * 0.86, hr = H * 0.115 * (hero.id === 'moshe' ? 0.8 : 1);
    const legLen = H * 0.42;
    // legs
    const leg = (a, front) => {
      const kx = Math.sin(a) * legLen * 0.5, ky = hipY + Math.cos(a) * legLen * 0.5 * (1 - P.tuck * 0.4);
      const fx2 = kx + Math.sin(a + P.tuck * 1.2) * legLen * 0.5, fy = ky + Math.cos(a * 0.5 + P.tuck * 1.2) * legLen * 0.5 * (1 - P.tuck * 0.3);
      const col = front ? shade(L.robe, -20) : shade(L.robe, -45);
      limb(ctx, (front ? 3 : -3) * k * wide, hipY, kx, ky, 8 * k * wide, L.skin); limb(ctx, kx, ky, fx2, fy, 7 * k * wide, L.skin);
      ctx.fillStyle = '#5a3d22'; rr(ctx, fx2 - 5 * k, fy - 3 * k, 12 * k, 5 * k, 2 * k); ctx.fill();
      return col;
    };
    leg(P.legB, false);
    // back arm
    const arm = (a, front) => {
      const sx = (front ? 4 : -4) * k * wide, sy = shY + 3 * k;
      const al = H * 0.3;
      const ex = sx + Math.cos(a) * al * 0.5, ey = sy + Math.sin(a) * al * 0.5;
      const hx = sx + Math.cos(a) * al, hy = sy + Math.sin(a) * al;
      limb(ctx, sx, sy, ex, ey, 9 * k * wide, front ? L.robe2 : shade(L.robe2, -35)); limb(ctx, ex, ey, hx, hy, 7 * k * wide, L.skin);
      ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(hx, hy, 4 * k * wide, 0, TAU); ctx.fill();
      return [hx, hy];
    };
    const backHand = arm(P.ba, false);
    // bow on back
    if ((L.weapon === 'bow' || L.weapon === 'bow2') && !(P.shooting)) { ctx.strokeStyle = '#6e4a1f'; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(-8 * k, shY + 14 * k, 20 * k, -2.2, 0.6); ctx.stroke(); }
    // torso / robe
    ctx.fillStyle = L.robe; ctx.beginPath();
    const sw = 13 * k * wide, hw = 16 * k * wide;
    ctx.moveTo(-sw, shY); ctx.lineTo(sw, shY); ctx.lineTo(hw, hipY + H * 0.2); ctx.lineTo(-hw, hipY + H * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.stroke();
    // sash/stripe
    ctx.fillStyle = L.robe2; ctx.fillRect(-hw * 0.92, hipY - 3 * k, hw * 1.84, 6 * k);
    if (L.armor) { ctx.fillStyle = 'rgba(200,170,90,.85)'; for (let r = 0; r < 4; r++) for (let c = -2; c <= 2; c++) { ctx.beginPath(); ctx.arc(c * 5 * k * wide, shY + 6 * k + r * 7 * k, 3 * k, 0, Math.PI); ctx.fill(); } }
    if (L.hairy) { ctx.strokeStyle = shade(L.robe, -30); ctx.lineWidth = 1; for (let i = 0; i < 10; i++) { const x = -sw + i * sw * 0.2; ctx.beginPath(); ctx.moveTo(x, shY + 4); ctx.lineTo(x - 2, hipY + H * 0.18); ctx.stroke(); } ctx.fillStyle = '#3e2a17'; ctx.fillRect(-hw * 0.95, hipY - 3 * k, hw * 1.9, 6 * k); }
    if (hero.id === 'pinchas') { ctx.fillStyle = '#c9a227'; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { ctx.fillStyle = ['#e74c3c', '#27ae60', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c'][(r * 3 + c) % 6]; ctx.fillRect(-7 * k + c * 5 * k, shY + 6 * k + r * 5 * k, 4 * k, 4 * k); } }
    if (L.buff) { ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, shY + 6 * k); ctx.lineTo(0, hipY - 6 * k); ctx.stroke(); }
    // tzitzit
    if (hero.id !== 'yael' && !hero.boss) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * hw * 0.85, hipY + H * 0.18); ctx.lineTo(s * hw * 0.9, hipY + H * 0.27); ctx.stroke(); } ctx.strokeStyle = '#2c5aa0'; ctx.beginPath(); ctx.moveTo(hw * 0.88, hipY + H * 0.2); ctx.lineTo(hw * 0.9, hipY + H * 0.25); ctx.stroke(); }
    leg(P.legA, true);
    // head
    ctx.save(); ctx.translate(2 * k, headY); drawHead(ctx, L, k, hr, P.eyes, t, hero); ctx.restore();
    // front arm + weapon
    const fh = arm(P.fa, true);
    const wk = f ? handWeapon(f) : (L.weapon === 'none' ? null : L.weapon);
    if (wk) {
      ctx.save(); ctx.translate(fh[0], fh[1]);
      let wa = P.fa;
      const longW = ['staff', 'bigstaff', 'spear', 'cane', 'shepherd'].includes(wk);
      if (!P.weaponOut && longW) wa = -Math.PI / 2 + 0.15;
      else if (!P.weaponOut && ['sword', 'club', 'mallet', 'torch'].includes(wk)) wa = P.fa - 1.2;
      if (wk === 'goliath' && !P.weaponOut) wa = -Math.PI / 2 - 0.5;
      drawWeapon(ctx, wk === 'staff' && f && f.held ? 'staff' : wk, H * (wk === 'goliath' ? 1 : 1) * (hero.boss ? 0.8 : 1), wa, P, f);
      ctx.restore();
    }
    if (P.flash) { const g = ctx.createRadialGradient(fh[0], fh[1], 0, fh[0], fh[1], 80 * k); g.addColorStop(0, 'rgba(255,240,150,.9)'); g.addColorStop(1, 'rgba(255,240,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fh[0], fh[1], 80 * k, 0, TAU); ctx.fill(); }
    return { fh, backHand };
  }

  function fighter(ctx, f, W) {
    const t = W.t;
    if (f.dead) return;
    const P = pose(f, t);
    const blink = f.invuln > 0 && f.invuln < 9000 && !f.onHalo && Math.floor(t / 3) % 2 === 0;
    ctx.save();
    let sx = f.damageShake > 0 && f.hitlag > 0 ? (Math.random() - 0.5) * 6 : 0;
    if (P.shake) sx += (Math.random() - 0.5) * P.shake * 2;
    ctx.translate(f.x + sx, f.y);
    // shadow
    if (f.grounded) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, f.w * 0.6, 5, 0, 0, TAU); ctx.fill(); }
    // halo platform
    if (f.onHalo) { ctx.fillStyle = 'rgba(255,240,180,.85)'; ctx.beginPath(); ctx.ellipse(0, 4, 50, 9, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.stroke(); }
    if (f.stun && f.stun.type === 'buried') ctx.translate(0, f.h * 0.45);
    if (blink) ctx.globalAlpha = 0.55;
    // glow for final ready / buffs
    if (f.finalReady || f.inFinal) { const g = ctx.createRadialGradient(0, -f.h / 2, 5, 0, -f.h / 2, f.h); g.addColorStop(0, 'rgba(255,245,170,.55)'); g.addColorStop(1, 'rgba(255,245,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -f.h / 2, f.h, 0, TAU); ctx.fill(); }
    if (f.hero.look.glow) { ctx.fillStyle = 'rgba(255,240,170,.12)'; ctx.beginPath(); ctx.arc(0, -f.h * 0.86, f.h * 0.22, 0, TAU); ctx.fill(); }
    if (f.buffs.speed) { ctx.strokeStyle = 'rgba(255,211,77,.6)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-f.facing * (f.w * 0.6 + i * 8), -f.h * (0.3 + i * 0.2)); ctx.lineTo(-f.facing * (f.w * 1.2 + i * 8), -f.h * (0.3 + i * 0.2)); ctx.stroke(); } }
    ctx.save();
    ctx.scale(f.facing, 1);
    if (P.horiz) { ctx.translate(0, -f.h * 0.15 * P.horiz); ctx.rotate(P.horiz * Math.PI / 2 * (f.state === 'down' ? -1 : 1)); ctx.translate(f.h * 0.35 * P.horiz, 0); }
    if (P.spin) { ctx.translate(0, -f.h / 2); ctx.rotate(P.spin); ctx.translate(0, f.h / 2); }
    if (P.lean) { ctx.rotate(P.lean); }
    if (P.crouch) { ctx.scale(1, 1 - P.crouch); }
    ctx.translate(0, P.bob);
    drawBody(ctx, f.hero, f.h, f.w, P, t, f);
    ctx.restore();
    ctx.globalAlpha = 1;
    // stun visuals
    if (f.stun) {
      if (f.stun.type === 'frozen') { ctx.fillStyle = 'rgba(190,235,255,.55)'; ctx.strokeStyle = '#e0f7ff'; ctx.lineWidth = 2; rr(ctx, -f.w * 0.75, -f.h * 1.05, f.w * 1.5, f.h * 1.08, 6); ctx.fill(); ctx.stroke(); }
      if (f.stun.type === 'sleep') { ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('z', 14 + Math.sin(t * 0.1) * 4, -f.h - 6 - (t % 40) * 0.5); ctx.fillText('Z', 24, -f.h - 20 - (t % 40) * 0.3); }
      if (f.stun.type === 'dizzy') { for (let i = 0; i < 3; i++) { const a = t * 0.12 + i * TAU / 3; ctx.fillStyle = '#ffe680'; star(ctx, Math.cos(a) * 22, -f.h - 8 + Math.sin(a) * 6, 6); } }
      if (f.stun.type === 'buried') { ctx.fillStyle = '#7b5a3a'; ctx.beginPath(); ctx.ellipse(0, -f.h * 0.45, f.w, 10, 0, 0, TAU); ctx.fill(); }
    }
    // shield bubble
    if (f.state === 'shield') {
      const r = (f.h * 0.55) * (0.35 + 0.65 * f.shieldHP / 100);
      ctx.fillStyle = hexA(f.color, 0.35); ctx.strokeStyle = hexA(f.color, 0.9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -f.h / 2, r, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (f.reflect) { ctx.strokeStyle = f.reflect.absorb ? 'rgba(150,200,255,.9)' : 'rgba(255,240,150,.9)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(0, -f.h / 2, f.reflect.r, t * 0.1, t * 0.1 + TAU); ctx.stroke(); ctx.setLineDash([]); if (!f.reflect.absorb) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffe680'; ctx.font = '16px serif'; ctx.fillText('♪', Math.cos(t * 0.1 + i * 2) * f.reflect.r * 0.8, -f.h / 2 + Math.sin(t * 0.1 + i * 2) * f.reflect.r * 0.8); } }
    // rise move fx
    const m = f.move;
    if (m && m.def.fx === 'gates' && m.t >= 6) { ctx.fillStyle = '#8b5a2b'; ctx.strokeStyle = '#4a2d14'; ctx.lineWidth = 3; for (const s of [-1, 1]) { rr(ctx, s * 8 - (s < 0 ? 34 : 0), -f.h * 1.6, 34, f.h * 0.75, 3); ctx.fill(); ctx.stroke(); } }
    if (m && m.def.fx === 'chariot' && m.t >= 8) { ctx.fillStyle = 'rgba(255,120,20,.8)'; ctx.beginPath(); ctx.ellipse(0, 6, f.w * 1.3, 14, 0, 0, TAU); ctx.fill(); flame(ctx, -20, 0, 14, t); flame(ctx, 20, 0, 14, t + 3); flame(ctx, 0, -4, 16, t + 7); }
    if (m && m.def.fx === 'stars' && m.t >= 6) { for (let i = 0; i < 5; i++) { ctx.fillStyle = '#ffe680'; star(ctx, Math.cos(t * 0.2 + i * 1.3) * 30, -f.h * 0.5 + Math.sin(t * 0.2 + i * 1.3) * 40, 5); } }
    if (m && m.def.fx === 'axe' && m.t >= 8) { ctx.save(); ctx.scale(f.facing, 1); ctx.translate(0, -f.h); ctx.rotate(-0.4); limb(ctx, 0, 0, 0, -80, 5, '#6b4423'); ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(0, -80); ctx.lineTo(26, -92); ctx.lineTo(26, -62); ctx.closePath(); ctx.fill(); ctx.restore(); }
    // player tag
    ctx.restore();
    if (!f.dead) tag(ctx, f, W);
  }

  function tag(ctx, f, W) {
    const lab = f.isBoss ? 'BOSS' : f.cpu ? 'CPU' : 'P' + (f.slot + 1);
    const y = f.y - f.h - 26 - (f.hero.look.head === 'biret' || f.hero.look.head === 'kohen' ? 10 : 0);
    ctx.save(); ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = f.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(lab, f.x, y); ctx.fillText(lab, f.x, y);
    ctx.beginPath(); ctx.moveTo(f.x - 6, y + 4); ctx.lineTo(f.x + 6, y + 4); ctx.lineTo(f.x, y + 11); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function star(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); }
  function magen(ctx, x, y, r) { ctx.beginPath(); for (let k = 0; k < 2; k++) { ctx.moveTo(x + Math.cos(-Math.PI / 2 + k * Math.PI) * r, y + Math.sin(-Math.PI / 2 + k * Math.PI) * r); for (let i = 1; i <= 3; i++) { const a = -Math.PI / 2 + k * Math.PI + i * TAU / 3; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } } ctx.stroke(); }

  /* ---------- Portrait (menus & HUD) ---------- */
  function portrait(ctx, hero, cx, cy, size, full = false) {
    ctx.save(); ctx.translate(cx, cy);
    if (full) {
      const H = 90, sc = size / (H * 1.25);
      ctx.scale(sc, sc); ctx.translate(0, H * 0.55);
      const P = { fa: 0.9, ba: 1.2, lean: 0, legA: 0.1, legB: -0.1, crouch: 0, spin: 0, bob: 0, tuck: 0, weaponOut: false, eyes: 'o' };
      drawBody(ctx, hero, H, hero.w * 90 / hero.h, P, 0, null);
    } else {
      const k = size / 40; ctx.scale(k, k);
      drawHead(ctx, hero.look, 1, 14, 'o', 0, hero);
    }
    ctx.restore();
  }

  /* ---------- Items ---------- */
  function itemIcon(ctx, kind, x, y, s = 1, t = 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    switch (kind) {
      case 'jawbone': ctx.rotate(-0.4); drawWeapon(ctx, 'jawbone', 70, 0); break;
      case 'goliath': ctx.rotate(-0.9); ctx.translate(-30, 0); drawWeapon(ctx, 'goliath', 50, 0); break;
      case 'sling': ctx.strokeStyle = '#8b6b3e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-14, -10); ctx.quadraticCurveTo(0, 14, 14, -10); ctx.stroke(); ctx.fillStyle = '#9a9a9a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, 6, 4, 0, TAU); ctx.fill(); } break;
      case 'shofar': ctx.translate(-14, 6); drawWeapon(ctx, 'shofar', 90, 0); break;
      case 'jar': drawWeapon(ctx, 'jar', 80, 0, null, { stateT: t }); break;
      case 'peg': ctx.rotate(-0.6); ctx.translate(-18, 0); drawWeapon(ctx, 'peg', 90, 0); break;
      case 'hail': ctx.translate(-14, 0); drawWeapon(ctx, 'hail', 80, 0); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(10, -5, 4, 0, TAU); ctx.fill(); break;
      case 'staff': ctx.rotate(-0.9); limb(ctx, -24, 0, 24, 0, 4, '#7b5230'); ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(16 + i * 3, -4 + (i % 2) * 7, 3, 0, TAU); ctx.fill(); } ctx.fillStyle = '#f5b7b1'; ctx.beginPath(); ctx.arc(22, 0, 2.5, 0, TAU); ctx.fill(); break;
      case 'manna': ctx.fillStyle = '#fbf5e0'; ctx.strokeStyle = '#d4c49a'; ctx.lineWidth = 1.5; for (const [a, b] of [[-8, 0], [6, -3], [0, 7], [9, 8], [-6, 10]]) { ctx.beginPath(); ctx.arc(a, b, 6, 0, TAU); ctx.fill(); ctx.stroke(); } break;
      case 'honey': ctx.fillStyle = '#f5b041'; ctx.strokeStyle = '#b9770e'; ctx.lineWidth = 1.5; for (const [a, b] of [[0, 0], [-10, -6], [10, -6], [-10, 6], [10, 6], [0, -12], [0, 12]]) { ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(a + Math.cos(i * TAU / 6) * 6, b + Math.sin(i * TAU / 6) * 6); ctx.closePath(); ctx.fill(); ctx.stroke(); } break;
      case 'ruach': {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#fff3a0'); g.addColorStop(1, 'rgba(255,200,60,.3)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 22 + Math.sin(t * 0.2) * 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#c99700'; ctx.lineWidth = 2; ctx.save(); ctx.rotate(t * 0.03); magen(ctx, 0, 0, 13); ctx.restore(); break;
      }
    }
    ctx.restore();
  }
  function item(ctx, it, W) {
    if (it.life < 120 && Math.floor(W.t / 4) % 2) return;
    const y = it.kind === 'ruach' ? it.y - 22 : it.y - 13 + (it.grounded ? Math.sin(W.t * 0.08 + (it.bob || 0)) * 2 - 2 : 0);
    if (it.grounded) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 16, 4, 0, 0, TAU); ctx.fill(); }
    itemIcon(ctx, it.kind, it.x, y, 1, W.t);
  }

  /* ---------- Projectiles ---------- */
  function proj(ctx, p, W) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2, dir = Math.sign(p.vx) || 1;
    ctx.save(); ctx.translate(cx, cy);
    switch (p.type) {
      case 'arrow': ctx.rotate(Math.atan2(p.vy, p.vx)); limb(ctx, -14, 0, 12, 0, 2, '#8b5a2b'); ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(12, -4); ctx.lineTo(18, 0); ctx.lineTo(12, 4); ctx.fill(); ctx.fillStyle = '#e74c3c'; ctx.fillRect(-15, -3, 5, 2); ctx.fillRect(-15, 1, 5, 2);
        if (p.owner && p.owner.hero.id === 'avraham') { ctx.fillStyle = 'rgba(230,200,120,.5)'; ctx.fillRect(-22, -1, 8, 2); } break;
      case 'dustsword': {
        const a = p.t < 8 ? 0 : 1; ctx.rotate(p.t * 0.5 * dir);
        if (!a) { ctx.fillStyle = 'rgba(210,180,120,.8)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.cos(i) * 6, Math.sin(i * 2) * 6, 3, 0, TAU); ctx.fill(); } }
        else { ctx.scale(dir, 1); ctx.translate(-14, 0); drawWeapon(ctx, 'sword', 60, 0); }
        break;
      }
      case 'stone': ctx.fillStyle = '#8f8f8f'; ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.arc(-2, -2, p.w / 5, 0, TAU); ctx.fill(); break;
      case 'geyser': { ctx.fillStyle = 'rgba(80,170,255,.75)'; const hh = p.h * (0.6 + 0.4 * Math.sin(p.t * 0.6)); ctx.beginPath(); ctx.moveTo(-p.w / 2, p.h / 2); ctx.quadraticCurveTo(-p.w * 0.6, -hh / 2, 0, p.h / 2 - hh); ctx.quadraticCurveTo(p.w * 0.6, -hh / 2, p.w / 2, p.h / 2); ctx.fill(); ctx.fillStyle = 'rgba(220,240,255,.8)'; ctx.fillRect(-4, p.h / 2 - hh, 8, hh); break; }
      case 'sound': { ctx.strokeStyle = 'rgba(255,240,180,' + Math.max(0, p.life / 45) + ')'; ctx.lineWidth = 4; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-dir * (20 + i * 12), 0, 20 + i * 12 + p.t * 0.5, -0.8, 0.8); if (dir < 0) { ctx.beginPath(); ctx.arc(dir * -(20 + i * 12) * -1, 0, 20 + i * 12 + p.t * 0.5, Math.PI - 0.8, Math.PI + 0.8); } ctx.stroke(); } break; }
      case 'firebolt': { const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2); g.addColorStop(0, 'rgba(255,220,80,0)'); g.addColorStop(1, 'rgba(255,90,20,.95)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-p.w / 2, -p.h / 2); ctx.lineTo(p.w / 2, -p.h / 2); ctx.lineTo(p.w * 0.3, p.h / 2); ctx.quadraticCurveTo(0, p.h / 2 + 12, -p.w * 0.3, p.h / 2); ctx.fill(); flame(ctx, 0, p.h / 2, 10, p.t); break; }
      case 'torch': ctx.rotate(p.t * 0.3 * dir); drawWeapon(ctx, 'torch', 70, 0, null, { stateT: p.t }); break;
      case 'milk': ctx.rotate(p.t * 0.2 * dir); ctx.fillStyle = '#c8a165'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, TAU); ctx.fill(); break;
      case 'peg': ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.translate(-16, 0); drawWeapon(ctx, 'peg', 80, 0); break;
      case 'hail': ctx.fillStyle = '#d6eaf8'; ctx.strokeStyle = '#85c1e9'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r = p.w / 2 * (0.85 + ((i * 7) % 3) * 0.08); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'star': ctx.rotate(p.t * 0.15); ctx.fillStyle = '#fff3a0'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14; star(ctx, 0, 0, p.w / 2); ctx.shadowBlur = 0; break;
      case 'javelin': ctx.rotate(Math.atan2(p.vy, p.vx)); limb(ctx, -30, 0, 22, 0, 4, '#6b4423'); ctx.fillStyle = '#999'; ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(34, 0); ctx.lineTo(22, 6); ctx.fill(); break;
      case 'item': ctx.rotate(p.t * 0.25 * dir); itemIcon(ctx, p.itemKind || 'hail', 0, 0, 1, p.t); break;
      default: ctx.fillStyle = '#fff'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }

  /* ---------- Minions ---------- */
  function minion(ctx, m, W) {
    ctx.save(); ctx.translate(m.x, m.y);
    const d = m.facing || 1;
    switch (m.type) {
      case 'fox': {
        ctx.scale(d, 1); const s = Math.sin(m.t * 0.6);
        ctx.fillStyle = '#d35400'; ctx.beginPath(); ctx.ellipse(0, -12, 16, 8, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(24, -14); ctx.lineTo(14, -6); ctx.fill(); ctx.beginPath(); ctx.moveTo(12, -18); ctx.lineTo(14, -26); ctx.lineTo(18, -18); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-14, -14); ctx.quadraticCurveTo(-30, -24, -34, -16); ctx.quadraticCurveTo(-26, -12, -14, -10); ctx.fill();
        limb(ctx, -8, -6, -8 + s * 5, 0, 3, '#a04000'); limb(ctx, 8, -6, 8 - s * 5, 0, 3, '#a04000');
        flame(ctx, -34, -18, 9, m.t); break;
      }
      case 'snake': {
        ctx.scale(d, 1); ctx.strokeStyle = '#4e8a3a'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const x = -22 + i * 4.4, y = -6 + Math.sin(i * 0.9 + m.t * 0.3) * 4; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
        ctx.fillStyle = '#5da544'; ctx.beginPath(); ctx.ellipse(24, -8, 8, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(25, -11, 2, 2);
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(31, -8); ctx.lineTo(37, -8 + Math.sin(m.t) * 2); ctx.stroke(); break;
      }
      case 'eshel': {
        const a = Math.min(1, m.t / 30), fade = m.life < 60 ? m.life / 60 : 1; ctx.globalAlpha = fade; ctx.scale(a, a);
        limb(ctx, 0, 0, 0, -80, 10, '#7b5230'); limb(ctx, 0, -50, -20, -80, 5, '#7b5230'); limb(ctx, 0, -55, 22, -84, 5, '#7b5230');
        ctx.fillStyle = '#5c8a4a'; for (const [x, y, r] of [[0, -100, 30], [-26, -86, 22], [26, -88, 22], [-12, -118, 18], [14, -116, 18]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(125,255,154,.18)'; ctx.beginPath(); ctx.ellipse(0, -2, 90, 12, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
      }
      case 'golem': {
        ctx.scale(d, 1);
        const act = m.act, at = m.actT;
        let arm = 0.5; if (act === 'punch' || act === 'jab' || act === 'charge') arm = at > 8 ? -0.05 : 1.2; if (act === 'stomp' || act === 'toss') arm = at > 10 ? -1.5 : -1.0;
        const walk = Math.sin(W.t * 0.2) * (Math.abs(m.vx) > 0.5 ? 0.4 : 0);
        const clay = '#9c7a54', dk = '#7a5c3c';
        limb(ctx, -12, -42, -12 + Math.sin(walk) * 12, 0, 18, dk); limb(ctx, 12, -42, 12 - Math.sin(walk) * 12, 0, 18, dk);
        ctx.fillStyle = clay; rr(ctx, -26, -100, 52, 62, 12); ctx.fill(); ctx.strokeStyle = dk; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = clay; ctx.beginPath(); ctx.arc(2, -110, 17, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffdf80'; ctx.fillRect(4, -116, 5, 4); ctx.fillRect(12, -116, 4, 4);
        ctx.fillStyle = '#3b2a1a'; ctx.font = 'bold 13px serif'; ctx.textAlign = 'center'; ctx.save(); ctx.scale(d, 1); ctx.fillText('אמת', 0, -120 + 0); ctx.restore();
        limb(ctx, 18, -90, 18 + Math.cos(arm) * 36, -90 + Math.sin(arm) * 36, 15, clay); ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(18 + Math.cos(arm) * 38, -90 + Math.sin(arm) * 38, 10, 0, TAU); ctx.fill();
        limb(ctx, -18, -90, -24, -58, 14, dk);
        if (m.hp < m.max) { ctx.save(); ctx.scale(d, 1); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-26, -145, 52, 6); ctx.fillStyle = '#8bc34a'; ctx.fillRect(-26, -145, 52 * m.hp / m.max, 6); ctx.restore(); }
        break;
      }
    }
    ctx.restore();
  }

  /* ---------- Fields ---------- */
  function field(ctx, z, W) {
    const fade = Math.min(1, z.life / 40);
    if (z.type === 'snow') {
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(230,248,255,.85)'; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { const x = z.x - z.r + ((i * 37 + W.t * 0.6) % (z.r * 2)); const y = z.y - 70 + ((i * 53 + W.t * 1.3) % 70); ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (z.type === 'sun') {
      const g = ctx.createRadialGradient(z.x, z.y, 10, z.x, z.y, z.r); g.addColorStop(0, `rgba(255,236,120,${0.45 * fade})`); g.addColorStop(1, 'rgba(255,236,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,220,90,${0.6 * fade})`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(z.x, z.y, z.r, W.t * 0.01, W.t * 0.01 + TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,210,60,${fade})`; ctx.beginPath(); ctx.arc(z.x, z.y - z.r + 26, 14, 0, TAU); ctx.fill();
    }
  }

  /* ---------- Effects ---------- */
  function effect(ctx, e, W) {
    const p = e.t / e.life;
    switch (e.type) {
      case 'spark': ctx.fillStyle = e.color; ctx.globalAlpha = 1 - p; ctx.fillRect(e.x - 2, e.y - 2, 4, 4); ctx.globalAlpha = 1; break;
      case 'drop': ctx.fillStyle = 'rgba(120,190,255,' + (1 - p) + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, TAU); ctx.fill(); break;
      case 'text': ctx.save(); ctx.globalAlpha = 1 - p * p; ctx.font = `bold ${e.size}px "Trebuchet MS", sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(e.str, e.x, e.y); ctx.fillStyle = e.color; ctx.fillText(e.str, e.x, e.y); ctx.restore(); break;
      case 'ring': ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + e.t * e.grow, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break;
      case 'hitring': ctx.fillStyle = `rgba(255,255,220,${1 - p})`; star(ctx, e.x, e.y, e.r * (0.6 + p)); break;
      case 'dust': ctx.fillStyle = `rgba(220,210,190,${0.7 * (1 - p)})`; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + s * (6 + e.t * 1.2), e.y - 4 - e.t * 0.3, 5 + e.t * 0.4, 0, TAU); ctx.fill(); } break;
      case 'smoke': ctx.fillStyle = `rgba(240,240,240,${0.5 * (1 - p)})`; ctx.beginPath(); ctx.arc(e.x, e.y, 6 + e.t * 0.6, 0, TAU); ctx.fill(); break;
      case 'flame': flame(ctx, e.x, e.y - e.t, 8 * (1 - p) + 2, e.t); break;
      case 'boom': { const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (0.5 + p)); g.addColorStop(0, `rgba(255,240,180,${1 - p})`); g.addColorStop(0.5, `rgba(255,140,30,${0.8 * (1 - p)})`); g.addColorStop(1, 'rgba(255,80,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.5 + p), 0, TAU); ctx.fill(); break; }
      case 'target': ctx.strokeStyle = `rgba(255,120,40,${0.5 + 0.5 * Math.sin(e.t * 0.6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y, 30, 8, 0, 0, TAU); ctx.stroke(); break;
      case 'raven': { const x = lerp(e.x, e.tx, p), y = lerp(e.y, e.ty, p) - Math.sin(p * Math.PI) * 30; ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(x, y, 10, 5, 0, 0, TAU); ctx.fill(); const w = Math.sin(e.t * 0.8) * 8; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 14, y - w); ctx.lineTo(x + 2, y); ctx.lineTo(x + 12, y - w); ctx.fill(); ctx.fillStyle = '#d4a65a'; ctx.fillRect(x + 8, y - 2, 6, 4); break; }
      case 'zoomline': break;
      case 'ko': {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang + Math.PI);
        const len = 600 * Math.min(1, p * 3);
        const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,255,255,${1 - p})`); g.addColorStop(0.3, hexA(e.color, 0.8 * (1 - p))); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -90 * (1 - p * 0.5)); ctx.lineTo(len, 90 * (1 - p * 0.5)); ctx.closePath(); ctx.fill();
        ctx.restore(); break;
      }
    }
  }

  /* ---------- Finals ---------- */
  function finalFx(ctx, F, W) {
    const t = F.t - 30; if (t < 0) return;
    const f = F.owner, fin = F.fin;
    switch (fin.kind) {
      case 'sweep': {
        const x = F.data.x; if (x === undefined) break;
        for (let i = 0; i < 9; i++) {
          const ox = x - F.dir * (i % 3) * 40, oy = -((i / 3) | 0) * 6;
          ctx.save(); ctx.translate(ox, oy); ctx.scale(F.dir, 1);
          const bob = Math.sin(W.t * 0.4 + i) * 3;
          ctx.fillStyle = 'rgba(30,30,50,.9)'; rr(ctx, -9, -60 + bob, 18, 44, 6); ctx.fill(); ctx.beginPath(); ctx.arc(0, -68 + bob, 9, 0, TAU); ctx.fill();
          limb(ctx, -5, -16, -8 + Math.sin(W.t * 0.5 + i) * 6, 0, 5, 'rgba(30,30,50,.9)'); limb(ctx, 5, -16, 8 - Math.sin(W.t * 0.5 + i) * 6, 0, 5, 'rgba(30,30,50,.9)');
          if (fin.sprite === 'shofars') { ctx.translate(8, -66 + bob); drawWeapon(ctx, 'shofar', 80, -0.3); ctx.strokeStyle = 'rgba(255,240,180,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(40, -10, 14 + (W.t % 10) * 2, -0.8, 0.8); ctx.stroke(); }
          else { ctx.translate(10, -50 + bob); drawWeapon(ctx, i % 2 ? 'torch' : 'spear', 70, -0.6, null, { stateT: W.t }); }
          ctx.restore();
        }
        break;
      }
      case 'flood': {
        const p = Math.min(1, F.data.p * 1.6 || 0);
        const L = W.stage.blast.l * 0.55, R = W.stage.blast.r * 0.55;
        const lx = L + (0 - L) * p, rx = R - R * p;
        ctx.fillStyle = 'rgba(30,110,200,.82)';
        ctx.beginPath(); ctx.moveTo(L - 400, 300); ctx.lineTo(L - 400, -700); ctx.lineTo(lx, -700); for (let y = -700; y <= 300; y += 40) ctx.lineTo(lx + Math.sin(y * 0.03 + W.t * 0.3) * 18, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(R + 400, 300); ctx.lineTo(R + 400, -700); ctx.lineTo(rx, -700); for (let y = -700; y <= 300; y += 40) ctx.lineTo(rx + Math.sin(y * 0.03 + W.t * 0.3) * 18, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(lx + Math.sin(i + W.t * 0.2) * 10, -700 + i * 85, 6, 0, TAU); ctx.arc(rx + Math.sin(i + W.t * 0.2) * 10, -700 + i * 85, 6, 0, TAU); ctx.fill(); }
        break;
      }
      case 'pillars': {
        const p = F.data.p || 0, ang = ease(p) * 1.25;
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(s * 560, 0); ctx.rotate(-s * ang);
          const g = ctx.createLinearGradient(-30, 0, 30, 0); g.addColorStop(0, '#a89068'); g.addColorStop(0.5, '#e8d9b5'); g.addColorStop(1, '#8a7350');
          ctx.fillStyle = g; ctx.fillRect(-32, -620, 64, 620); ctx.fillStyle = '#c9b38a'; ctx.fillRect(-44, -640, 88, 26); ctx.fillRect(-44, -18, 88, 18);
          ctx.strokeStyle = 'rgba(0,0,0,.2)'; for (let i = -20; i <= 20; i += 13) { ctx.beginPath(); ctx.moveTo(i, -614); ctx.lineTo(i, -18); ctx.stroke(); }
          ctx.restore();
        }
        if (p < 1) { ctx.save(); ctx.translate(f.x, f.y - f.h); ctx.strokeStyle = 'rgba(255,240,170,.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 40 + Math.sin(W.t * 0.3) * 6, 0, TAU); ctx.stroke(); ctx.restore(); }
        break;
      }
      case 'giant': {
        const x = F.data.x; if (x === undefined) break;
        ctx.save(); ctx.translate(x, 0); ctx.scale(2.6, 2.6);
        if (fin.sprite === 'golem') { minion(ctx, { type: 'golem', x: 0, y: 0, facing: F.dir, act: (t % 40) > 20 ? 'punch' : null, actT: t % 20 + 9, vx: F.dir * 2, hp: 1, max: 1, t: t }, W); }
        else { // lion
          ctx.scale(F.dir, 1); const s = Math.sin(W.t * 0.4);
          ctx.fillStyle = '#d4a03a'; ctx.beginPath(); ctx.ellipse(0, -40, 46, 22, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#8b4513'; ctx.beginPath(); ctx.arc(42, -56, 26, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e0b04a'; ctx.beginPath(); ctx.arc(46, -54, 16, 0, TAU); ctx.fill();
          ctx.fillStyle = '#000'; ctx.fillRect(50, -60, 3, 3); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(52, -46); ctx.lineTo(64, -48); ctx.lineTo(58, -40); ctx.fill();
          for (const [lx, ph] of [[-30, 0], [-14, 2], [18, 1], [32, 3]]) limb(ctx, lx, -30, lx + Math.sin(W.t * 0.4 + ph) * 10, 0, 9, '#c4902a');
          limb(ctx, -44, -44, -66, -60 + s * 6, 5, '#c4902a'); ctx.fillStyle = '#8b4513'; ctx.beginPath(); ctx.arc(-66, -60 + s * 6, 6, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-40 + i * 16, -6 - ((W.t * 2 + i * 13) % 30), 2, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
        break;
      }
      case 'beam': {
        const p = F.data.p || 0;
        if (fin.sprite === 'megastone') {
          const x = f.x + F.dir * (60 + p * 1600);
          ctx.save(); ctx.translate(x, f.cy); ctx.rotate(W.t * 0.3);
          ctx.fillStyle = '#8f8f8f'; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill(); ctx.fillStyle = '#b5b5b5'; ctx.beginPath(); ctx.arc(-18, -18, 26, 0, TAU); ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(Math.min(f.x, x), f.cy - 40, Math.abs(x - f.x), 80);
        } else {
          const a = Math.sin(Math.min(1, p * 2) * Math.PI) * 0.9;
          const g = ctx.createLinearGradient(0, f.cy - 160, 0, f.cy + 160); g.addColorStop(0, 'rgba(255,250,210,0)'); g.addColorStop(0.5, `rgba(255,250,210,${a})`); g.addColorStop(1, 'rgba(255,250,210,0)');
          ctx.fillStyle = g; ctx.fillRect(F.dir > 0 ? f.x : f.x - 2400, f.cy - 160, 2400, 320);
        }
        break;
      }
    }
  }

  /* ---------- Stage ---------- */
  const decoCache = {};
  function stageBG(ctx, W, vw, vh) {
    const st = W.stage, cam = W.cam, t = W.t;
    const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, st.sky[0]); g.addColorStop(1, st.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    const px = (f) => -cam.x * f * cam.z, py = (f) => -cam.y * f * cam.z * 0.5;
    const hor = vh * 0.62 + py(0.3);
    const hills = (col, base, amp, freq, f, seed = 0) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, vh);
      for (let x = 0; x <= vw + 20; x += 20) { const wx = x - px(f) - vw / 2; ctx.lineTo(x, base + Math.sin(wx * freq + seed) * amp + Math.sin(wx * freq * 2.7 + seed) * amp * 0.35); }
      ctx.lineTo(vw, vh); ctx.closePath(); ctx.fill();
    };
    switch (st.deco) {
      case 'elah':
        sun(ctx, vw * 0.8 + px(0.05), vh * 0.18, 40, '#fff6c4');
        clouds(ctx, vw, vh, t, px(0.08), '#ffffff', 0.8);
        hills(ctx, '#9cc78a', hor - 40, 30, 0.004, 0.15); hills(ctx, '#7fb069', hor + 10, 22, 0.006, 0.25, 2);
        for (let i = 0; i < 7; i++) { const x = ((i * 260 + px(0.25)) % (vw + 300) + vw + 300) % (vw + 300) - 150; terebinth(ctx, x, hor + 20, 0.8); }
        ctx.fillStyle = 'rgba(120,190,230,.6)'; ctx.fillRect(0, hor + 60, vw, 10);
        break;
      case 'sinai': {
        clouds(ctx, vw, vh, t, px(0.05), '#5b4f6b', 1);
        const mx = vw / 2 + px(0.12);
        ctx.fillStyle = '#3d2f45'; ctx.beginPath(); ctx.moveTo(mx - vw * 0.7, vh); ctx.lineTo(mx, hor - vh * 0.42); ctx.lineTo(mx + vw * 0.7, vh); ctx.fill();
        for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(80,70,90,${0.4})`; ctx.beginPath(); ctx.arc(mx + Math.sin(t * 0.01 + i) * 40, hor - vh * 0.45 - i * 30 - (t * 0.3 % 30), 40 + i * 10, 0, TAU); ctx.fill(); }
        flame(ctx, mx, hor - vh * 0.41, 22, t);
        if (W.hazard && W.hazard.t > 50 && W.hazard.t < 80) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, 0, vw, vh); }
        hills(ctx, '#2e2436', hor + 50, 18, 0.006, 0.3);
        break;
      }
      case 'yericho':
        sun(ctx, vw * 0.25 + px(0.05), vh * 0.3, 60, '#ffd27a');
        hills(ctx, '#d9a066', hor, 14, 0.003, 0.15);
        for (let i = 0; i < 9; i++) { const x = ((i * 190 + px(0.3)) % (vw + 200) + vw + 200) % (vw + 200) - 100; palm(ctx, x, hor + 30, 0.9); }
        ctx.fillStyle = '#c9a36b'; ctx.fillRect(0, hor - 30 + py(0.1), vw, 40); for (let x = (px(0.2) % 40 + 40) % 40 - 40; x < vw; x += 40) ctx.fillRect(x, hor - 44 + py(0.1), 22, 16);
        break;
      case 'carmel':
        sun(ctx, vw * 0.7 + px(0.05), hor - 20, 70, '#ffb347');
        ctx.fillStyle = '#2e5e8c'; ctx.fillRect(0, hor + 10, vw, vh);
        ctx.fillStyle = 'rgba(255,200,120,.35)'; for (let i = 0; i < 8; i++) ctx.fillRect(vw * 0.62 + Math.sin(i + t * 0.02) * 20, hor + 20 + i * 12, 120 - i * 10, 3);
        hills(ctx, '#4a3b52', hor + 5, 50, 0.0025, 0.12, 1);
        break;
      case 'michmash':
        clouds(ctx, vw, vh, t, px(0.06), '#ffffff', 0.7);
        hills(ctx, '#c4a57b', hor - 60, 60, 0.003, 0.1, 3); hills(ctx, '#a8865a', hor, 40, 0.005, 0.2, 1);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'center';
        break;
      case 'yamsuf': {
        clouds(ctx, vw, vh, t, px(0.05), '#d6f1ff', 0.6);
        const wl = vw * 0.12 + px(0.2), wr = vw * 0.88 + px(0.2);
        const wall = (x0, x1) => { const gg = ctx.createLinearGradient(x0, 0, x1, 0); gg.addColorStop(0, '#15608f'); gg.addColorStop(1, '#2e8bc0'); ctx.fillStyle = gg; ctx.fillRect(x0, vh * 0.15, x1 - x0, vh); };
        wall(-200, wl); wall(wr, vw + 200);
        ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let y = vh * 0.15; y < vh; y += 26) { ctx.beginPath(); ctx.arc(wl + Math.sin(y * 0.05 + t * 0.1) * 6, y, 6, 0, TAU); ctx.arc(wr + Math.sin(y * 0.05 + t * 0.1) * 6, y, 6, 0, TAU); ctx.fill(); }
        for (let i = 0; i < 6; i++) fish(ctx, ((i * 70 + t * 0.6) % (wl + 180)) - 180, vh * 0.3 + i * 60, i % 2 ? '#f39c12' : '#e74c3c');
        for (let i = 0; i < 6; i++) fish(ctx, wr + ((i * 90 + t * 0.5) % 300), vh * 0.25 + i * 65, i % 2 ? '#f1c40f' : '#1abc9c');
        ctx.fillStyle = '#e4c89a'; ctx.fillRect(wl, hor + 30, wr - wl, vh);
        break;
      }
      case 'prague': {
        ctx.fillStyle = '#f5f3ce'; ctx.beginPath(); ctx.arc(vw * 0.78 + px(0.03), vh * 0.18, 34, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 0.05 + i); ctx.fillRect((i * 97) % vw, (i * 53) % (vh * 0.5), 2, 2); } ctx.globalAlpha = 1;
        const base = hor + 10;
        for (let i = 0; i < 12; i++) { const x = ((i * 150 + px(0.25)) % (vw + 300) + vw + 300) % (vw + 300) - 150, h = 80 + (i * 37) % 70; ctx.fillStyle = '#1b2638'; ctx.fillRect(x, base - h, 110, h + vh); ctx.beginPath(); ctx.moveTo(x - 6, base - h); ctx.lineTo(x + 55, base - h - 50); ctx.lineTo(x + 116, base - h); ctx.fill(); ctx.fillStyle = 'rgba(255,214,120,.7)'; for (let w = 0; w < 3; w++) ctx.fillRect(x + 16 + w * 30, base - h + 25, 10, 14); }
        // Altneuschul gable
        const ax = vw / 2 + px(0.15); ctx.fillStyle = '#2a3446'; ctx.beginPath(); ctx.moveTo(ax - 120, base); ctx.lineTo(ax - 120, base - 120); for (let s = 0; s < 5; s++) { ctx.lineTo(ax - 120 + s * 24, base - 120 - s * 22); ctx.lineTo(ax - 120 + (s + 1) * 24, base - 120 - s * 22); } for (let s = 4; s >= 0; s--) { ctx.lineTo(ax + 120 - s * 24, base - 120 - s * 22); ctx.lineTo(ax + 120 - (s + 1) * 24 + 24, base - 120 - s * 22); } ctx.lineTo(ax + 120, base - 120); ctx.lineTo(ax + 120, base); ctx.fill();
        break;
      }
      case 'midbar': default:
        sun(ctx, vw * 0.5 + px(0.03), vh * 0.2, 50, '#fffbe6');
        // pillar of cloud
        ctx.fillStyle = 'rgba(255,255,255,.45)'; for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(vw * 0.18 + px(0.08) + Math.sin(i + t * 0.02) * 10, hor - i * 34, 30 - i, 0, TAU); ctx.fill(); }
        hills(ctx, '#e8b77d', hor - 10, 26, 0.003, 0.12); hills(ctx, '#d79d5f', hor + 30, 18, 0.005, 0.25, 2);
        break;
    }
  }
  function sun(ctx, x, y, r, col) { const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2); g.addColorStop(0, col); g.addColorStop(0.45, hexA(col, 0.35)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function clouds(ctx, vw, vh, t, off, col, a) { ctx.fillStyle = hexA(col, 0.7 * a); for (let i = 0; i < 6; i++) { const x = ((i * 300 + t * 0.15 + off) % (vw + 400) + vw + 400) % (vw + 400) - 200, y = 60 + (i * 47) % 140; ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.arc(x + 30, y - 12, 36, 0, TAU); ctx.arc(x + 64, y, 28, 0, TAU); ctx.fill(); } }
  function terebinth(ctx, x, y, s) { limb(ctx, x, y, x, y - 50 * s, 8 * s, '#6d4c2f'); ctx.fillStyle = '#4f7c3c'; ctx.beginPath(); ctx.arc(x, y - 66 * s, 30 * s, 0, TAU); ctx.arc(x - 24 * s, y - 52 * s, 20 * s, 0, TAU); ctx.arc(x + 24 * s, y - 54 * s, 22 * s, 0, TAU); ctx.fill(); }
  function palm(ctx, x, y, s) { ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 7 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10 * s, y - 50 * s, x + 4 * s, y - 100 * s); ctx.stroke(); ctx.strokeStyle = '#3e7d3a'; ctx.lineWidth = 5 * s; for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.55; ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 100 * s); ctx.quadraticCurveTo(x + 4 * s + Math.cos(a) * 30 * s, y - 112 * s + Math.sin(a) * 20 * s, x + 4 * s + Math.cos(a) * 52 * s, y - 92 * s + Math.sin(a) * 12 * s); ctx.stroke(); } }
  function fish(ctx, x, y, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 18, y - 6); ctx.lineTo(x - 18, y + 6); ctx.fill(); }

  function stage(ctx, W) {
    const st = W.stage, t = W.t;
    const pal = {
      elah: ['#6aa84f', '#8b6b47', '#6d5236'], sinai: ['#6b5a73', '#4a3d52', '#362c3d'], yericho: ['#d9b77e', '#b08850', '#8c6a3b'], carmel: ['#7d9a5c', '#7b6150', '#5c4738'],
      michmash: ['#c9a97c', '#a68660', '#7d6346'], yamsuf: ['#e4c89a', '#c9a878', '#a88a5c'], prague: ['#7b2d26', '#5c3a2e', '#3e2a22'], midbar: ['#e6b980', '#c79257', '#a67542']
    }[st.deco] || ['#888', '#666', '#444'];
    for (const g of st.ground) {
      const gr = ctx.createLinearGradient(0, g.y, 0, g.y + g.h); gr.addColorStop(0, pal[1]); gr.addColorStop(1, pal[2]);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + g.w, g.y); ctx.lineTo(g.x + g.w - (g.h > 200 ? 0 : 30), g.y + g.h); ctx.lineTo(g.x + (g.h > 200 ? 0 : 30), g.y + g.h); ctx.closePath(); ctx.fill();
      if (g.h <= 200) { ctx.beginPath(); ctx.moveTo(g.x + 30, g.y + g.h); ctx.lineTo(g.x + g.w / 2, g.y + g.h + 120); ctx.lineTo(g.x + g.w - 30, g.y + g.h); ctx.fill(); }
      // top surface
      ctx.fillStyle = pal[0]; ctx.fillRect(g.x, g.y, g.w, 10);
      if (st.deco === 'prague') { ctx.fillStyle = '#5e211c'; for (let x = g.x; x < g.x + g.w; x += 24) for (let y = g.y + 12; y < g.y + 60; y += 14) { ctx.beginPath(); ctx.arc(x + ((y / 14) % 2) * 12 + 12, y, 11, 0, Math.PI); ctx.fill(); } }
      else { ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < g.w / 50; i++) { ctx.beginPath(); ctx.arc(g.x + 20 + i * 50 + (i * 17) % 23, g.y + 30 + (i * 29) % 40, 6 + (i % 3) * 3, 0, TAU); ctx.fill(); } }
      if (st.deco === 'elah' || st.deco === 'carmel') { ctx.fillStyle = '#4f8f3a'; for (let x = g.x; x < g.x + g.w; x += 9) { ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x + 3, g.y - 5 - (x % 3)); ctx.lineTo(x + 6, g.y); ctx.fill(); } }
      if (st.deco === 'sinai') { ctx.strokeStyle = 'rgba(255,140,60,.35)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(g.x + 60 + i * 120, g.y + 20); ctx.lineTo(g.x + 90 + i * 120, g.y + 70); ctx.stroke(); } }
    }
    if (st.deco === 'michmash') { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = 'bold 20px "Frank Ruhl Libre", serif'; ctx.textAlign = 'center'; ctx.fillText('בּוֹצֵץ', st.ground[0].x + st.ground[0].w / 2, st.ground[0].y + 60); ctx.fillText('סֶנֶּה', st.ground[1].x + st.ground[1].w / 2, st.ground[1].y + 60); }
    for (const p of st.plats) {
      if (p.wall) {
        if (W.wallsDown > 0) { ctx.fillStyle = 'rgba(160,120,70,.35)'; for (let i = 0; i < 6; i++) ctx.fillRect(p.x + i * p.w / 6, p.y + 60 + (i % 2) * 10, p.w / 7, 12); continue; }
        ctx.fillStyle = '#c9a36b'; ctx.fillRect(p.x, p.y, p.w, 26); ctx.strokeStyle = '#8c6a3b'; ctx.lineWidth = 1;
        for (let x = p.x; x < p.x + p.w; x += 28) { ctx.strokeRect(x, p.y, 28, 13); ctx.strokeRect(x + 14, p.y + 13, 28, 13); }
        for (let x = p.x; x < p.x + p.w; x += 30) ctx.fillRect(x, p.y - 10, 16, 10);
        if (W.hazard && W.hazard.t < 50 && W.stage.hazard === 'walls') { ctx.fillStyle = `rgba(255,0,0,${0.3 + 0.3 * Math.sin(W.t * 0.5)})`; ctx.fillRect(p.x, p.y, p.w, 26); }
        continue;
      }
      if (p.cloud) { ctx.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(p.x + 18 + i * (p.w - 36) / 4, p.y + 6 + Math.sin(t * 0.05 + i) * 2, 16, 0, TAU); ctx.fill(); } continue; }
      if (p.altar) {
        ctx.fillStyle = '#9a8f80'; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { rr(ctx, p.x + 20 + c * 40, p.y + r * 27, 38, 25, 5); ctx.fill(); ctx.strokeStyle = '#6e6458'; ctx.stroke(); }
        ctx.fillStyle = '#7b5230'; for (let i = 0; i < 4; i++) ctx.fillRect(p.x + 26 + i * 28, p.y - 10, 26, 8);
        if (W.hazard && W.stage.hazard === 'fire' && W.hazard.t < 60) { ctx.fillStyle = `rgba(255,120,30,${0.2 + 0.2 * Math.sin(W.t * 0.4)})`; ctx.fillRect(p.x, p.y - 150, p.w, 150); }
        continue;
      }
      ctx.fillStyle = pal[1]; rr(ctx, p.x, p.y, p.w, 14, 5); ctx.fill(); ctx.fillStyle = pal[0]; rr(ctx, p.x, p.y, p.w, 6, 3); ctx.fill();
    }
    if (st.hazard === 'lightning' && W.hazard) {
      const H = W.hazard;
      if (H.t < 70) { ctx.fillStyle = `rgba(255,255,120,${0.15 + 0.15 * Math.sin(H.t * 0.5)})`; ctx.fillRect(H.x - 40, -1000, 80, 1000); }
      else if (H.t < 82) { ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 6; ctx.beginPath(); let x = H.x; ctx.moveTo(x, -1000); for (let y = -1000; y < 0; y += 60) { x = H.x + (Math.random() - 0.5) * 50; ctx.lineTo(x, y); } ctx.lineTo(H.x, 0); ctx.stroke(); }
    }
  }

  /* ---------- HUD ---------- */
  function hud(ctx, W, vw, vh) {
    const n = W.fighters.length;
    const compact = !!W.touchPad;
    const cw = Math.min(compact ? 150 : 210, (vw - (compact ? 130 : 40)) / n), ch = 74;
    const y0 = compact ? 6 : vh - ch - 10;
    if (compact) { ctx.save(); const sc = 0.72; ctx.translate(vw / 2 * (1 - sc), y0 * (1 - sc)); ctx.scale(sc, sc); }
    W.fighters.forEach((f, i) => {
      const x0 = vw / 2 - (cw * n) / 2 + i * cw + 6;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(ctx, x0, y0, cw - 12, ch, 12); ctx.fill();
      ctx.fillStyle = f.color; rr(ctx, x0, y0, 8, ch, 4); ctx.fill();
      // portrait
      ctx.save(); ctx.beginPath(); ctx.arc(x0 + 36, y0 + 34, 24, 0, TAU); ctx.fillStyle = shade(f.hero.color, -30); ctx.fill(); ctx.clip(); portrait(ctx, f.hero, x0 + 36, y0 + 36, 34); ctx.restore();
      if (f.finalReady) { ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x0 + 36, y0 + 34, 26 + Math.sin(W.t * 0.2) * 2, 0, TAU); ctx.stroke(); }
      // damage
      const dmg = Math.floor(f.damage);
      const red = Math.min(1, f.damage / 160);
      ctx.font = `bold ${cw > 170 ? 34 : 26}px "Trebuchet MS", sans-serif`; ctx.textAlign = 'right';
      const col = `rgb(255,${Math.round(255 - red * 200)},${Math.round(255 - red * 230)})`;
      const shake = f.damageShake > 0 ? (Math.random() - 0.5) * 6 : 0;
      ctx.lineWidth = 4; ctx.strokeStyle = '#000';
      let label = f.isBoss ? Math.max(0, Math.ceil(f.hp)) + ' HP' : (f.dead && f.stocks <= 0 ? '—' : dmg + '%');
      ctx.strokeText(label, x0 + cw - 22 + shake, y0 + 44 + shake); ctx.fillStyle = f.isBoss ? '#ff8080' : col; ctx.fillText(label, x0 + cw - 22 + shake, y0 + 44 + shake);
      ctx.font = 'bold 11px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      let nm = f.hero.name.toUpperCase(); const maxW = cw - 84; while (nm.length > 3 && ctx.measureText(nm).width > maxW) nm = nm.slice(0, -1); ctx.fillText(nm, x0 + 66, y0 + 16);
      // stocks
      if (W.cfg.mode !== 'training' && !f.isBoss) {
        if (f.stocks <= 5) for (let s = 0; s < f.stocks; s++) { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x0 + 70 + s * 13, y0 + 62, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillText('● x' + f.stocks, x0 + 66, y0 + 66); }
      }
      if (W.cfg.time) { ctx.fillStyle = '#ddd'; ctx.fillText((f.score >= 0 ? '+' : '') + f.score, x0 + cw - 50, y0 + 66); }
      if (f.held) { itemIcon(ctx, f.held.kind, x0 + cw - 34, y0 + 62, 0.45, W.t); }
      if (f.isBoss) { ctx.fillStyle = '#400'; ctx.fillRect(x0 + 66, y0 + 56, cw - 90, 8); ctx.fillStyle = '#e74c3c'; ctx.fillRect(x0 + 66, y0 + 56, (cw - 90) * Math.max(0, f.hp) / f.hero.hp, 8); }
      ctx.restore();
    });
    if (compact) ctx.restore();
    // timer
    if (W.cfg.time) {
      const s = Math.max(0, Math.ceil(W.timeLeft / 60));
      ctx.save(); ctx.font = 'bold 30px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.fillStyle = s <= 10 ? '#ff6b6b' : '#fff';
      const str = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); const ty = compact ? 100 : 40; ctx.strokeText(str, vw / 2, ty); ctx.fillText(str, vw / 2, ty); ctx.restore();
    }
    // countdown
    if (W.countdown > 0) {
      const n2 = Math.ceil(W.countdown / 60);
      bigText(ctx, vw, vh, n2 === 0 ? '' : String(n2), '#fff', 120, 1 - (W.countdown % 60) / 60);
    } else if (W.t < 240 && W.t > 0 && W.cfg.mode !== 'training') {
      const age = W.t - 180; if (age >= 0 && age < 50) bigText(ctx, vw, vh, 'GO!', '#ffe680', 140, age / 50);
    }
    // final banner
    if (W.finalBanner) {
      const b = W.finalBanner, a = Math.min(1, b.t / 10) * (b.t > 55 ? 1 - (b.t - 55) / 15 : 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, vh * 0.32, vw, vh * 0.3);
      ctx.fillStyle = b.hero.color; ctx.fillRect(0, vh * 0.32, vw, 5); ctx.fillRect(0, vh * 0.62 - 5, vw, 5);
      portrait(ctx, b.hero, vw * 0.22 - (1 - Math.min(1, b.t / 12)) * 300, vh * 0.47, vh * 0.26, true);
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffe680'; ctx.font = `bold ${Math.round(vh * 0.065)}px "Frank Ruhl Libre", serif`;
      ctx.fillText(b.he, vw * 0.58, vh * 0.45);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(vh * 0.05)}px "Trebuchet MS", sans-serif`; ctx.fillText(b.name.toUpperCase(), vw * 0.58, vh * 0.54);
      ctx.restore();
    }
    if (W.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${W.flash / 20})`; ctx.fillRect(0, 0, vw, vh); }
  }
  function bigText(ctx, vw, vh, str, col, size, p) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const s = size * (1 + (1 - p) * 0.4) * Math.min(1, vw / 900);
    ctx.font = `900 ${s}px "Trebuchet MS", sans-serif`; ctx.globalAlpha = Math.max(0, Math.min(1, 1.5 - p));
    ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(str, vw / 2, vh * 0.42); ctx.fillStyle = col; ctx.fillText(str, vw / 2, vh * 0.42);
    ctx.restore();
  }

  /* ---------- Offscreen indicators ---------- */
  function offscreen(ctx, W, vw, vh, toScreen) {
    for (const f of W.fighters) {
      if (f.dead) continue;
      const [sx, sy] = toScreen(f.x, f.y - f.h / 2);
      if (sx > -10 && sx < vw + 10 && sy > -10 && sy < vh + 10) continue;
      const cx = Math.max(40, Math.min(vw - 40, sx)), cy = Math.max(40, Math.min(vh - 120, sy));
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, TAU); ctx.fill(); ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, TAU); ctx.clip(); portrait(ctx, f.hero, cx, cy + 2, 30); ctx.restore();
      const a = Math.atan2(sy - cy, sx - cx); ctx.fillStyle = f.color; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); ctx.lineTo(cx + Math.cos(a + 0.4) * 30, cy + Math.sin(a + 0.4) * 30); ctx.lineTo(cx + Math.cos(a - 0.4) * 30, cy + Math.sin(a - 0.4) * 30); ctx.fill();
    }
  }

  return { fighter, portrait, item, itemIcon, proj, minion, field, effect, finalFx, stageBG, stage, hud, offscreen, shade, rr, star, magen, flame, drawWeapon };
})();
