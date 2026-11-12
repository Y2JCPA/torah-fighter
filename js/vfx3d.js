/* Torah Fighter — 3D spectacle layer (loaded after render3d.js, driven by small hooks inside it).
   Everything here is stateless per frame where possible: each engine effect {type, x, y, t, life, ...} is
   re-drawn from its own age, so hit-freeze and slow motion come for free and nothing is allocated in the hot path.
   Draws with (a) the renderer's point-sprite systems P.* and (b) one batched, additive, oriented-quad mesh (Q)
   for streaks, rings, flares and beams. World coords in: x right, y DOWN (engine space). */
'use strict';

const VFX3D = (() => {
  let T = null, P = null, Q = null, QA = null, QN = null, light = null, ready = false; // Q = batch being written (QA additive / QN alpha-blended, keeps colour on bright skies)
  const TAU = Math.PI * 2, PI = Math.PI;
  const STREAK = 0, RING = 1, GLOW = 2, FLARE = 3, COMET = 4, BEAM = 5;
  // uv rects in the 4x2 atlas of 128px cells (canvas row 0 is the top => v 0.5..1); COMET is the right half of the streak cell
  const cellUV = (c, r, u0 = 0, u1 = 1) => [(c + u0) / 4 + 0.002, 1 - (r + 1) / 2 + 0.004, (c + u1) / 4 - 0.002, 1 - r / 2 - 0.004];
  const CELL = [cellUV(0, 0), cellUV(1, 0), cellUV(0, 1), cellUV(1, 1), cellUV(0, 0, 0.5, 1), cellUV(2, 0)];
  const S = { q: 2, W: null, kick: 0, finalK: 0, flashK: 0, seenImpact: false, seenKo: false, seenTrail: false, seenJump: false, cx: 0, cy: -150, hw: 700, hh: 400, deco: 'elah', sky: null, lt0: -99, lpow: 0 };
  const DUST = { elah: '#d9cdb0', sinai: '#b9a8b0', yericho: '#e2c9a0', carmel: '#cdbfa6', michmash: '#d8c6a4', yamsuf: '#e8f6ff', prague: '#b4b9c8', midbar: '#ecd3a2' };
  let dustCol = '#ddd2be';

  /* ---------- colour cache (no parsing in the hot path) ---------- */
  const colCache = new Map(); let tmpC = null;
  function rgb(c) {
    let v = colCache.get(c);
    if (!v) { if (colCache.size > 400) colCache.clear(); try { tmpC.set(c); } catch (e) { tmpC.set('#ffffff'); } v = [tmpC.r, tmpC.g, tmpC.b]; colCache.set(c, v); }
    return v;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const fr = (v) => v - Math.floor(v);
  // stable per-effect pseudo random: r(e, i) in 0..1
  function seed(e) { return e._s || (e._s = 1 + Math.random() * 997); }
  function r(e, i) { return fr(Math.sin(e._s * 12.9898 + i * 78.233) * 43758.5453); }
  function h1(i) { return fr(Math.sin(i * 127.1 + 3.7) * 43758.5453); }

  /* ---------- batched oriented quads ---------- */
  function Quads(tex, max, additive) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(max * 12), uv = new Float32Array(max * 8), col = new Float32Array(max * 16), idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) { const o = i * 6, v = i * 4; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3; }
    geo.setIndex(new T.BufferAttribute(idx, 1));
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setAttribute('qcol', new T.BufferAttribute(col, 4));
    const mat = new T.ShaderMaterial({
      uniforms: { tex: { value: tex } },
      vertexShader: 'attribute vec4 qcol; varying vec4 vC; varying vec2 vUv; void main(){ vC = qcol; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tex; varying vec4 vC; varying vec2 vUv; void main(){ float a = texture2D(tex, vUv).a * vC.a; if (a < 0.004) discard; gl_FragColor = vec4(vC.rgb, a);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }',
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, side: T.DoubleSide
    });
    const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = additive ? 6 : 5.5;
    return {
      mesh, n: 0,
      // centre c, half axes u and v, atlas cell, colour string, alpha, hdr gain
      put(cx, cy, cz, ux, uy, uz, vx, vy, vz, cell, color, a, k) {
        if (this.n >= max || !(a > 0.004)) return; const i = this.n++, p = i * 12, t = i * 8, c = i * 16, C = rgb(color), R = CELL[cell];
        pos[p] = cx - ux - vx; pos[p + 1] = cy - uy - vy; pos[p + 2] = cz - uz - vz;
        pos[p + 3] = cx + ux - vx; pos[p + 4] = cy + uy - vy; pos[p + 5] = cz + uz - vz;
        pos[p + 6] = cx - ux + vx; pos[p + 7] = cy - uy + vy; pos[p + 8] = cz - uz + vz;
        pos[p + 9] = cx + ux + vx; pos[p + 10] = cy + uy + vy; pos[p + 11] = cz + uz + vz;
        uv[t] = R[0]; uv[t + 1] = R[1]; uv[t + 2] = R[2]; uv[t + 3] = R[1]; uv[t + 4] = R[0]; uv[t + 5] = R[3]; uv[t + 6] = R[2]; uv[t + 7] = R[3];
        const kr = C[0] * k, kg = C[1] * k, kb = C[2] * k;
        for (let j = 0; j < 4; j++) { col[c + j * 4] = kr; col[c + j * 4 + 1] = kg; col[c + j * 4 + 2] = kb; col[c + j * 4 + 3] = a; }
      },
      commit() { geo.setDrawRange(0, this.n * 6); geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.attributes.qcol.needsUpdate = true; },
      reset() { this.n = 0; }
    };
  }
  function makeAtlas(canvasTex) {
    const tex = canvasTex(512, 256, (x) => {
      const needle = (cx, cy, len, thick, a) => { x.save(); x.translate(cx, cy); x.scale(1, thick / len); const g = x.createRadialGradient(0, 0, 0, 0, 0, len); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, `rgba(255,255,255,${a * 0.55})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, len, 0, TAU); x.fill(); x.restore(); };
      // 0: streak (soft needle, tapered both ends)
      needle(64, 64, 60, 30, 0.9); needle(64, 64, 58, 11, 1);
      // 1: ring
      x.save(); x.translate(128, 0); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 15; x.beginPath(); x.arc(64, 64, 48, 0, TAU); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 48, 0, TAU); x.stroke(); x.restore();
      // 2: glow
      { const g = x.createRadialGradient(64, 192, 0, 64, 192, 60); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.6)'); g.addColorStop(0.6, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 128, 128, 128); }
      // 3: flare (four-point star + core)
      needle(192, 192, 60, 7, 1); x.save(); x.translate(192, 192); x.rotate(PI / 2); x.translate(-192, -192); needle(192, 192, 60, 7, 1); x.restore();
      { const g = x.createRadialGradient(192, 192, 0, 192, 192, 22); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(160, 160, 64, 64); }
      // 5: beam (flat-topped bar, hard-ish edges, fades out along its length)
      { const g = x.createLinearGradient(0, 4, 0, 124); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.2, 'rgba(255,255,255,.25)'); g.addColorStop(0.36, 'rgba(255,255,255,1)'); g.addColorStop(0.64, 'rgba(255,255,255,1)'); g.addColorStop(0.8, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(258, 4, 124, 120);
        x.globalCompositeOperation = 'destination-out'; const f = x.createLinearGradient(258, 0, 382, 0); f.addColorStop(0, 'rgba(0,0,0,.6)'); f.addColorStop(0.06, 'rgba(0,0,0,0)'); f.addColorStop(0.6, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = f; x.fillRect(256, 0, 128, 128); x.globalCompositeOperation = 'source-over'; }
    });
    tex.generateMipmaps = false; tex.minFilter = T.LinearFilter; tex.magFilter = T.LinearFilter;
    return tex;
  }

  /* ---------- draw helpers (engine coords: y down, angles in screen space) ---------- */
  // needle starting at (x, y) reaching `len` along ang
  function streak(x, y, z, ang, len, wid, color, a, k = 1, cell = STREAK) {
    const c = Math.cos(ang), s = Math.sin(ang), hl = len * 0.5, hw = wid * 0.5;
    Q.put(x + c * hl, -(y + s * hl), z, c * hl, -s * hl, 0, s * hw, c * hw, 0, cell, color, a, k);
  }
  // ellipse-ish billboard in the fighting plane: half sizes rx (along rot) and ry
  function disc(x, y, z, rx, ry, rot, cell, color, a, k = 1) {
    const c = Math.cos(rot), s = Math.sin(rot);
    Q.put(x, -y, z, c * rx, -s * rx, 0, s * ry, c * ry, 0, cell, color, a, k);
  }
  // lying flat on the ground (XZ plane)
  function flat(x, y, z, rx, rz, cell, color, a, k = 1) { Q.put(x, -y + 3, z + 24, rx, 0, 0, 0, rx * 0.26, 0, cell, color, a, k); } // drawn as a squashed billboard: a true ground-plane quad is edge-on to this camera
  function glow(x, y, z, rad, color, a, k = 1) { Q.put(x, -y, z, rad, 0, 0, 0, rad, 0, GLOW, color, a, k); }
  function flash(x, y, color, pow, W) { if (pow >= S.lpow * 0.8 || W.t - S.lt0 > 6) { S.lt0 = W.t; S.lpow = pow; light.position.set(x, -y, 130); const C = rgb(color); light.color.setRGB(0.5 + C[0] * 0.5, 0.5 + C[1] * 0.5, 0.5 + C[2] * 0.5); } }

  /* ---------- own (renderer-spawned) effects, pooled ---------- */
  const own = [], pool = [];
  function spawn(type, x, y, life, color, W) { const e = pool.pop() || {}; e.type = type; e.x = x; e.y = y; e.t0 = W.t; e.t = 0; e.life = life; e.color = color; e._s = 0; own.push(e); return e; }

  /* ---------- individual effects ---------- */
  function fxImpact(e, W, pw, ang, col) {
    const t = e.t, p = clamp(t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q * q, x = e.x, y = e.y, Sz = 0.7 + pw * 1.1;
    if (t <= 2) flash(x, y, col, pw, W);
    S.kick = Math.max(S.kick, pw * clamp(1 - t / 9, 0, 1));
    if (t < 6) glow(x, y, 46, 34 * Sz * (1 - t / 7), '#ffffff', 0.8, 1.8);
    glow(x, y, 44, (40 + 50 * eo) * Sz, col, 0.35 * q * q, 1.3);
    const fs = (55 + 120 * pw) * (0.7 + eo * 0.8);
    disc(x, y, 47, fs * 1.35, fs * 0.42, ang, FLARE, '#ffffff', q * q * 0.7, 1.8);
    // directional spikes: most fly with the victim, a few splash back
    const n = 6 + ((pw * 9) | 0);
    for (let i = 0; i < n; i++) {
      const fwd = i < n * 0.65, a = fwd ? ang + (r(e, i) - 0.5) * 1.15 : ang + PI + (r(e, i) - 0.5) * 2.6, sf = fwd ? 1 : 0.5;
      const r0 = 12 + 135 * eo * Sz * sf * (0.5 + 0.9 * r(e, i + 40)), len = (38 + 95 * r(e, i + 80)) * Sz * sf * (0.25 + 0.75 * q), w = (3 + 5 * pw) * q + 1.2;
      const sx = x + Math.cos(a) * r0, sy = y + Math.sin(a) * r0;
      Q = QN; streak(sx, sy, 45, a, len, w * 2.6, col, q, 1); Q = QA; streak(sx, sy, 45.5, a, len * 0.9, w * 0.8, '#ffffff', q * 0.9, 2);
    }
    // shock ring, squashed along the launch direction so it reads as a disc the victim punched through
    const R = 16 + (70 + 95 * pw) * eo;
    Q = QN; disc(x, y, 43, R * 0.5, R, ang, RING, col, q * 0.95, 1); Q = QA; disc(x, y, 43.2, R * 0.5, R, ang, RING, col, q * 0.5, 1.5);
    if (pw > 0.6) { const p2 = clamp((t - 3) / (e.life - 3), 0, 1), e2 = 1 - (1 - p2) * (1 - p2); if (t >= 3) disc(x, y, 42, (40 + 260 * e2) * 0.55, 40 + 260 * e2, ang, RING, '#ffffff', (1 - p2) * 0.5, 1.5); disc(x, y, 47.5, fs * 2.2, fs * 0.3, ang + PI / 2, FLARE, col, q * q * 0.7, 1.5); }
    // shards
    const m = 4 + ((pw * 9) | 0);
    for (let i = 0; i < m; i++) {
      const a = ang + (r(e, i + 120) - 0.5) * 1.7, v = (4 + 9 * r(e, i + 160)) * Sz, d = v * t * (1 - p * 0.45);
      P.star.add(x + Math.cos(a) * d, -(y + Math.sin(a) * d + 0.16 * t * t), 48, i % 2 ? col : '#fffbe0', (9 + 11 * r(e, i + 200)) * q + 3, q);
    }
  }
  function victimOf(e, W) { // old-style 'hitring' carries no direction/colour: recover them from the fighter it was spawned on
    let best = null, bd = 60;
    for (const f of W.fighters) { if (f.dead) continue; const d = Math.abs(f.x - e.x) + Math.abs(f.y - f.h / 2 - e.y); if (d < bd) { bd = d; best = f; } }
    return best;
  }
  function fxHitring(e, W) {
    if (S.seenImpact) { const p = e.t / e.life; P.star.add(e.x, -e.y, 40, '#fffbd8', e.r * (0.6 + p) * 2.2, (1 - p) * 0.7); return; }
    if (e._pw === undefined) { // spawn a full-length impact burst of our own (hitring itself only lives 10 frames)
      const f = victimOf(e, W); let pw = e.r >= 30 ? 0.62 : 0.28, ang = -PI / 2, col = '#fff3b0';
      if (f) { const sp = Math.hypot(f.lvx || 0, f.lvy || 0); if (sp > 0.5) ang = Math.atan2(f.lvy, f.lvx); const kb = (f.hitstun || 0) / 0.42; if (kb > 0) pw = clamp(kb / 230, 0.15, 1); if (f.lastHitBy && f.lastHitBy.color) col = f.lastHitBy.color; }
      e._pw = pw; const o = spawn('impactx', e.x, e.y, 14 + pw * 8, col, W); o.power = pw; o.ang = ang;
    }
  }
  function fxKo(e, W) {
    if (e._d === undefined) { // beam points from the blast zone back toward the action; start it at the screen edge so it is always seen
      e._d = Math.atan2(S.cy - e.y, S.cx - e.x);
      e._ex = clamp(e.x, S.cx - S.hw - 60, S.cx + S.hw + 60); e._ey = clamp(e.y, S.cy - S.hh - 60, S.cy + S.hh + 60);
    }
    const t = e.t, p = clamp(t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q * q, d = e._d, x = e._ex, y = e._ey, col = e.color || '#ffffff';
    const grow = clamp(t / 5, 0, 1), L = 2400 * grow, wob = 1 + 0.12 * Math.sin(t * 1.7), w = 150 * Math.pow(q, 1.4) * wob;
    if (t <= 2) flash(x + Math.cos(d) * 200, y + Math.sin(d) * 200, col, 1, W);
    S.kick = Math.max(S.kick, clamp(1 - t / 14, 0, 1));
    const bx = x - Math.cos(d) * 300, by = y - Math.sin(d) * 300;
    streak(bx, by, 60, d, L, w * 2.4, col, 0.3 * q, 1);
    Q = QN; streak(bx, by, 61, d, L, w * 1.9, col, 0.92 * Math.min(1, q * 2), 1, BEAM); Q = QA;
    streak(bx, by, 62, d, L, w * 0.38, '#ffffff', q, 2.4, BEAM);
    for (let i = 0; i < 9; i++) { const a = d + (r(e, i) - 0.5) * 1.1, len = L * (0.25 + 0.5 * r(e, i + 20)), ww = (16 + 34 * r(e, i + 40)) * q; if (i % 3) { Q = QN; streak(bx, by, 59, a, len, ww * 1.6, col, q * 0.8, 1); Q = QA; } else streak(bx, by, 59, a, len, ww, '#ffffff', q * 0.7, 1.5); }
    for (let i = 0; i < 4; i++) { const dist = 60 + (150 + i * 190) * eo, R = (110 + i * 55) * (0.4 + eo); if (i % 2) disc(x + Math.cos(d) * dist, y + Math.sin(d) * dist, 58, R * 0.28, R, d, RING, '#ffffff', q * 0.9, 2); else { Q = QN; disc(x + Math.cos(d) * dist, y + Math.sin(d) * dist, 58, R * 0.28, R, d, RING, col, q, 1); Q = QA; } }
    glow(x, y, 57, 260 * (0.5 + eo * 0.6), col, 0.35 * q, 1.3); if (t < 8) glow(x, y, 63, 220 * (1 - t / 9), '#ffffff', 0.8, 2.2);
    const n = S.q >= 2 ? 44 : S.q === 1 ? 28 : 16;
    for (let i = 0; i < n; i++) {
      const a = d + (r(e, i + 60) - 0.5) * 1.25, v = 12 + 30 * r(e, i + 100), dist = v * t * (1 - p * 0.55), tw = 0.55 + 0.45 * Math.sin(t * 0.9 + i * 2.1);
      const c = i % 4 === 0 ? '#ffffff' : i % 4 === 1 ? '#ffe680' : i % 4 === 2 ? col : '#8fe3ff';
      (i % 3 ? P.star : P.dot).add(x + Math.cos(a) * dist, -(y + Math.sin(a) * dist + 0.1 * t * t), 55 + (i % 5) * 4, c, (12 + 16 * r(e, i + 140)) * (0.4 + 0.6 * q), q * tw);
    }
  }
  function fxShock(e) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q * q, R = (e.r || 120), x = e.x, y = e.y;
    flat(x, y, 0, 20 + R * eo, (20 + R * eo) * 0.55, RING, '#ffffff', q * 0.9, 1.8);
    flat(x, y, 0, 10 + R * eo * 0.6, (10 + R * eo * 0.6) * 0.55, RING, dustCol, q * 0.7, 1.4);
    if (e.t < 6) glow(x, y - 6, 20, R * 0.5 * (1 - e.t / 7), '#ffffff', 0.8, 2);
    seed(e);
    for (let i = 0; i < 12; i++) { const s = i % 2 ? 1 : -1, d = R * eo * (0.45 + 0.6 * r(e, i)); P.smoke.add(x + s * d, -(y - 12 - 34 * eo * r(e, i + 20)), 10 + r(e, i + 40) * 90, dustCol, (30 + 34 * r(e, i + 60)) * (0.6 + p), 0.75 * q); }
    for (let i = 0; i < 9; i++) { const vx = (r(e, i + 80) - 0.5) * 14, vy = -(5 + 9 * r(e, i + 100)), t = e.t; P.norm.add(x + vx * t, -(y + vy * t + 0.3 * t * t), (r(e, i + 90) - 0.5) * 80, '#6e5a44', 5 + 4 * r(e, i + 110), q); }
  }
  function fxJumpRing(e, x, y, col) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q;
    flat(x, y, 0, 16 + 46 * eo, (16 + 46 * eo) * 0.5, RING, col, q, 1.8);
    flat(x, y + 8 * eo, 0, 10 + 26 * eo, (10 + 26 * eo) * 0.5, RING, '#ffffff', q * 0.7, 1.6);
    glow(x, y, 5, 40 * q, col, 0.5 * q, 1.5);
    for (let i = 0; i < 4; i++) streak(x + (i - 1.5) * 13, y + 4 + 18 * eo, 8, PI / 2, 38 * q + 6, 5, '#ffffff', 0.7 * q, 1.5);
  }
  function fxDust(e, pw, up) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q, x = e.x, y = e.y; seed(e);
    const n = 4 + ((pw * 6) | 0);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1, d = 6 + (18 + 62 * pw * (0.4 + 0.6 * r(e, i))) * eo; P.smoke.add(x + s * d, -(y - 10 - (4 + 18 * pw) * eo * r(e, i + 20)), 12 + r(e, i + 40) * 60, dustCol, (18 + 18 * pw + 10 * r(e, i + 60)) * (0.7 + 0.9 * p), 0.8 * q); }
    if (pw > 0.45) flat(x, y, 0, 14 + 70 * pw * eo, (14 + 70 * pw * eo) * 0.45, RING, '#ffffff', q * 0.5 * pw, 1.3);
    if (up) for (let i = 0; i < 3; i++) streak(x + (i - 1) * 12, y, 6, -PI / 2, (26 + 30 * eo) * q + 4, 4.5, '#ffffff', 0.55 * q, 1.4);
  }
  function fxDash(e) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q, dir = e.dir < 0 ? -1 : 1, x = e.x, y = e.y; seed(e);
    for (let i = 0; i < 6; i++) streak(x - dir * (8 + 50 * eo * r(e, i)), y - 8 - 62 * r(e, i + 10), 12, dir > 0 ? PI : 0, (50 + 80 * r(e, i + 20)) * (0.3 + 0.7 * q), 5, '#ffffff', 0.75 * q, 1.6);
    disc(x - dir * (6 + 26 * eo), y - 38, 10, 9 + 10 * eo, 30 + 34 * eo, 0, RING, '#ffffff', 0.75 * q, 1.6);
    for (let i = 0; i < 4; i++) P.smoke.add(x - dir * (10 + 50 * eo * r(e, i + 30)), -(y - 10 - 12 * r(e, i + 40) * eo), 12 + r(e, i + 50) * 50, dustCol, 20 + 20 * p, 0.75 * q);
  }
  function fxShieldHit(e) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q, col = e.color || '#9cd8ff'; seed(e);
    disc(e.x, e.y, 40, 34 + 36 * eo, 34 + 36 * eo, 0, RING, col, q, 2); disc(e.x, e.y, 41, 60 * q + 20, 60 * q + 20, e._s, FLARE, '#ffffff', q * q, 2.2);
    for (let i = 0; i < 6; i++) { const a = r(e, i) * TAU, d = 30 + 60 * eo * r(e, i + 10); P.dot.add(e.x + Math.cos(a) * d, -(e.y + Math.sin(a) * d), 42, col, 9 * q + 2, q); }
  }
  function fxBoom(e, W) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q * q, R = e.r || 60, x = e.x, y = e.y; seed(e);
    if (e.t <= 2) flash(x, y, '#ff9a3a', 0.9, W);
    S.kick = Math.max(S.kick, 0.6 * clamp(1 - e.t / 9, 0, 1));
    if (e.t < 7) glow(x, y, 46, R * 1.0 * (1 - e.t / 8), '#fff2c0', 0.9, 2);
    glow(x, y, 44, R * (1.3 + eo), '#ff6a10', 0.45 * q, 1.3);
    disc(x, y, 43, R * (0.6 + 1.9 * eo), R * (0.6 + 1.9 * eo), 0, RING, '#ffd27a', q, 2);
    disc(x, y, 47, R * 2.6 * (0.5 + eo * 0.5), R * 0.9, 0, FLARE, '#fff2c8', q * q * 0.8, 2);
    for (let i = 0; i < 10; i++) { const a = r(e, i) * TAU, d = R * (0.3 + 1.5 * eo * (0.4 + 0.6 * r(e, i + 10))); streak(x + Math.cos(a) * d * 0.5, y + Math.sin(a) * d * 0.5, 45, a, d * 0.8 * (0.3 + 0.7 * q), 10 * q + 2, i % 2 ? '#ffb04a' : '#ffffff', q, 2); P.flame.add(x + Math.cos(a) * d * 0.7, -(y + Math.sin(a) * d * 0.7), 42, '#ffffff', R * (0.9 + 0.5 * r(e, i + 20)) * (0.5 + q), q); }
    for (let i = 0; i < 6; i++) { const a = r(e, i + 30) * TAU, d = R * (0.4 + 1.1 * eo); P.smoke.add(x + Math.cos(a) * d, -(y + Math.sin(a) * d - 30 * p), 20, '#3a3230', R * (0.5 + 0.9 * p), 0.5 * p * q * 4 * 0.5); }
  }
  function fxBurst(e) { // small burst where a projectile ended
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p, eo = 1 - q * q, col = e.color; seed(e);
    disc(e.x, e.y, 40, 40 * q + 16, 40 * q + 16, e._s, FLARE, '#ffffff', q * q, 2.2);
    disc(e.x, e.y, 39, 10 + 34 * eo, 10 + 34 * eo, 0, RING, col, q * 0.9, 1.8);
    for (let i = 0; i < 6; i++) { const a = r(e, i) * TAU, d = 8 + 44 * eo * (0.4 + 0.6 * r(e, i + 10)); streak(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 41, a, 26 * q + 4, 4, col, q, 1.8); }
  }
  function fxTrail(e, pw, col) {
    const p = clamp(e.t / e.life, 0, 1), q = 1 - p; seed(e);
    const ox = (r(e, 1) - 0.5) * 14, oy = (r(e, 2) - 0.5) * 14 - p * 10;
    const sz = (24 + 34 * pw) * (0.7 + 1.5 * p);
    P.smoke.add(e.x - ox, -(e.y - oy + sz * 0.22), -12, '#8f8a9c', sz * 1.05, 0.5 * q);
    P.smoke.add(e.x + ox, -(e.y + oy), -8, '#fbfaf6', sz, 0.8 * q);
    if (p < 0.5) { Q = QN; glow(e.x, e.y, -6, (34 + 50 * pw) * (1 - p * 2) + 6, col, 0.8 * (1 - p * 2), 1); Q = QA; P.dot.add(e.x + ox * 2, -(e.y + oy * 2), 14, col, 10 * (1 - p * 2) + 2, 1 - p * 2); }
  }

  /* ---------- per-effect dispatch: returns true when handled (false => renderer falls back to its plain look) ---------- */
  function effect(e, W) {
    if (!ready) return false;
    const p = e.t / e.life, x = e.x, y = e.y;
    switch (e.type) {
      case 'impact': S.seenImpact = true; seed(e); fxImpact(e, W, clamp(+e.power || 0.4, 0.05, 1), +e.ang || 0, e.color || '#fff3b0'); return true;
      case 'hitring': fxHitring(e, W); return true;
      case 'impactx': seed(e); fxImpact(e, W, e.power, e.ang, e.color); return true;
      case 'launchtrail': S.seenTrail = true; fxTrail(e, clamp(+e.power || 0.5, 0, 1), e.color || '#ffffff'); return true;
      case 'smoke': if (S.seenTrail) { P.smoke.add(x, -y, 10, '#f0f0f0', 14 + e.t * 1.2, 0.5 * (1 - p)); } else fxTrail(e, 0.45, '#fff3d0'); return true;
      case 'shock': fxShock(e); return true;
      case 'jumpring': S.seenJump = true; fxJumpRing(e, x, y, e.color || '#bfe9ff'); return true;
      case 'jumpdust': seed(e); fxDust(e, 0.45, true); return true;
      case 'landdust': fxDust(e, clamp(+e.power || 0.5, 0.1, 1), false); return true;
      case 'dust': fxDust(e, 0.3, false); return true;
      case 'dashburst': fxDash(e); return true;
      case 'shieldhit': fxShieldHit(e); return true;
      case 'koblast': S.seenKo = true; seed(e); fxKo(e, W); return true;
      case 'ko': if (!S.seenKo) { seed(e); fxKo(e, W); } return true;
      case 'boom': fxBoom(e, W); return true;
      case 'pburst': fxBurst(e); return true;
      case 'ring': {
        if (!S.seenJump && e.grow === 2 && e.r === 6 && e.color === '#fff') { fxJumpRing(e, x, y, '#bfe9ff'); return true; } // today's double-jump puff
        const R = (e.r + e.t * e.grow) * 1.15; disc(x, y, 30, R, R, 0, RING, e.color || '#ffffff', 1 - p, 1.8); glow(x, y, 29, R * 1.2, e.color || '#ffffff', 0.22 * (1 - p), 1.2); return true;
      }
      case 'spark': {
        const q = 1 - p; P.dot.add(x, -y, 30, e.color, 9, q);
        if (e.vx !== undefined) { const sp = Math.hypot(e.vx, e.vy); if (sp > 1.5) streak(x, y, 30, Math.atan2(-e.vy, -e.vx), Math.min(60, sp * 4.5), 4, e.color || '#ffffff', q, 1.7, COMET); }
        return true;
      }
      case 'drop': P.norm.add(x, -y, 30, '#9fd4ff', 7, 1 - p); P.dot.add(x, -y, 31, '#ffffff', 4, (1 - p) * 0.8); return true;
      case 'flame': P.flame.add(x, -y + e.t, 25, '#ffffff', 18 * (1 - p) + 6, 1); if (S.q >= 1 && e.t < 3) glow(x, y, 24, 34, '#ff7a1a', 0.25, 1.4); return true;
      case 'zoomline': S.kick = Math.max(S.kick, clamp(1 - e.t / 16, 0, 1)); return true;
      case 'text': case 'target': case 'raven': return true; // drawn on the 2D overlay
    }
    return false;
  }

  /* ---------- frame hooks ---------- */
  function begin(W, quality, deco, sky) {
    if (!ready) return;
    Q = QA; QA.reset(); QN.reset(); S.q = quality; S.kick = 0; S.finalK = 0;
    if (W !== S.W) { S.W = W; S.seenImpact = S.seenKo = S.seenTrail = S.seenJump = false; while (own.length) pool.push(own.pop()); live.clear(); S.lt0 = -99; }
    S.deco = deco; S.sky = sky; dustCol = DUST[deco] || '#ddd2be';
    const c = W.cam; if (c && c.z > 0) { S.cx = c.x; S.cy = c.y; }
  }
  function end(W) {
    if (!ready) return;
    fighters(W); ambient(W);
    // projectiles that vanished mid-flight this frame hit something: pop a burst there
    for (const [p, rec] of live) { if (rec.seen) { rec.seen = false; continue; } if (rec.life > 3 && rec.col) spawn('pburst', rec.x, rec.y, 12, rec.col, W); live.delete(p); recPool.push(rec); }
    for (let i = own.length - 1; i >= 0; i--) { const e = own[i]; e.t = W.t - e.t0; if (e.t >= e.life || e.t < 0) { own[i] = own[own.length - 1]; own.pop(); pool.push(e); } else effect(e, W); }
    // hit light: decays on engine time so it freezes with hit-freeze
    const lt = W.t - S.lt0, k = lt >= 0 && lt < 10 ? (1 - lt / 10) : 0;
    light.intensity = k * k * (1.5 + 4 * S.lpow);
    QA.commit(); QN.commit();
  }
  function view(cx, cy, hw, hh) { S.cx = cx; S.cy = cy; S.hw = hw; S.hh = hh; }

  /* ---------- fighters: launch comet tails, final-strike aura, respawn light ---------- */
  function fighters(W) {
    for (const f of W.fighters) {
      if (f.dead) continue;
      const cy = f.y - f.h / 2;
      if (f.hitstun > 0 && !(f.stun && f.stun.type === 'buried')) {
        const sp = Math.hypot(f.lvx || 0, f.lvy || 0);
        if (sp > 5.5) {
          const a = Math.atan2(-f.lvy, -f.lvx), col = f.lastHitBy && f.lastHitBy.color ? f.lastHitBy.color : '#fff3d0', len = Math.min(330, sp * 13), k = clamp((sp - 5.5) / 8, 0, 1);
          Q = QN; streak(f.x, cy, -6, a, len, f.h * 0.8, col, 0.6 * k, 1, COMET); Q = QA;
          streak(f.x, cy, -5, a, len * 0.7, f.h * 0.25, '#ffffff', 0.4 * k, 1.6, COMET);
          for (let i = 0; i < 3; i++) { const o = (i - 1) * f.h * 0.3; streak(f.x - Math.sin(a) * o, cy + Math.cos(a) * o, -4, a, len * (1.1 + 0.25 * Math.sin(W.t * 0.9 + i * 2)), 3.5, '#ffffff', 0.6 * k, 1.6, COMET); }
        }
      }
      if (f.finalReady || f.inFinal) {
        for (let i = 0; i < 5; i++) { const ph = fr(W.t * 0.012 + i * 0.2 + f.slot * 0.37), a = i * 2.4 + f.slot; P.dot.add(f.x + Math.cos(a + W.t * 0.03) * f.w * 0.7, -(f.y - ph * f.h * 1.35), 26 + Math.sin(a + W.t * 0.03) * 20, '#ffe680', 7 * (1 - ph) + 2, 1 - ph); }
        flat(f.x, f.y, 0, f.w * (1 + 0.15 * Math.sin(W.t * 0.2)), f.w * 0.5, RING, '#ffe680', 0.5, 1.6);
      }
      if (f.onHalo) { streak(f.x, f.y - 1000, -20, PI / 2, 1040, 150, '#fff3c0', 0.22, 1.3); streak(f.x, f.y - 1000, -19, PI / 2, 1040, 50, '#ffffff', 0.25, 1.5); }
    }
  }

  /* ---------- projectiles: glow, trails, burst on impact ---------- */
  const live = new Map(), recPool = [];
  const PCOL = { arrow: '#ffffff', stone: '#e6e6e6', hail: '#bfe6ff', javelin: '#ffffff', peg: '#ffffff', star: '#ffe680', torch: '#ffb04a', milk: '#ffffff', item: '#ffffff' };
  function proj(p, cx, cy, W) {
    if (!ready) return;
    let rec = live.get(p); if (!rec) { rec = recPool.pop() || {}; live.set(p, rec); }
    rec.seen = true; rec.x = cx; rec.y = cy; rec.life = p.life; rec.col = PCOL[p.type] || null;
    const sp = Math.hypot(p.vx || 0, p.vy || 0), back = Math.atan2(-(p.vy || 0), -(p.vx || 0)), t = p.t || 0;
    switch (p.type) {
      case 'arrow': case 'peg': streak(cx, cy, -2, back, Math.min(110, sp * 7), 6, '#ffffff', 0.55, 1.6, COMET); break;
      case 'javelin': streak(cx, cy, -2, back, Math.min(170, sp * 10), 9, '#fff0c0', 0.55, 1.6, COMET); break;
      case 'stone': streak(cx, cy, -2, back, Math.min(140, sp * 8), p.w * 1.3, '#f0f0f0', 0.5, 1.4, COMET); break;
      case 'hail': glow(cx, cy, -3, p.w * 1.7, '#9fd8ff', 0.6, 1.6); streak(cx, cy, -2, back, Math.min(150, sp * 9), p.w * 1.2, '#cfeeff', 0.6, 1.8, COMET); break;
      case 'firebolt': {
        glow(cx, cy + p.h * 0.3, -3, p.w * 2.6, '#ff7a1a', 0.75, 2); glow(cx, cy + p.h * 0.4, 12, p.w * 0.9, '#fff6d0', 0.9, 3);
        streak(cx, cy + p.h * 0.4, -2, back, 330, p.w * 2.2, '#ff8a20', 0.7, 2, COMET); streak(cx, cy + p.h * 0.4, -1, back, 260, p.w * 0.8, '#fff2c0', 0.8, 3, COMET);
        streak(cx, cy - 1500, -30, PI / 2, 1500, p.w * 1.5, '#ffb060', 0.16, 1.4);
        break;
      }
      case 'geyser': {
        glow(cx, cy - p.h * 0.5, -4, p.w * 1.3, '#bfe6ff', 0.6, 1.6); streak(cx, cy + p.h * 0.5, 14, -PI / 2, p.h * 1.15, p.w * 0.5, '#e8f7ff', 0.5, 1.8);
        for (let i = 0; i < 8; i++) { const ph = fr(t * 0.05 + h1(i)), ox = (h1(i + 9) - 0.5) * p.w * (0.5 + ph); P.norm.add(cx + ox, -(cy + p.h * 0.5 - ph * p.h * 1.25 + ph * ph * p.h * 0.3), 18, '#ffffff', 9 * (1 - ph) + 3, 1 - ph); }
        flat(cx, cy + p.h * 0.5, 0, p.w * (0.8 + 0.3 * Math.sin(t * 0.5)), p.w * 0.4, RING, '#dff4ff', 0.6, 1.5);
        break;
      }
      case 'sound': {
        const dir = Math.sign(p.vx) || 1, a = clamp(p.life / 45, 0, 1);
        for (let i = 0; i < 3; i++) disc(cx - dir * i * 22, cy, 6, 12 + i * 3 + t * 0.2, 30 + i * 16 + t * 0.9, 0, RING, i ? '#ffe9a0' : '#ffffff', a * (0.75 - i * 0.18), 1.8);
        glow(cx, cy, 5, 50 + t, '#ffe9a0', 0.25 * a, 1.4);
        break;
      }
      case 'star': disc(cx, cy, 8, p.w * 2.3, p.w * 2.3, t * 0.12, FLARE, '#fff6c0', 0.9, 2.4); glow(cx, cy, -3, p.w * 2, '#ffd23a', 0.5, 1.8); streak(cx, cy, -2, back, Math.min(200, 40 + sp * 10), p.w * 0.9, '#ffe680', 0.6, 2, COMET); break;
      case 'torch': glow(cx, cy, -3, 46, '#ff8a20', 0.5, 1.6); streak(cx, cy, -2, back, Math.min(90, sp * 6), 12, '#ffb04a', 0.5, 1.8, COMET); break;
      case 'dustsword': if (t >= 8) streak(cx, cy, -2, back, Math.min(120, sp * 8), 16, '#ecd9b0', 0.45, 1.4, COMET); break;
    }
  }

  /* ---------- Final Strikes: charge-up shafts and converging energy; reports finalK for bloom / overlay ---------- */
  function final(F, W) {
    if (!ready) return;
    const f = F.owner, t = F.t; if (!f) return;
    const cy = f.y - f.h / 2, col = (f.hero && f.hero.color) || '#ffe680';
    const k = clamp(t / 12, 0, 1) * clamp((F.dur - t) / 20, 0, 1); S.finalK = Math.max(S.finalK, k);
    if (t < 60) {
      const a = clamp(t / 10, 0, 1) * clamp((60 - t) / 18, 0, 1);
      streak(f.x, cy - 1700, -24, PI / 2, 1760, 300 * a, '#fff0b0', 0.3 * a, 1.6); streak(f.x, cy - 1700, -23, PI / 2, 1760, 90 * a, '#ffffff', 0.5 * a, 2.4);
      for (let i = 0; i < 4; i++) { const o = (h1(i + 3) - 0.5) * 500; streak(f.x + o, cy - 1700, -40, PI / 2 - o * 0.0004, 1900, 60 + 80 * h1(i + 7), '#ffe9a0', 0.12 * a * (0.6 + 0.4 * Math.sin(W.t * 0.2 + i)), 1.4); }
      glow(f.x, cy, -10, 130 + 30 * Math.sin(W.t * 0.4), '#ffd23a', 0.4 * a, 1.4); disc(f.x, cy, 30, 170 * a, 170 * a, W.t * 0.05, FLARE, '#ffffff', 0.55 * a, 2);
      flat(f.x, f.y, 0, 60 + fr(t / 20) * 160, (60 + fr(t / 20) * 160) * 0.45, RING, '#ffe680', (1 - fr(t / 20)) * a, 2);
      for (let i = 0; i < 14; i++) { const ph = fr(t * 0.035 + h1(i + 20)), ang = h1(i + 40) * TAU, d = 260 * (1 - ph) + 30; streak(f.x + Math.cos(ang) * d, cy + Math.sin(ang) * d, 20, ang + PI, 50 * ph + 14, 5, i % 2 ? col : '#ffffff', ph * a, 2); }
    }
    const tt = t - 30; if (tt < 0) return;
    const fin = F.fin || {};
    if (fin.kind === 'beam') {
      const pr = F.data.p || 0, dir = F.dir || 1;
      if (fin.sprite === 'megastone') { const sx = f.x + dir * (60 + pr * 1600); streak(sx, cy, -4, dir > 0 ? PI : 0, 520, 150, '#ffd9a0', 0.55, 1.8, COMET); streak(sx, cy, -3, dir > 0 ? PI : 0, 380, 60, '#ffffff', 0.7, 2.6, COMET); glow(sx, cy, -5, 150, '#ffb060', 0.5, 1.8); }
      else { const a = Math.sin(Math.min(1, pr * 2) * PI), fl = 1 + 0.12 * Math.sin(W.t * 1.3); streak(f.x, cy, 20, dir > 0 ? 0 : PI, 2800, 380 * a * fl, '#ffe9a0', 0.5 * a, 1.3, BEAM); streak(f.x, cy, 21, dir > 0 ? 0 : PI, 2800, 150 * a * fl, '#ffffff', 0.9 * a, 2.6, BEAM); glow(f.x + dir * 40, cy, 22, 200 * a, '#ffffff', 0.8 * a, 2.6);
        for (let i = 0; i < 16; i++) { const ph = fr(W.t * 0.03 + h1(i + 60)); P.star.add(f.x + dir * ph * 1500, -(cy + (h1(i + 80) - 0.5) * 300 * a), 30, '#fff6c0', 14 * (1 - ph) + 6, a); } }
    } else if (fin.kind === 'quake') {
      const ph = fr(tt / 16); flat(f.x, f.y, 0, 60 + ph * 520, (60 + ph * 520) * 0.5, RING, '#ffe9c0', (1 - ph) * 0.8, 1.8);
    } else if (fin.kind === 'rain') {
      glow(f.x, cy - 620, -60, 520, fin.sprite === 'fire' ? '#ff8a20' : fin.sprite === 'hail' ? '#9fd8ff' : '#ffe680', 0.22 * k, 1.6);
    } else if (fin.kind === 'giant' && F.data.x !== undefined) {
      const ph = fr(tt / 20); flat(F.data.x, 0, 0, 40 + ph * 260, (40 + ph * 260) * 0.5, RING, dustCol, (1 - ph) * 0.7, 1.5);
    } else if (fin.kind === 'sweep' && F.data.x !== undefined) {
      for (let i = 0; i < 6; i++) { const ph = fr(W.t * 0.04 + h1(i)); P.smoke.add(F.data.x - (F.dir || 1) * (40 + ph * 160), -(-6 - ph * 40), (h1(i + 5) - 0.5) * 160, dustCol, 26 + 40 * ph, 0.5 * (1 - ph)); }
    }
  }

  /* ---------- ambient life per stage (stateless, wraps around the camera) ---------- */
  const CHIM = [[-1600, 381, -700], [-700, 372, -700], [200, 363, -700], [1100, 354, -700]];
  function mote(W, i, span, spanY, vx, vy, sway) {
    const t = W.t, x0 = h1(i) * span + vx * t + Math.sin(t * 0.013 + i) * sway, y0 = h1(i + 31) * spanY + vy * t + Math.cos(t * 0.011 + i * 1.7) * sway * 0.6;
    const left = S.cx - span / 2, top = S.cy - spanY / 2;
    M.x = left + (((x0 - left) % span) + span) % span; M.y = top + (((y0 - top) % spanY) + spanY) % spanY; M.z = (h1(i + 67) - 0.45) * 520;
    // fade near the wrap borders so nothing pops
    const ex = Math.min(M.x - left, left + span - M.x) / (span * 0.08), ey = Math.min(M.y - top, top + spanY - M.y) / (spanY * 0.08);
    M.a = clamp(Math.min(ex, ey), 0, 1);
  }
  const M = { x: 0, y: 0, z: 0, a: 1 };
  function ambient(W) {
    const n = S.q >= 2 ? 46 : S.q === 1 ? 26 : 14, span = Math.max(1400, S.hw * 2.5), spanY = Math.max(900, S.hh * 2.5), t = W.t, d = S.deco;
    for (let i = 0; i < n; i++) {
      const tw = 0.6 + 0.4 * Math.sin(t * 0.05 + i * 2.3);
      switch (d) {
        case 'sinai':
          if (i % 3 === 0) { mote(W, i, span, spanY, 0.35, -0.9, 30); P.dot.add(M.x, -M.y, M.z, i % 2 ? '#ff9a3a' : '#ffd27a', 5 + 4 * h1(i + 5), M.a * tw); }
          else { mote(W, i, span, spanY, -0.5, 0.55, 26); P.norm.add(M.x, -M.y, M.z, '#cfc6d6', 4 + 3 * h1(i + 5), M.a * 0.55); }
          break;
        case 'yamsuf': mote(W, i, span, spanY, (i % 2 ? 0.3 : -0.3), -1.1, 18); P.norm.add(M.x, -M.y, M.z, '#ffffff', 4 + 4 * h1(i + 5), M.a * 0.6 * tw); if (i % 4 === 0) P.dot.add(M.x, -M.y, M.z, '#bfe9ff', 12, M.a * 0.35); break;
        case 'yericho': case 'midbar': mote(W, i, span, spanY, 1.6, 0.12, 22); P.norm.add(M.x, -M.y, M.z, d === 'midbar' ? '#f0d9a8' : '#e8cfa0', 5 + 5 * h1(i + 5), M.a * 0.4); if (i % 6 === 0 && S.q >= 1) streak(M.x, M.y, M.z, PI, 150 + 120 * h1(i + 9), 7, '#fff0d0', M.a * 0.16, 1.2); break;
        case 'prague': mote(W, i, span, spanY, 0.2, -0.1, 50); if (i % 2) P.dot.add(M.x, -M.y, M.z, '#ffd98a', 5 + 3 * h1(i + 5), M.a * tw * tw * 0.8); else P.smoke.add(M.x, -(M.y * 0.2 - 30), M.z, '#8f9bc0', 90 + 60 * h1(i + 5), M.a * 0.05); break;
        case 'carmel': mote(W, i, span, spanY, 0.5, -0.3, 34); P.dot.add(M.x, -M.y, M.z, i % 3 ? '#ffe9b0' : '#ffb060', 5 + 4 * h1(i + 5), M.a * tw * 0.7); break;
        default: mote(W, i, span, spanY, 0.4, -0.12, 40); P.dot.add(M.x, -M.y, M.z, '#fff6c8', 5 + 4 * h1(i + 5), M.a * tw * 0.6);
      }
    }
    if (d === 'prague') for (let c = 0; c < CHIM.length; c++) for (let i = 0; i < 7; i++) { const ph = fr(t * 0.004 + i / 7 + c * 0.13); P.smoke.add(CHIM[c][0] + ph * 90 + Math.sin(ph * 9 + c) * 14, CHIM[c][1] + ph * 380, CHIM[c][2], '#9aa3c0', 46 + 150 * ph, 0.3 * (1 - ph) * Math.min(1, ph * 8)); }
    // god rays from the sun (day stages only)
    const sky = S.sky;
    if (sky && !sky.night && S.q >= 1) {
      const D = 2600, sx = S.cx + sky.sun[0] * D, sy = S.cy - sky.sun[1] * D - 120, base = Math.atan2(S.cy + 200 - sy, S.cx - sx), low = sky.sun[1] < 0.3 ? 1.5 : 1;
      for (let i = 0; i < 6; i++) { const a = base + (i - 2.5) * 0.17 + Math.sin(t * 0.004 + i * 1.9) * 0.03; streak(sx, sy, -1300, a, 5200, 110 + 160 * h1(i + 90), sky.sunCol, (0.03 + 0.02 * Math.sin(t * 0.011 + i * 2.7)) * low, 1.2); }
    }
  }

  function init(ctx) {
    T = ctx.T; P = ctx.P; tmpC = new T.Color();
    const atlas = makeAtlas(ctx.canvasTex);
    QA = Quads(atlas, 1400, true); QN = Quads(atlas, 500, false); Q = QA;
    ctx.dyn.add(QN.mesh); ctx.dyn.add(QA.mesh);
    light = new T.PointLight('#ffffff', 0, 650, 0); light.position.set(0, 0, 130); ctx.scene.add(light);
    ready = true; return api;
  }
  const api = { init, begin, end, effect, proj, final, view, get kick() { return S.kick; }, get finalK() { return S.finalK; }, get quads() { return QA ? QA.n + QN.n : 0; } };
  return api;
})();
