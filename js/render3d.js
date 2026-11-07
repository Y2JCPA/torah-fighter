/* Torah Fighter — 3D renderer (Three.js). Low-poly, toon-shaded, N64-style.
   The game itself stays 2D: world (x, y-down) maps to Three (x, -y, 0). The perspective camera is placed so the
   z=0 fighting plane lines up pixel-for-pixel with the 2D overlay canvas (HUD, tags, text). */
'use strict';

const R3D = (() => {
  const T = window.THREE;
  let ok = false, renderer = null, scene = null, camera = null, canvas = null;
  let dyn = null, hemi = null, sun = null, amb = null;
  const FOV = 34, TAN = Math.tan(FOV * Math.PI / 360);
  const TAU = Math.PI * 2;

  /* ---------- materials ---------- */
  let gradMap = null;
  const matCache = new Map();
  function toon(color, o = {}) {
    const key = color + '|' + (o.emissive || '') + '|' + (o.opacity || 1) + '|' + (o.side || 0) + '|' + (o.ei || 0);
    let m = matCache.get(key);
    if (!m) {
      m = new T.MeshToonMaterial({ color, gradientMap: gradMap });
      if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
      if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
      if (o.side) m.side = o.side;
      matCache.set(key, m);
    }
    return m;
  }
  let outlineMat = null;
  function makeOutline() {
    outlineMat = new T.ShaderMaterial({
      uniforms: { th: { value: 1.6 } },
      vertexShader: 'uniform float th; void main(){ vec3 p = position + normal * th; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.06, 0.04, 0.08, 1.0); }',
      side: T.BackSide
    });
  }
  function mesh(geo, color, o = {}) {
    const m = new T.Mesh(geo, o.mat || toon(color, o));
    m.castShadow = o.shadow !== false; m.receiveShadow = !!o.receive;
    if (o.outline !== false && !(o.opacity < 1)) { const ol = new T.Mesh(geo, outlineMat); ol.castShadow = false; ol.userData.outline = true; m.add(ol); }
    return m;
  }
  const G = {
    box: (w, h, d) => new T.BoxGeometry(w, h, d),
    sph: (r, ws = 10, hs = 8) => new T.SphereGeometry(r, ws, hs),
    cyl: (rt, rb, h, s = 8) => new T.CylinderGeometry(rt, rb, h, s),
    cone: (r, h, s = 8) => new T.ConeGeometry(r, h, s),
    ico: (r, d = 0) => new T.IcosahedronGeometry(r, d),
    tor: (r, t, rs = 6, ts = 14, arc = TAU) => new T.TorusGeometry(r, t, rs, ts, arc)
  };
  // a limb that extends along +x from its origin
  function limbX(len, r1, r2, color, o) { const g = G.cyl(r2, r1, len, 7); g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0); return mesh(g, color, o); }
  function limbDown(len, r1, r2, color, o) { const g = G.cyl(r1, r2, len, 7); g.translate(0, -len / 2, 0); return mesh(g, color, o); }

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }

  /* ---------- particle systems (one draw call each) ---------- */
  const TEX = {};
  function makeTextures() {
    TEX.dot = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
    TEX.flame = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 40, 2, 32, 36, 30); g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.35, 'rgba(255,190,60,1)'); g.addColorStop(0.7, 'rgba(255,90,10,.7)'); g.addColorStop(1, 'rgba(255,40,0,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(10, 44); x.quadraticCurveTo(32, -10, 54, 44); x.arc(32, 44, 22, 0, Math.PI); x.fill(); });
    TEX.star = canvasTex(64, 64, (x) => { x.fillStyle = '#fff'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 30; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fill(); });
    TEX.ring = canvasTex(64, 64, (x) => { x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 27, 0, TAU); x.stroke(); });
    TEX.glow = canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
  }
  function Particles(tex, additive, max = 1200) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('pcolor', new T.BufferAttribute(col, 3));
    geo.setAttribute('psize', new T.BufferAttribute(size, 1)); geo.setAttribute('palpha', new T.BufferAttribute(alpha, 1));
    const mat = new T.ShaderMaterial({
      uniforms: { tex: { value: tex }, scale: { value: 500 } },
      vertexShader: 'attribute vec3 pcolor; attribute float psize; attribute float palpha; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D tex; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(tex, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * t.rgb, a); }',
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    const pts = new T.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
    const c = new T.Color();
    return {
      pts, mat, n: 0,
      add(x, y, z, color, s, a) {
        if (this.n >= max) return; const i = this.n++;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; c.set(color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; size[i] = s; alpha[i] = a;
      },
      commit() { geo.setDrawRange(0, this.n); for (const k of ['position', 'pcolor', 'psize', 'palpha']) geo.attributes[k].needsUpdate = true; },
      reset() { this.n = 0; }
    };
  }
  let P = {};

  /* ---------- hero rig ---------- */
  function headwear(L, hr, k, H) {
    const g = new T.Group(), hc = L.headColor || '#888';
    const cap = (r, col, thetaLen = Math.PI * 0.5) => mesh(new T.SphereGeometry(r, 12, 6, 0, TAU, 0, thetaLen), col);
    switch (L.head) {
      case 'turban': { const c = cap(hr * 1.12, '#f4efe2', Math.PI * 0.55); c.scale.y = 0.95; g.add(c); const t = mesh(G.tor(hr * 1.02, hr * 0.2, 6, 14), hc); t.rotation.x = Math.PI / 2; t.position.y = hr * 0.25; g.add(t); break; }
      case 'crown': { const h = cap(hr * 1.05, L.hair); g.add(h); const c = mesh(G.cyl(hr * 0.85, hr * 0.8, hr * 0.45, 10), hc); c.position.y = hr * 0.85; g.add(c); for (let i = 0; i < 5; i++) { const s = mesh(G.cone(hr * 0.14, hr * 0.4, 4), hc); const a = i / 5 * TAU; s.position.set(Math.cos(a) * hr * 0.8, hr * 1.25, Math.sin(a) * hr * 0.8); g.add(s); } break; }
      case 'helmet': case 'bosshelm': { const c = cap(hr * 1.1, hc); g.add(c); const b = mesh(G.cyl(hr * 1.12, hr * 1.12, hr * 0.2, 12), shadeHex(hc, -30)); b.position.y = hr * 0.05; g.add(b); const crest = mesh(G.box(hr * 1.5, hr * 0.35, hr * 0.25), L.head === 'bosshelm' ? '#e74c3c' : '#c0392b'); crest.position.y = hr * 1.2; g.add(crest); break; }
      case 'circlet': { const t = mesh(G.tor(hr * 1.0, hr * 0.09, 5, 16), hc); t.rotation.x = Math.PI / 2; t.position.y = hr * 0.35; g.add(t); g.add(cap(hr * 1.04, L.hair, Math.PI * 0.42)); const gem = mesh(G.ico(hr * 0.14), '#3498db'); gem.position.set(hr * 1.0, hr * 0.38, 0); g.add(gem); break; }
      case 'biret': { const br = mesh(G.cyl(hr * 1.45, hr * 1.45, hr * 0.12, 16), '#111'); br.position.y = hr * 0.55; g.add(br); const tp = mesh(G.cyl(hr * 0.85, hr * 0.95, hr * 0.75, 14), '#151515'); tp.position.y = hr * 0.95; g.add(tp); break; }
      case 'kerchief': { g.add(cap(hr * 1.08, hc, Math.PI * 0.6)); const tail = mesh(G.cone(hr * 0.5, hr * 1.3, 5), hc); tail.position.set(-hr * 0.9, -hr * 0.3, 0); tail.rotation.z = -2.6; g.add(tail); const band = mesh(G.tor(hr * 1.02, hr * 0.08, 4, 14), '#222'); band.rotation.x = Math.PI / 2; band.position.y = hr * 0.35; g.add(band); break; }
      case 'kohen': { const m = mesh(G.cyl(hr * 0.95, hr * 1.0, hr * 1.1, 12), '#ffffff'); m.position.y = hr * 0.8; g.add(m); const top = mesh(G.sph(hr * 0.95, 12, 6), '#ffffff'); top.scale.y = 0.45; top.position.y = hr * 1.35; g.add(top); const band = mesh(G.tor(hr * 1.0, hr * 0.08, 4, 14), '#3b5bdb'); band.rotation.x = Math.PI / 2; band.position.y = hr * 0.5; g.add(band); break; }
      case 'scarf': { g.add(cap(hr * 1.15, hc, Math.PI * 0.62)); const back = mesh(G.sph(hr * 1.0, 10, 8), hc); back.scale.set(0.8, 1.5, 1.05); back.position.set(-hr * 0.55, -hr * 0.5, 0); g.add(back); break; }
      case 'locks': {
        g.add(cap(hr * 1.07, L.hair, Math.PI * 0.6));
        for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; const l = limbDown(hr * 2.3, hr * 0.16, hr * 0.11, L.hair); l.position.set(-hr * 0.6 + Math.cos(a) * hr * 0.25, 0, Math.sin(a) * hr * 0.95); l.rotation.z = -0.25; l.userData.lock = i; g.add(l); }
        break;
      }
      case 'none': default: { g.add(cap(hr * 1.05, L.hair, Math.PI * 0.45)); if (L.hairy) { const b = mesh(G.sph(hr * 0.9, 8, 6), L.hair); b.scale.set(0.7, 1.2, 1.05); b.position.set(-hr * 0.5, -hr * 0.4, 0); g.add(b); } break; }
    }
    return g;
  }
  function shadeHex(hex, amt) { const c = new T.Color(hex); c.offsetHSL(0, 0, amt / 255); return '#' + c.getHexString(); }

  /* weapons, built pointing along +x from the hand */
  function buildWeapon(kind, k) {
    const g = new T.Group();
    const wood = '#7b5230', steel = '#cfd8dc';
    const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
    switch (kind) {
      case 'staff': case 'cane': case 'shepherd': case 'bigstaff': case 'aharon': {
        const len = (kind === 'shepherd' ? 52 : kind === 'cane' ? 60 : kind === 'bigstaff' ? 110 : 72) * k, r = (kind === 'bigstaff' ? 2.8 : 2.3) * k;
        const s = limbX(len, r, r, kind === 'bigstaff' ? '#6b4423' : wood); s.position.x = -len * 0.35; g.add(s);
        if (kind !== 'staff' && kind !== 'aharon') { const c = mesh(G.tor(6 * k, r, 5, 10, Math.PI * 1.2), wood); c.position.set(len * 0.65, 6 * k, 0); c.rotation.z = -Math.PI * 0.6; g.add(c); }
        if (kind === 'aharon') for (let i = 0; i < 5; i++) add(mesh(G.sph(3 * k, 6, 4), i % 2 ? '#ffffff' : '#f5b7b1'), len * 0.45 + i * 3 * k, (i % 2 ? 4 : -4) * k, (i % 3 - 1) * 3 * k);
        break;
      }
      case 'mantle': { const m = mesh(G.box(40 * k, 9 * k, 3 * k), '#4a3420'); m.geometry.translate(20 * k, 0, 0); g.add(m); g.userData.whip = m; break; }
      case 'club': { add(limbX(42 * k, 3 * k, 6 * k, '#6e4a2a')); break; }
      case 'sword': {
        add(limbX(12 * k, 2.2 * k, 2.2 * k, '#5b3a1a'), -6 * k); add(mesh(G.box(3 * k, 14 * k, 4 * k), '#c9a227'), 6 * k);
        const b = mesh(G.box(40 * k, 6 * k, 1.6 * k), steel); b.geometry.translate(28 * k, 0, 0); g.add(b); add(mesh(G.cone(3 * k, 7 * k, 4), steel), 51 * k).rotation.z = -Math.PI / 2; break;
      }
      case 'spear': { const s = limbX(102 * k, 1.8 * k, 1.8 * k, '#8b5a2b'); s.position.x = -40 * k; g.add(s); const t = add(mesh(G.cone(4.5 * k, 18 * k, 4), '#bdc3c7'), 70 * k); t.rotation.z = -Math.PI / 2; break; }
      case 'mallet': { add(limbX(32 * k, 2 * k, 2 * k, '#8b5a2b')); add(mesh(G.box(12 * k, 18 * k, 12 * k), '#6d4c2f'), 32 * k); break; }
      case 'jawbone': {
        const sh = new T.Shape(); sh.moveTo(-4, -4); sh.quadraticCurveTo(20, -16, 46, -10); sh.lineTo(48, 4); sh.quadraticCurveTo(22, 2, 8, 8); sh.lineTo(-4, 6); sh.closePath();
        const geo = new T.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: false }); geo.scale(k, -k, k); geo.translate(0, 0, -2.5 * k); geo.computeVertexNormals();
        g.add(mesh(geo, '#f2e8cf')); for (let i = 0; i < 5; i++) add(mesh(G.box(3 * k, 4 * k, 5.5 * k), '#ffffff'), (19 + i * 6) * k, (11 - i * 0.3) * k); break;
      }
      case 'goliath': { // buster-style giant broadsword
        add(limbX(20 * k, 3.5 * k, 3.5 * k, '#3d2b1f'), -12 * k);
        add(mesh(G.box(6 * k, 22 * k, 8 * k), '#8e9aa3'), 11 * k);
        const sh = new T.Shape(); sh.moveTo(14, -11); sh.lineTo(108, -11); sh.lineTo(120, 2); sh.lineTo(108, 11); sh.lineTo(14, 11); sh.closePath();
        for (const hx of [24, 34]) { const h = new T.Path(); h.absarc(hx, 0, 3, 0, TAU, true); sh.holes.push(h); }
        const geo = new T.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1, bevelSegments: 1 }); geo.scale(k, k, k); geo.translate(0, 0, -1.5 * k); geo.computeVertexNormals();
        g.add(mesh(geo, '#b8c4c8', { emissive: '#223', ei: 0.3 }));
        add(mesh(G.box(66 * k, 1.5 * k, 6 * k), '#eef3f5', { outline: false }), 74 * k, 8 * k);
        break;
      }
      case 'busters': { const s = limbX(150 * k, 2.5 * k, 2.5 * k, '#5b3a1a'); s.position.x = -50 * k; g.add(s); add(mesh(G.cone(6 * k, 26 * k, 4), '#8d8d8d'), 112 * k).rotation.z = -Math.PI / 2; break; }
      case 'sling': case 'slingdraw': { add(limbX(22 * k, 0.8 * k, 0.8 * k, '#8b6b3e')); add(mesh(G.ico(4 * k), '#999'), 22 * k); g.userData.spin = true; break; }
      case 'bowdraw': case 'bowback': {
        const b = mesh(G.tor(24 * k, 1.8 * k, 4, 12, 2.4), '#6e4a1f'); b.rotation.z = -1.2; b.position.x = -6 * k; g.add(b);
        if (kind === 'bowdraw') { const ar = add(limbX(32 * k, 0.9 * k, 0.9 * k, '#8b5a2b'), -8 * k); add(mesh(G.cone(2.5 * k, 6 * k, 4), '#bbb'), 26 * k).rotation.z = -Math.PI / 2; g.userData.arrow = ar; }
        break;
      }
      case 'shofar': {
        const curve = new T.QuadraticBezierCurve3(new T.Vector3(0, 0, 0), new T.Vector3(14 * k, 16 * k, 0), new T.Vector3(32 * k, 8 * k, 0));
        g.add(mesh(new T.TubeGeometry(curve, 10, 3.2 * k, 6), '#d9b77e')); const bell = add(mesh(G.cyl(6 * k, 3 * k, 8 * k, 8), '#b8935a'), 33 * k, 8 * k); bell.rotation.z = -1.2; break;
      }
      case 'jar': case 'jartorch': { const j = add(mesh(G.sph(10 * k, 8, 7), '#b5651d'), 10 * k); j.scale.y = 1.2; add(mesh(G.cyl(4 * k, 5 * k, 6 * k, 8), '#8e4a12'), 10 * k, 13 * k); g.userData.flame = new T.Vector3(10 * k, 20 * k, 0); break; }
      case 'torch': { add(limbX(28 * k, 2 * k, 2.6 * k, wood)); add(mesh(G.cyl(4 * k, 3 * k, 6 * k, 6), '#4a3020'), 29 * k); g.userData.flame = new T.Vector3(31 * k, 4 * k, 0); break; }
      case 'peg': { add(limbX(30 * k, 2.4 * k, 2.4 * k, '#a07a4a')); add(mesh(G.cone(2.6 * k, 9 * k, 5), '#a07a4a'), 34 * k).rotation.z = -Math.PI / 2; break; }
      case 'hail': add(mesh(G.ico(14 * k, 0), '#d6eaf8', { emissive: '#3a6f9a', ei: 0.25 }), 14 * k); break;
      case 'bowl': { const b = add(mesh(new T.SphereGeometry(10 * k, 10, 5, 0, TAU, Math.PI / 2, Math.PI / 2), '#c8a165'), 10 * k); add(mesh(G.cyl(9.5 * k, 9.5 * k, 1, 10), '#fffbe8', { outline: false }), 10 * k, -0.5); break; }
      case 'harp': { const f = mesh(G.tor(14 * k, 1.6 * k, 4, 10, Math.PI * 1.3), '#c49a3c'); f.position.set(12 * k, -2 * k, 0); g.add(f); for (let i = 0; i < 5; i++) add(mesh(G.cyl(0.4 * k, 0.4 * k, 22 * k, 3), '#ffffff', { outline: false }), (6 + i * 3) * k, -2 * k); break; }
    }
    return g;
  }

  function buildRig(hero, opt = {}) {
    const L = hero.look, H = hero.h, k = H / 90, wide = hero.w / 46 * 90 / H * (H / 90);
    const wd = Math.max(0.85, Math.min(1.5, hero.w / hero.h * 90 / 46));
    const hipY = H * 0.42, shY = H * 0.73, headY = H * 0.86, hr = H * 0.115 * (hero.id === 'moshe' ? 0.8 : 1);
    const root = new T.Group(), yaw = new T.Group(), spinG = new T.Group(), offG = new T.Group(), leanG = new T.Group();
    root.add(yaw); yaw.add(spinG); spinG.position.y = H / 2; spinG.add(offG); offG.position.y = -H / 2; offG.add(leanG);
    const R = { hero, root, yaw, spinG, offG, leanG, H, k, hr, weapons: {}, flames: [] };
    // legs
    const legLen = H * 0.42, thigh = legLen * 0.5, shin = legLen * 0.5;
    const leg = (z) => {
      const hip = new T.Group(); hip.position.set(0, hipY, z); leanG.add(hip);
      hip.add(limbDown(thigh, 4.4 * k * wd, 3.8 * k * wd, shadeHex(L.robe, -18)));
      const knee = new T.Group(); knee.position.y = -thigh; hip.add(knee);
      knee.add(limbDown(shin, 3.6 * k * wd, 3 * k * wd, L.skin));
      const foot = mesh(G.box(11 * k, 4 * k, 6 * k * wd), '#5a3d22'); foot.position.set(3 * k, -shin, 0); knee.add(foot);
      return { hip, knee };
    };
    R.legF = leg(5 * k * wd); R.legB = leg(-5 * k * wd);
    // torso / robe
    const sw = 12 * k * wd, hw = 15.5 * k * wd, robeBot = hipY - H * 0.2, robeH = shY - robeBot;
    const robe = mesh(G.cyl(sw, hw, robeH, 9), L.robe); robe.position.y = robeBot + robeH / 2; robe.scale.z = 0.78; leanG.add(robe);
    const shoulders = mesh(G.sph(sw, 10, 6), L.robe); shoulders.scale.set(1, 0.45, 0.78); shoulders.position.y = shY; leanG.add(shoulders);
    const sash = mesh(G.cyl(hw * 0.86, hw * 0.88, 6 * k, 9), L.robe2, { outline: false }); sash.position.y = hipY; sash.scale.z = 0.8; leanG.add(sash);
    if (L.armor) { const ar = mesh(G.cyl(sw * 1.04, sw * 1.15, robeH * 0.5, 9), '#c8a85a', { emissive: '#3a2a00', ei: 0.3 }); ar.position.y = shY - robeH * 0.25; ar.scale.z = 0.8; leanG.add(ar); }
    if (L.hairy) { const belt = mesh(G.cyl(hw * 0.9, hw * 0.9, 7 * k, 9), '#3e2a17', { outline: false }); belt.position.y = hipY; belt.scale.z = 0.82; leanG.add(belt); }
    if (hero.id === 'pinchas') {
      const tex = canvasTex(64, 80, (x) => { x.fillStyle = '#c9a227'; x.fillRect(0, 0, 64, 80); const c = ['#e74c3c', '#27ae60', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c']; for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { x.fillStyle = c[(r * 3 + q) % 6]; x.fillRect(6 + q * 19, 5 + r * 19, 15, 15); } });
      const ch = new T.Mesh(G.box(14 * k, 18 * k, 2), new T.MeshToonMaterial({ map: tex, gradientMap: gradMap })); ch.position.set(sw * 0.62, shY - 12 * k, 0); ch.rotation.y = Math.PI / 2; leanG.add(ch);
    }
    if (!hero.boss && hero.id !== 'yael') for (const s of [-1, 1]) { const t = mesh(G.cyl(0.7, 0.7, 9 * k, 3), '#ffffff', { outline: false, shadow: false }); t.position.set(s * hw * 0.5, robeBot - 4 * k, hw * 0.6); leanG.add(t); }
    if (L.weapon === 'bow' || L.weapon === 'bow2') { R.bowBack = buildWeapon('bowback', k); R.bowBack.position.set(-sw * 0.7, shY - 14 * k, 0); R.bowBack.rotation.z = 2.0; leanG.add(R.bowBack); }
    // arms
    const arm = (z, front) => {
      const sh = new T.Group(); sh.position.set(0, shY - 3 * k, z); leanG.add(sh);
      const al = H * 0.3;
      sh.add(limbX(al * 0.5, 4.6 * k * wd, 4 * k * wd, front ? L.robe2 : shadeHex(L.robe2, -25)));
      const el = new T.Group(); el.position.x = al * 0.5; sh.add(el);
      el.add(limbX(al * 0.5, 3.3 * k * wd, 3 * k * wd, L.skin));
      const hand = new T.Group(); hand.position.x = al * 0.5; el.add(hand);
      hand.add(mesh(G.sph(3.8 * k * wd, 7, 5), L.skin));
      return { sh, el, hand };
    };
    R.armF = arm(sw * 0.95 + 2 * k, true); R.armB = arm(-sw * 0.95 - 2 * k, false);
    // head
    const head = new T.Group(); head.position.set(2 * k, headY, 0); leanG.add(head); R.head = head;
    head.add(mesh(G.sph(hr, 12, 10), L.skin));
    const nose = mesh(G.cone(hr * 0.16, hr * 0.38, 5), L.skin); nose.rotation.z = -Math.PI / 2; nose.position.set(hr * 1.02, -hr * 0.08, 0); head.add(nose);
    R.eyes = [];
    for (const z of [hr * 0.36, -hr * 0.36]) {
      const e = mesh(G.sph(hr * 0.13, 6, 5), '#141414', { outline: false, shadow: false }); e.position.set(hr * 0.86, hr * 0.12, z); e.scale.set(0.6, 1.2, 1); head.add(e); R.eyes.push(e);
      const br = mesh(G.box(hr * 0.12, hr * 0.08, hr * 0.38), L.beard || L.hair || '#333', { outline: false, shadow: false }); br.position.set(hr * 0.88, hr * 0.38, z); head.add(br);
    }
    if (L.beard && L.beardLen > 0) {
      const bl = L.beardLen;
      const b = mesh(G.sph(hr * 0.75, 9, 7), L.beard); b.scale.set(0.85, 0.7 + bl * 0.55, 1.1); b.position.set(hr * 0.35, -hr * (0.45 + bl * 0.25), 0); head.add(b);
      const ms = mesh(G.box(hr * 0.25, hr * 0.14, hr * 0.8), L.beard, { outline: false }); ms.position.set(hr * 0.88, -hr * 0.32, 0); head.add(ms);
    } else { const m = mesh(G.box(hr * 0.1, hr * 0.06, hr * 0.4), '#7a3b2e', { outline: false, shadow: false }); m.position.set(hr * 0.93, -hr * 0.4, 0); head.add(m); }
    const hw2 = headwear(L, hr, k, H); head.add(hw2); R.headwear = hw2;
    if (L.glow) { const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#fff2a8', transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending })); s.scale.set(hr * 4.5, hr * 4.5, 1); s.position.z = -hr; head.add(s); }
    // extras
    const ex = (o) => { o.visible = false; root.add(o); return o; };
    R.shield = ex(new T.Mesh(G.sph(1, 18, 14), new T.MeshToonMaterial({ color: '#fff', gradientMap: gradMap, transparent: true, opacity: 0.38, depthWrite: false, emissive: new T.Color('#222') })));
    R.shield.position.y = H / 2;
    R.reflect = ex(new T.Mesh(G.tor(1, 0.04, 4, 32), new T.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.85 }))); R.reflect.position.y = H / 2;
    R.ice = ex(new T.Mesh(G.box(hero.w * 1.5, H * 1.08, hero.w * 1.2), new T.MeshToonMaterial({ color: '#bfeaff', gradientMap: gradMap, transparent: true, opacity: 0.55, depthWrite: false, emissive: new T.Color('#1b4a66') }))); R.ice.position.y = H * 0.52;
    R.halo = ex(mesh(G.cyl(50, 50, 7, 20), '#ffe9a8', { emissive: '#7a5c00', ei: 0.6 })); R.halo.position.y = -2;
    R.glow = ex(new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#fff3a0', transparent: true, depthWrite: false, blending: T.AdditiveBlending }))); R.glow.scale.set(H * 2.2, H * 2.2, 1); R.glow.position.set(0, H / 2, -20);
    R.dirt = ex(mesh(G.cyl(hero.w, hero.w * 1.1, 8, 10), '#7b5a3a', { outline: false })); R.dirt.position.y = 0;
    R.gates = ex(new T.Group()); for (const s of [-1, 1]) { const d = mesh(G.box(32, H * 0.75, 6), '#8b5a2b'); d.position.set(s * 22, H * 1.25, 10); R.gates.add(d); const bar = mesh(G.box(30, 4, 8), '#4a2d14'); bar.position.set(s * 22, H * 1.2, 14); R.gates.add(bar); }
    R.chariot = ex(new T.Group()); { const c = mesh(G.cyl(hero.w * 1.2, hero.w * 0.9, 14, 12), '#ff7a1a', { emissive: '#ff4400', ei: 0.8 }); c.position.y = 2; R.chariot.add(c); }
    R.axe = ex(new T.Group()); { const h = limbX(80 * k, 2.5 * k, 2.5 * k, '#6b4423'); R.axe.add(h); const b = mesh(G.box(22 * k, 30 * k, 4 * k), '#bdc3c7'); b.position.set(80 * k, 6 * k, 0); R.axe.add(b); R.axe.position.y = H; }
    root.traverse(o => { if (o.isMesh && !o.userData.outline) o.castShadow = o.castShadow !== false; });
    return R;
  }

  function weaponFor(R, kind) {
    if (!kind) return null;
    let w = R.weapons[kind];
    if (!w) { w = buildWeapon(kind, R.k * (R.hero.boss ? 0.8 : 1)); w.visible = false; R.armF.hand.add(w); R.weapons[kind] = w; }
    return w;
  }

  function poseRig(R, f, W, P) {
    const H = R.H;
    R.leanG.rotation.set(0, 0, 0); R.leanG.position.set(0, 0, 0); R.leanG.scale.set(1, 1, 1); R.spinG.rotation.set(0, 0, 0);
    if (P.horiz) { R.leanG.rotation.z = P.horiz * Math.PI / 2 * (f && f.state === 'down' ? 1 : -1); R.leanG.position.set(-H * 0.35 * P.horiz, H * 0.08 * P.horiz, 0); }
    if (P.spin) R.spinG.rotation.z = -P.spin;
    if (P.lean) R.leanG.rotation.z += -P.lean;
    if (P.crouch) R.leanG.scale.y = 1 - P.crouch;
    R.leanG.position.y += -P.bob;
    // legs
    const tk = P.tuck || 0;
    R.legF.hip.rotation.z = P.legA + tk * 0.9; R.legF.knee.rotation.z = -tk * 1.6 - Math.max(0, -P.legA) * 0.9;
    R.legB.hip.rotation.z = P.legB + tk * 0.9; R.legB.knee.rotation.z = -tk * 1.6 - Math.max(0, -P.legB) * 0.9;
    // arms
    R.armF.sh.rotation.z = -P.fa; R.armB.sh.rotation.z = -P.ba;
    R.armF.el.rotation.z = P.weaponOut ? 0 : 0.35; R.armB.el.rotation.z = 0.35;
    // eyes
    const sq = P.eyes === 'o' ? 1 : P.eyes === '-' ? 0.15 : 0.35;
    for (const e of R.eyes) e.scale.y = 1.2 * sq;
    // hair locks sway
    if (R.headwear) R.headwear.children.forEach(c => { if (c.userData.lock !== undefined) c.rotation.z = -0.25 + Math.sin(W.t * 0.1 + c.userData.lock) * 0.12 + (f && !f.grounded ? 0.3 : 0); });
    // weapon
    let kind = f ? Art.handWeapon(f) : (R.hero.look.weapon === 'none' || R.hero.look.weapon === 'bow' || R.hero.look.weapon === 'bow2' ? defaultWeapon(R.hero) : R.hero.look.weapon);
    if (f && f.held && f.held.kind === 'staff') kind = 'aharon';
    if (kind === 'ruach' || kind === 'manna' || kind === 'honey') kind = null;
    for (const key in R.weapons) R.weapons[key].visible = false;
    R.flames.length = 0;
    const w = weaponFor(R, kind);
    if (w) {
      w.visible = true;
      let wa = P.fa;
      const longW = ['staff', 'bigstaff', 'spear', 'cane', 'shepherd', 'aharon'].includes(kind);
      if (!P.weaponOut && longW) wa = -Math.PI / 2 + 0.15;
      else if (!P.weaponOut && ['sword', 'club', 'mallet', 'torch'].includes(kind)) wa = P.fa - 1.2;
      if (kind === 'goliath' && !P.weaponOut) wa = -Math.PI / 2 - 0.5;
      w.rotation.z = -(wa - P.fa);
      if (w.userData.whip) w.userData.whip.scale.x = P.anim === 'whip' ? 2.4 : 1;
      if (w.userData.spin) w.rotation.z += P.shooting ? W.t * 0.6 : 0;
      if (w.userData.flame) R.flames.push(w.localToWorld(w.userData.flame.clone()));
    }
    if (R.bowBack) R.bowBack.visible = !(kind === 'bowdraw');
  }
  function defaultWeapon(hero) { return { club: 'club', sword: 'sword', spear: 'spear', mallet: 'mallet', staff: hero.look.weapon === 'mantle' ? 'mantle' : hero.look.weapon, fists: null }[hero.arch] || null; }

  /* ---------- minions, items, projectiles ---------- */
  function buildGolem(scale = 1) {
    const g = new T.Group(), clay = '#9c7a54', dk = '#7a5c3c';
    const body = mesh(G.box(52, 60, 38), clay); body.position.y = 72; g.add(body);
    const head = mesh(G.box(30, 28, 28), clay); head.position.set(4, 116, 0); g.add(head);
    for (const z of [7, -7]) { const e = mesh(G.box(3, 5, 5), '#ffdf80', { emissive: '#ffb000', ei: 1, outline: false }); e.position.set(19.5, 118, z); g.add(e); }
    const tex = canvasTex(128, 48, (x) => { x.fillStyle = '#3b2a1a'; x.font = 'bold 36px "Frank Ruhl Libre", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('אמת', 64, 26); });
    const label = new T.Mesh(new T.PlaneGeometry(26, 10), new T.MeshBasicMaterial({ map: tex, transparent: true })); label.position.set(19.3, 126, 0); label.rotation.y = Math.PI / 2; g.add(label);
    const legs = [];
    for (const z of [11, -11]) { const p = new T.Group(); p.position.set(0, 44, z); g.add(p); p.add(limbDown(44, 10, 9, dk)); legs.push(p); }
    const arms = [];
    for (const z of [32, -32]) { const p = new T.Group(); p.position.set(0, 94, z); g.add(p); p.add(limbX(40, 9, 8, z > 0 ? clay : dk)); const fist = mesh(G.box(18, 18, 18), dk); fist.position.x = 42; p.add(fist); arms.push(p); }
    g.userData = { legs, arms }; g.scale.setScalar(scale);
    return g;
  }
  function buildMinion(type) {
    const g = new T.Group();
    if (type === 'golem') return buildGolem();
    if (type === 'fox') {
      const b = mesh(G.sph(10, 8, 6), '#d35400'); b.scale.set(1.7, 0.85, 0.85); b.position.y = 14; g.add(b);
      const h = mesh(G.cone(8, 18, 6), '#d35400'); h.rotation.z = -Math.PI / 2; h.position.set(22, 18, 0); g.add(h);
      for (const z of [4, -4]) { const e = mesh(G.cone(3, 8, 4), '#a04000'); e.position.set(16, 27, z); g.add(e); }
      const t = mesh(G.cone(6, 22, 6), '#ffffff'); t.rotation.z = Math.PI / 2 + 0.4; t.position.set(-24, 22, 0); g.add(t);
      const legs = []; for (const x of [-9, 9]) for (const z of [5, -5]) { const p = new T.Group(); p.position.set(x, 10, z); g.add(p); p.add(limbDown(10, 2, 1.6, '#a04000')); legs.push(p); }
      g.userData = { legs, flame: new T.Vector3(-34, 26, 0) };
    } else if (type === 'snake') {
      const segs = []; for (let i = 0; i < 9; i++) { const s = mesh(G.sph(5 - i * 0.2, 7, 5), i % 2 ? '#4e8a3a' : '#5da544'); s.position.set(-i * 6, 5, 0); g.add(s); segs.push(s); }
      const head = mesh(G.sph(7, 8, 6), '#5da544'); head.scale.set(1.3, 0.8, 1); head.position.set(9, 7, 0); g.add(head);
      const tg = mesh(G.box(8, 1, 1), '#e74c3c', { outline: false }); tg.position.set(19, 6, 0); g.add(tg);
      g.userData = { segs, tongue: tg };
    } else if (type === 'eshel') {
      const tr = mesh(G.cyl(5, 8, 80, 7), '#7b5230'); tr.position.y = 40; g.add(tr);
      for (const [x, y, r] of [[0, 100, 30], [-26, 86, 22], [26, 88, 22], [-12, 118, 18], [14, 116, 18]]) { const l = mesh(G.ico(r, 0), '#5c8a4a'); l.position.set(x, y, (x % 3) * 4); g.add(l); }
      const ring = new T.Mesh(G.cyl(90, 90, 2, 24), new T.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.18, depthWrite: false })); ring.position.y = 2; g.add(ring);
    } else if (type === 'lion') {
      const b = mesh(G.sph(46, 10, 8), '#d4a03a'); b.scale.set(1, 0.5, 0.55); b.position.y = 40; g.add(b);
      const mane = mesh(G.ico(28, 1), '#8b4513'); mane.position.set(42, 56, 0); g.add(mane);
      const f = mesh(G.sph(17, 9, 7), '#e0b04a'); f.position.set(52, 54, 0); g.add(f);
      for (const z of [6, -6]) { const e = mesh(G.sph(2.5, 5, 4), '#111', { outline: false }); e.position.set(66, 60, z); g.add(e); }
      const legs = []; for (const x of [-30, 30]) for (const z of [12, -12]) { const p = new T.Group(); p.position.set(x, 30, z); g.add(p); p.add(limbDown(30, 6, 5, '#c4902a')); legs.push(p); }
      const tail = limbX(30, 2.5, 2, '#c4902a'); tail.position.set(-44, 46, 0); tail.rotation.z = 2.6; g.add(tail);
      g.userData = { legs };
    }
    return g;
  }
  function buildItem(kind) {
    const g = new T.Group();
    const wmap = { jawbone: 'jawbone', goliath: 'goliath', shofar: 'shofar', jar: 'jar', peg: 'peg', hail: 'hail', staff: 'aharon', sling: 'sling' };
    if (wmap[kind]) {
      const w = buildWeapon(wmap[kind], kind === 'goliath' ? 0.55 : 0.9);
      const box = new T.Box3().setFromObject(w), c = box.getCenter(new T.Vector3()); w.position.sub(c); g.add(w);
      if (kind === 'jar') g.userData.flame = new T.Vector3(0, 18, 0);
    } else if (kind === 'manna') {
      for (const [x, y, z] of [[-7, 0, 0], [6, 2, 3], [0, 8, -2], [8, 9, 1], [-5, 10, 3]]) { const m = mesh(G.sph(6, 7, 5), '#fbf5e0'); m.position.set(x, y - 4, z); m.scale.y = 0.7; g.add(m); }
    } else if (kind === 'honey') {
      const hex = mesh(G.cyl(12, 12, 8, 6), '#f5b041', { emissive: '#6b3d00', ei: 0.3 }); hex.rotation.x = Math.PI / 2; g.add(hex);
      const d = mesh(G.sph(3, 6, 4), '#ffcc33'); d.position.set(0, -12, 4); g.add(d);
    } else if (kind === 'ruach') {
      g.add(new T.Mesh(G.sph(18, 16, 12), new T.MeshToonMaterial({ color: '#fff7c0', emissive: new T.Color('#ffd23a'), emissiveIntensity: 0.9, gradientMap: gradMap })));
      const sh = (rot) => { const s = new T.Shape(); for (let i = 0; i < 3; i++) { const a = rot + i * TAU / 3; const x = Math.cos(a) * 15, y = Math.sin(a) * 15; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); const h = new T.Path(); for (let i = 0; i < 3; i++) { const a = rot + i * TAU / 3; const x = Math.cos(a) * 10.5, y = Math.sin(a) * 10.5; i ? h.lineTo(x, y) : h.moveTo(x, y); } h.closePath(); s.holes.push(h); return s; };
      const md = new T.Group(); for (const r of [Math.PI / 2, -Math.PI / 2]) { const m = new T.Mesh(new T.ExtrudeGeometry(sh(r), { depth: 2, bevelEnabled: false }), new T.MeshBasicMaterial({ color: '#c99700' })); m.position.z = 18; md.add(m); }
      g.add(md); g.userData.md = md;
      const gl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#fff3a0', transparent: true, depthWrite: false, blending: T.AdditiveBlending })); gl.scale.set(110, 110, 1); g.add(gl);
    }
    return g;
  }
  function buildProj(p) {
    const g = new T.Group();
    switch (p.type) {
      case 'arrow': { const s = limbX(28, 1, 1, '#8b5a2b'); s.position.x = -14; g.add(s); const t = mesh(G.cone(3, 7, 4), '#ccc'); t.rotation.z = -Math.PI / 2; t.position.x = 16; g.add(t); for (const z of [2, -2]) { const fl = mesh(G.box(6, 4, 0.6), '#e74c3c', { outline: false }); fl.position.set(-13, 0, z); g.add(fl); } break; }
      case 'dustsword': { const w = buildWeapon('sword', 0.75); w.position.x = -20; g.add(w); g.userData.sword = w; w.visible = false; break; }
      case 'stone': g.add(mesh(G.ico(p.w / 2, 0), '#8f8f8f')); break;
      case 'hail': g.add(mesh(G.ico(p.w / 2, 0), '#d6eaf8', { emissive: '#3a6f9a', ei: 0.3 })); break;
      case 'geyser': { const c = new T.Mesh(G.cyl(p.w * 0.25, p.w * 0.55, p.h, 10, 1, true), new T.MeshToonMaterial({ color: '#5aaeff', gradientMap: gradMap, transparent: true, opacity: 0.75, emissive: new T.Color('#0a3a7a') })); g.add(c); g.userData.col = c; break; }
      case 'sound': { for (let i = 0; i < 3; i++) { const r = new T.Mesh(G.tor(20 + i * 12, 2.2, 4, 18, 1.6), new T.MeshBasicMaterial({ color: '#fff0b4', transparent: true, opacity: 0.8 })); r.rotation.z = -0.8; r.position.x = -(20 + i * 12); g.add(r); } break; }
      case 'firebolt': { const c = new T.Mesh(G.cone(p.w * 0.5, p.h, 8), new T.MeshToonMaterial({ color: '#ff7a1a', emissive: new T.Color('#ff3300'), emissiveIntensity: 1, gradientMap: gradMap })); c.rotation.z = Math.PI; g.add(c); break; }
      case 'torch': { const w = buildWeapon('torch', 0.8); w.position.x = -12; g.add(w); g.userData.flame = new T.Vector3(14, 3, 0); break; }
      case 'milk': { const w = buildWeapon('bowl', 1); w.position.x = -10; g.add(w); break; }
      case 'peg': { const w = buildWeapon('peg', 0.9); w.position.x = -16; g.add(w); break; }
      case 'star': { const s = new T.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 0.45 : 1) * p.w / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath();
        const geo = new T.ExtrudeGeometry(s, { depth: 6, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 2, bevelSegments: 1 }); geo.translate(0, 0, -3);
        g.add(new T.Mesh(geo, new T.MeshToonMaterial({ color: '#fff3a0', emissive: new T.Color('#ffc400'), emissiveIntensity: 0.9, gradientMap: gradMap }))); break; }
      case 'javelin': { const s = limbX(56, 2, 2, '#6b4423'); s.position.x = -30; g.add(s); const t = mesh(G.cone(6, 12, 4), '#999'); t.rotation.z = -Math.PI / 2; t.position.x = 30; g.add(t); break; }
      case 'item': g.add(buildItem(p.itemKind || 'hail')); break;
      default: g.add(mesh(G.box(p.w, p.h, 10), '#fff'));
    }
    return g;
  }

  /* ---------- finals ---------- */
  const SOLDIER = { id: 'soldier', h: 90, w: 46, arch: 'fists', look: { skin: '#6b4a33', robe: '#2c2c3a', robe2: '#3d3d50', beard: '#1d1d1d', hair: '#1d1d1d', head: 'kerchief', headColor: '#3a3a4a', weapon: 'none', beardLen: 0.6 } };
  function buildFinal(F) {
    const g = new T.Group(), kind = F.fin.kind;
    if (kind === 'sweep') { g.userData.men = []; for (let i = 0; i < 9; i++) { const R = buildRig(SOLDIER); g.add(R.root); const w = weaponFor(R, F.fin.sprite === 'shofars' ? 'shofar' : (i % 2 ? 'torch' : 'spear')); w.visible = true; R.fixedWeapon = w; g.userData.men.push(R); } }
    if (kind === 'flood') { const m = new T.MeshToonMaterial({ color: '#2a7fd4', gradientMap: gradMap, transparent: true, opacity: 0.82, emissive: new T.Color('#06305e') }); for (const s of [-1, 1]) { const w = new T.Mesh(G.box(1, 1100, 700), m); w.userData.s = s; g.add(w); } }
    if (kind === 'pillars') for (const s of [-1, 1]) {
      const pv = new T.Group(); pv.position.set(s * 560, 0, -30); pv.userData.s = s; g.add(pv);
      const c = mesh(G.cyl(30, 34, 600, 12), '#e0cfa6'); c.position.y = 310; pv.add(c);
      for (const y of [10, 615]) { const cap = mesh(G.box(88, 26, 88), '#c9b38a'); cap.position.y = y; pv.add(cap); }
    }
    if (kind === 'giant') { const m = F.fin.sprite === 'golem' ? buildGolem(2.6) : buildMinion('lion'); if (F.fin.sprite !== 'golem') m.scale.setScalar(2.4); g.add(m); g.userData.m = m; }
    if (kind === 'beam') {
      if (F.fin.sprite === 'megastone') { const s = mesh(G.ico(70, 1), '#8f8f8f'); g.add(s); g.userData.stone = s; }
      else { const b = new T.Mesh(G.cyl(150, 150, 2600, 16, 1, true), new T.MeshBasicMaterial({ color: '#fffbd0', transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); b.rotation.z = Math.PI / 2; g.add(b); g.userData.beam = b; }
    }
    return g;
  }
  function updateFinal(F, g, W) {
    const t = F.t - 30, f = F.owner, fin = F.fin;
    g.visible = t >= 0; if (t < 0) return;
    if (fin.kind === 'sweep' && F.data.x !== undefined) {
      g.userData.men.forEach((R, i) => {
        const P = { fa: -0.6, ba: 0.4, lean: 0.15, legA: Math.sin(W.t * 0.5 + i) * 0.7, legB: -Math.sin(W.t * 0.5 + i) * 0.7, crouch: 0, spin: 0, bob: Math.abs(Math.sin(W.t * 0.5 + i)) * -3, tuck: 0, weaponOut: true, eyes: 'o' };
        poseRigBasic(R, P, W);
        R.root.position.set(F.data.x - F.dir * (i % 3) * 40, 0, -((i / 3) | 0) * 45 + 40);
        R.yaw.scale.x = F.dir; R.yaw.rotation.y = -0.5 * F.dir;
        if (R.fixedWeapon) R.fixedWeapon.visible = true;
      });
    }
    if (fin.kind === 'flood') {
      const p = Math.min(1, (F.data.p || 0) * 1.6), L = W.stage.blast.l * 0.55, Rr = W.stage.blast.r * 0.55;
      const lx = L + (0 - L) * p, rx = Rr - Rr * p;
      g.children.forEach(w => { const s = w.userData.s; const edge = s < 0 ? lx : rx, far = s < 0 ? L - 600 : Rr + 600; w.scale.x = Math.abs(edge - far); w.position.set((edge + far) / 2, 250, 0); });
      for (let i = 0; i < 14; i++) { const y = -300 + i * 80; P.dot.add(lx + Math.sin(i + W.t * 0.2) * 12, y, 360, '#ffffff', 30, 0.8); P.dot.add(rx + Math.sin(i + W.t * 0.2) * 12, y, 360, '#ffffff', 30, 0.8); }
    }
    if (fin.kind === 'pillars') { const p = F.data.p || 0, ang = (p * p * (3 - 2 * p)) * 1.25; g.children.forEach(pv => { pv.rotation.z = pv.userData.s * ang; }); }
    if (fin.kind === 'giant' && F.data.x !== undefined) {
      const m = g.userData.m; m.position.set(F.data.x, 0, 0); m.scale.x = Math.abs(m.scale.x) * F.dir;
      const ud = m.userData; if (ud.legs) ud.legs.forEach((l, i) => { l.rotation.z = Math.sin(W.t * 0.3 + i * 1.6) * 0.5; });
      if (ud.arms) ud.arms.forEach((a, i) => { a.rotation.z = (t % 40) > 20 && i === 0 ? 0 : -1.0; });
    }
    if (fin.kind === 'beam') {
      const p = F.data.p || 0;
      if (g.userData.stone) { g.userData.stone.position.set(f.x + F.dir * (60 + p * 1600), -f.cy, 0); g.userData.stone.rotation.z -= 0.3 * F.dir; }
      if (g.userData.beam) { const b = g.userData.beam; b.position.set(f.x + F.dir * 1300, -f.cy, 0); b.material.opacity = Math.sin(Math.min(1, p * 2) * Math.PI) * 0.75; }
    }
  }
  function poseRigBasic(R, P, W) { poseRig(R, null, W, P); for (const key in R.weapons) R.weapons[key].visible = R.weapons[key] === R.fixedWeapon; }

  /* ---------- stage & scenery ---------- */
  const stageCache = new Map();
  let curStage = null;
  const PAL = {
    elah: ['#6aa84f', '#8b6b47', '#6d5236'], sinai: ['#6b5a73', '#4a3d52', '#362c3d'], yericho: ['#d9b77e', '#b08850', '#8c6a3b'], carmel: ['#7d9a5c', '#7b6150', '#5c4738'],
    michmash: ['#c9a97c', '#a68660', '#7d6346'], yamsuf: ['#e4c89a', '#c9a878', '#a88a5c'], prague: ['#a33a30', '#5c3a2e', '#3e2a22'], midbar: ['#e6b980', '#c79257', '#a67542']
  };
  const LIGHT = {
    elah: { hemi: ['#ddeeff', '#5d6b3a', 1.6], sun: ['#fff4dc', 2.2], amb: 0.25 }, sinai: { hemi: ['#8a76a8', '#2a1f33', 1.3], sun: ['#ffb27a', 1.6], amb: 0.25 },
    yericho: { hemi: ['#ffe2b8', '#7a5530', 1.5], sun: ['#ffd29a', 2.2], amb: 0.25 }, carmel: { hemi: ['#d9a9d6', '#3d2b33', 1.4], sun: ['#ffb060', 2.0], amb: 0.25 },
    michmash: { hemi: ['#e8f1ff', '#7a6040', 1.6], sun: ['#fff1d0', 2.2], amb: 0.25 }, yamsuf: { hemi: ['#c8eaff', '#3d6a7a', 1.6], sun: ['#ffffff', 2.0], amb: 0.3 },
    prague: { hemi: ['#7d8fc7', '#1a1c2a', 1.1], sun: ['#cfd8ff', 1.3], amb: 0.3 }, midbar: { hemi: ['#fff1d8', '#8a6238', 1.6], sun: ['#fff0d0', 2.4], amb: 0.25 }
  };
  function skyTex(stage) { return canvasTex(8, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, stage.sky[0]); g.addColorStop(1, stage.sky[1]); x.fillStyle = g; x.fillRect(0, 0, w, h); }); }

  function buildStage(st) {
    const root = new T.Group(), pal = PAL[st.deco] || ['#888', '#666', '#444'], D = 300;
    const anim = [];
    // fighting ground
    for (const g of st.ground) {
      const sh = new T.Shape(); const deep = g.h > 200;
      sh.moveTo(g.x, -g.y); sh.lineTo(g.x + g.w, -g.y);
      if (deep) { sh.lineTo(g.x + g.w, -(g.y + g.h)); sh.lineTo(g.x, -(g.y + g.h)); }
      else { sh.lineTo(g.x + g.w - 30, -(g.y + g.h)); sh.lineTo(g.x + g.w / 2 + 60, -(g.y + g.h + 90)); sh.lineTo(g.x + g.w / 2, -(g.y + g.h + 150)); sh.lineTo(g.x + g.w / 2 - 70, -(g.y + g.h + 80)); sh.lineTo(g.x + 30, -(g.y + g.h)); }
      sh.closePath();
      const geo = new T.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelSize: 6, bevelThickness: 6, bevelSegments: 1 }); geo.translate(0, 0, -D / 2);
      const m = new T.Mesh(geo, toon(pal[1])); m.receiveShadow = true; root.add(m);
      const top = new T.Mesh(G.box(g.w + 10, 12, D + 14), toon(pal[0])); top.position.set(g.x + g.w / 2, -g.y - 5, 0); top.receiveShadow = true; root.add(top);
      if (st.deco === 'prague') for (let x = g.x + 20; x < g.x + g.w; x += 40) { const t = new T.Mesh(G.cyl(9, 9, D + 10, 6, 1, false, 0, Math.PI), toon('#7b2d26')); t.rotation.x = Math.PI / 2; t.rotation.y = Math.PI / 2; t.position.set(x, -g.y - 10, 0); root.add(t); }
      // rocks / grass tufts
      for (let i = 0; i < g.w / 70; i++) { const r = new T.Mesh(G.ico(8 + (i % 3) * 5, 0), toon(pal[2])); r.position.set(g.x + 30 + i * 70 + (i * 17) % 23, -g.y - 30 - (i * 29) % 40, D / 2 + 4); root.add(r); }
      if (st.deco === 'elah' || st.deco === 'carmel') {
        const n = Math.floor(g.w / 7), im = new T.InstancedMesh(G.cone(3, 9, 3), toon('#4f8f3a'), n * 2), mt = new T.Matrix4();
        for (let i = 0; i < n * 2; i++) { mt.makeTranslation(g.x + 4 + (i % n) * 7 + (i * 13 % 5), -g.y + 5, i < n ? D / 2 + 4 - (i * 7 % 30) : -D / 2 + (i * 11 % 40)); im.setMatrixAt(i, mt); }
        root.add(im);
      }
    }
    if (st.deco === 'michmash') {
      st.ground.forEach((g, i) => { const tex = canvasTex(256, 96, (x) => { x.fillStyle = 'rgba(255,255,255,.85)'; x.font = 'bold 64px "Frank Ruhl Libre", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(i ? 'סֶנֶּה' : 'בּוֹצֵץ', 128, 50); });
        const p = new T.Mesh(new T.PlaneGeometry(150, 56), new T.MeshBasicMaterial({ map: tex, transparent: true })); p.position.set(g.x + g.w / 2, -g.y - 70, D / 2 + 8); root.add(p); });
    }
    // soft platforms
    const walls = [];
    for (const p of st.plats) {
      if (p.cloud) { const c = new T.Group(); for (let i = 0; i < 6; i++) { const s = new T.Mesh(G.ico(20, 1), toon('#ffffff', { emissive: '#555', ei: 0.3 })); s.position.set(p.x + 18 + i * (p.w - 36) / 5, -p.y - 8, (i % 2) * 30 - 15); c.add(s); } root.add(c); anim.push((t) => { c.children.forEach((s, i) => s.position.y = -p.y - 8 + Math.sin(t * 0.05 + i) * 2); }); continue; }
      if (p.altar) {
        for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { const s = new T.Mesh(G.box(38, 25, 60), toon(r % 2 ? '#9a8f80' : '#8d8273')); s.position.set(p.x + 39 + q * 40, -p.y - 13 - r * 27, 0); s.castShadow = s.receiveShadow = true; root.add(s); }
        for (let i = 0; i < 4; i++) { const l = new T.Mesh(G.cyl(5, 5, 70, 6), toon('#7b5230')); l.rotation.x = Math.PI / 2; l.position.set(p.x + 36 + i * 28, -p.y + 5, 0); root.add(l); }
        const warn = new T.Mesh(G.box(p.w, 150, 80), new T.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0, depthWrite: false })); warn.position.set(p.x + p.w / 2, -p.y + 75, 0); root.add(warn); root.userData.altarWarn = warn;
        continue;
      }
      if (p.wall) {
        const wg = new T.Group(); const brick = canvasTex(128, 64, (x) => { x.fillStyle = '#c9a36b'; x.fillRect(0, 0, 128, 64); x.strokeStyle = '#8c6a3b'; x.lineWidth = 3; for (let r = 0; r < 4; r++) for (let c = -1; c < 5; c++) x.strokeRect(c * 32 + (r % 2) * 16, r * 16, 32, 16); });
        brick.wrapS = brick.wrapT = T.RepeatWrapping; brick.repeat.set(p.w / 64, 1);
        const b = new T.Mesh(G.box(p.w, 30, 120), new T.MeshToonMaterial({ map: brick, gradientMap: gradMap })); b.position.set(p.x + p.w / 2, -p.y - 15, 0); b.castShadow = b.receiveShadow = true; wg.add(b);
        for (let x = p.x + 8; x < p.x + p.w; x += 30) { const c = new T.Mesh(G.box(16, 12, 120), toon('#c9a36b')); c.position.set(x, -p.y + 6, 0); wg.add(c); }
        const warn = new T.Mesh(G.box(p.w + 4, 34, 124), new T.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0, depthWrite: false })); warn.position.copy(b.position); wg.add(warn);
        const rub = new T.Group(); for (let i = 0; i < 7; i++) { const r = new T.Mesh(G.box(22, 14, 30), toon('#b08850')); r.position.set(p.x + 15 + i * p.w / 7, -p.y - 60 - (i % 2) * 12, (i % 3) * 20 - 20); r.rotation.z = i; rub.add(r); }
        root.add(wg); root.add(rub); walls.push({ wg, rub, warn }); continue;
      }
      const pl = new T.Mesh(G.box(p.w, 14, 90), toon(pal[1])); pl.position.set(p.x + p.w / 2, -p.y - 7, 0); pl.castShadow = pl.receiveShadow = true; root.add(pl);
      const tp = new T.Mesh(G.box(p.w + 4, 6, 94), toon(pal[0])); tp.position.set(p.x + p.w / 2, -p.y - 1, 0); tp.receiveShadow = true; root.add(tp);
    }
    root.userData.walls = walls;
    // lightning column + bolt
    if (st.hazard === 'lightning') {
      const col = new T.Mesh(G.box(80, 1000, 80), new T.MeshBasicMaterial({ color: '#ffff80', transparent: true, opacity: 0, depthWrite: false })); col.position.y = 500; root.add(col); root.userData.lcol = col;
      const bolt = new T.Group(); let px = 0, py = 1000; for (let i = 0; i < 12; i++) { const nx = (Math.random() - 0.5) * 50, ny = py - 85; const len = Math.hypot(nx - px, ny - py); const s = new T.Mesh(G.box(7, len, 7), new T.MeshBasicMaterial({ color: '#fffbe0' })); s.position.set((px + nx) / 2, (py + ny) / 2, 0); s.rotation.z = Math.atan2(nx - px, -(ny - py)) * -1; bolt.add(s); px = nx; py = ny; }
      bolt.visible = false; root.add(bolt); root.userData.bolt = bolt;
    }
    scenery(st, root, anim);
    root.userData.anim = anim; root.userData.sky = skyTex(st);
    return root;
  }

  function scenery(st, root, anim) {
    const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
    const tm = (c, o) => toon(c, o);
    const hill = (x, z, r, col, sy = 0.5) => { const h = new T.Mesh(G.sph(r, 12, 8), tm(col)); h.scale.y = sy; return add(h, x, -40, z); };
    const tree = (x, z, s = 1) => { const g = new T.Group(); const tr = new T.Mesh(G.cyl(5 * s, 8 * s, 60 * s, 6), tm('#6d4c2f')); tr.position.y = 30 * s; g.add(tr); for (const [dx, dy, r] of [[0, 78, 34], [-26, 62, 24], [26, 64, 26]]) { const l = new T.Mesh(G.ico(r * s, 0), tm('#4f7c3c')); l.position.set(dx * s, dy * s, 0); g.add(l); } return add(g, x, -10, z); };
    const palm = (x, z, s = 1) => { const g = new T.Group(); for (let i = 0; i < 6; i++) { const seg = new T.Mesh(G.cyl(5 * s, 6 * s, 20 * s, 6), tm('#7a5a3a')); seg.position.set(i * 2 * s, i * 19 * s + 10, 0); g.add(seg); } for (let i = 0; i < 7; i++) { const lf = new T.Mesh(G.box(70 * s, 3, 14 * s), tm('#3e7d3a')); lf.geometry.translate(35 * s, 0, 0); lf.position.set(12 * s, 120 * s, 0); lf.rotation.y = i * TAU / 7; lf.rotation.z = -0.45; g.add(lf); } return add(g, x, -10, z); };
    const cloud = (x, y, z, s, col = '#ffffff') => { const g = new T.Group(); for (const [dx, dy, r] of [[0, 0, 40], [42, 12, 50], [88, 0, 38], [44, -14, 36]]) { const c = new T.Mesh(G.ico(r * s, 1), tm(col, { emissive: '#444', ei: 0.35 })); c.position.set(dx * s, dy * s, 0); g.add(c); } add(g, x, y, z); anim.push((t) => { g.position.x = x + ((t * 0.3) % 3000) - 1500; }); return g; };
    const sunS = (x, y, z, r, col) => { const s = new T.Mesh(G.sph(r, 16, 12), new T.MeshBasicMaterial({ color: col })); add(s, x, y, z); const gl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: col, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })); gl.scale.set(r * 6, r * 6, 1); add(gl, x, y, z - 10); };
    switch (st.deco) {
      case 'elah':
        sunS(1500, 1500, -4500, 160, '#fff6c4');
        for (let i = 0; i < 7; i++) cloud(-2500 + i * 900, 900 + (i % 3) * 200, -3800, 2.5);
        for (let i = 0; i < 9; i++) hill(-3200 + i * 800, -2600 - (i % 2) * 400, 700 + (i % 3) * 150, i % 2 ? '#8cbf7a' : '#9cc78a', 0.45);
        for (let i = 0; i < 12; i++) tree(-1600 + i * 290 + (i % 3) * 40, -500 - (i % 3) * 250, 1.2 + (i % 2) * 0.4);
        add(new T.Mesh(G.box(9000, 4, 160), tm('#6cb7e6', { emissive: '#1e5f8c', ei: 0.3 })), 0, -260, -900);
        add(new T.Mesh(G.box(9000, 6, 4000), tm('#7fb069')), 0, -290, -2500);
        break;
      case 'sinai': {
        const mt = new T.Mesh(G.cone(2600, 2600, 9), tm('#3d2f45')); add(mt, 0, 900, -4200);
        add(new T.Mesh(G.cone(1600, 1200, 7), tm('#2e2436')), -2200, 200, -3000); add(new T.Mesh(G.cone(1500, 1100, 7), tm('#2e2436')), 2300, 150, -3000);
        anim.push((t) => { for (let i = 0; i < 10; i++) { const k = ((t * 0.6 + i * 60) % 600); P.smoke.add(Math.sin(i * 1.7 + t * 0.01) * 200, 2200 + k * 1.5, -4100, '#7a6e86', 500 + k, 0.5 * (1 - k / 600)); } P.flame.add(0, 2180, -4050, '#ffffff', 420 + Math.sin(t * 0.3) * 40, 1); });
        for (let i = 0; i < 5; i++) cloud(-2500 + i * 1200, 1300 + (i % 2) * 300, -3600, 2.6, '#5b4f6b');
        add(new T.Mesh(G.box(9000, 6, 4000), tm('#2e2436')), 0, -300, -2400);
        break;
      }
      case 'yericho':
        sunS(-1400, 900, -4500, 220, '#ffd27a');
        for (let i = 0; i < 8; i++) hill(-3200 + i * 900, -2800, 800, '#d9a066', 0.35);
        { const wall = new T.Mesh(G.box(6000, 220, 120), tm('#c9a36b')); add(wall, 0, 70, -2000); for (let x = -3000; x < 3000; x += 110) add(new T.Mesh(G.box(60, 50, 120), tm('#c9a36b')), x, 205, -2000); for (let x = -2600; x < 2800; x += 900) add(new T.Mesh(G.box(180, 360, 160), tm('#b8925a')), x, 140, -1990); }
        for (let i = 0; i < 12; i++) palm(-1700 + i * 300, -500 - (i % 3) * 300, 1.3);
        add(new T.Mesh(G.box(9000, 6, 4000), tm('#d9b077')), 0, -290, -2400);
        break;
      case 'carmel':
        sunS(1200, 250, -4600, 260, '#ffb347');
        add(new T.Mesh(G.box(12000, 6, 5000), tm('#2e5e8c', { emissive: '#0d2c4d', ei: 0.4 })), 0, -320, -3500);
        for (let i = 0; i < 6; i++) hill(-3000 + i * 700, -1600, 600 + (i % 2) * 200, '#4a3b52', 0.6);
        for (let i = 0; i < 8; i++) tree(-1500 + i * 400, -600 - (i % 2) * 300, 1.4);
        break;
      case 'michmash':
        for (let i = 0; i < 6; i++) cloud(-2400 + i * 1000, 1100 + (i % 2) * 300, -3600, 2.4);
        for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const c = new T.Mesh(G.cyl(300 + i * 60, 420 + i * 80, 1600 - i * 200, 7), tm(i % 2 ? '#c4a57b' : '#a8865a')); add(c, s * (1500 + i * 500), 300, -900 - i * 700); }
        add(new T.Mesh(G.box(9000, 6, 5000), tm('#a8865a')), 0, -700, -2500);
        break;
      case 'yamsuf': {
        for (const s of [-1, 1]) {
          const w = new T.Mesh(G.box(1600, 2600, 3200), toon('#2e8bc0', { emissive: '#0b3d63', ei: 0.5, opacity: 0.9 })); add(w, s * 1750, 400, -2700);
          anim.push((t) => { for (let i = 0; i < 18; i++) P.dot.add(s * 950 + Math.sin(i + t * 0.05) * 20, -300 + i * 140, -1150 - (i % 4) * 400, '#ffffff', 60, 0.6); });
        }
        const fishes = []; for (let i = 0; i < 14; i++) { const f = new T.Group(); const b = new T.Mesh(G.sph(14, 7, 5), tm(['#f39c12', '#e74c3c', '#f1c40f', '#1abc9c'][i % 4])); b.scale.set(1.8, 1, 0.6); f.add(b); const tl = new T.Mesh(G.cone(10, 16, 4), tm('#e67e22')); tl.rotation.z = Math.PI / 2; tl.position.x = -28; f.add(tl); root.add(f); fishes.push(f); }
        anim.push((t) => fishes.forEach((f, i) => { const s = i % 2 ? 1 : -1; f.position.set(s * (1000 + ((t * (1 + i % 3) + i * 300) % 1000)), -100 + (i * 190) % 1500, -1200 - (i * 230) % 2000); }));
        add(new T.Mesh(G.box(1400, 6, 5000), tm('#e4c89a')), 0, -280, -2400);
        for (let i = 0; i < 6; i++) add(new T.Mesh(G.ico(30 + i * 6, 0), tm('#9b8a6a')), -500 + i * 200, -260, -600 - i * 150);
        break;
      }
      case 'prague': {
        const moon = new T.Mesh(G.sph(150, 16, 12), new T.MeshBasicMaterial({ color: '#f5f3ce' })); add(moon, 1500, 1500, -4500);
        const starsG = new T.BufferGeometry(); const sp = []; for (let i = 0; i < 300; i++) sp.push((Math.random() - 0.5) * 10000, 400 + Math.random() * 3500, -4800); starsG.setAttribute('position', new T.Float32BufferAttribute(sp, 3)); add(new T.Points(starsG, new T.PointsMaterial({ color: '#ffffff', size: 6, fog: false })), 0, 0, 0);
        const roofSh = new T.Shape(); roofSh.moveTo(-60, 0); roofSh.lineTo(0, 60); roofSh.lineTo(60, 0); roofSh.closePath();
        const winTex = canvasTex(64, 128, (x) => { x.fillStyle = '#1b2638'; x.fillRect(0, 0, 64, 128); x.fillStyle = '#ffd678'; for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) if ((r + c) % 3) x.fillRect(10 + c * 28, 14 + r * 38, 14, 20); });
        for (let i = 0; i < 18; i++) {
          const h = 260 + (i * 97) % 300, x = -2600 + i * 300, z = -700 - (i % 3) * 500;
          const house = new T.Mesh(G.box(220, h, 200), [toon('#1b2638'), toon('#1b2638'), toon('#1b2638'), toon('#1b2638'), new T.MeshToonMaterial({ map: winTex, gradientMap: gradMap, emissive: new T.Color('#ffffff'), emissiveMap: winTex, emissiveIntensity: 0.45 }), toon('#1b2638')]);
          add(house, x, -250 + h / 2, z);
          const roof = new T.Mesh(new T.ExtrudeGeometry(roofSh, { depth: 200, bevelEnabled: false }), toon('#3a1f1c')); roof.scale.x = 2; roof.position.set(x, -250 + h, z - 100); root.add(roof);
        }
        { const sh = new T.Shape(); sh.moveTo(-240, 0); sh.lineTo(-240, 240); for (let s = 0; s < 5; s++) { sh.lineTo(-240 + s * 48, 240 + s * 44 + 44); sh.lineTo(-240 + (s + 1) * 48, 240 + s * 44 + 44); } for (let s = 4; s >= 0; s--) { sh.lineTo(240 - s * 48, 240 + s * 44 + 44); sh.lineTo(240 - s * 48 - 0, 240 + s * 44); } sh.lineTo(240, 240); sh.lineTo(240, 0); sh.closePath();
          const al = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 160, bevelEnabled: false }), toon('#2a3446')); add(al, 0, -260, -1900); }
        break;
      }
      case 'midbar': default:
        sunS(0, 1500, -4500, 170, '#fffbe6');
        for (let i = 0; i < 10; i++) hill(-3600 + i * 800, -2200 - (i % 2) * 600, 900, i % 2 ? '#e8b77d' : '#d79d5f', 0.3);
        { const pc = new T.Group(); for (let i = 0; i < 12; i++) { const c = new T.Mesh(G.ico(130 - i * 5, 1), tm('#ffffff', { emissive: '#666', ei: 0.4 })); c.position.set(Math.sin(i) * 30, i * 150, 0); pc.add(c); } add(pc, -1800, 0, -2600); anim.push((t) => pc.children.forEach((c, i) => c.position.x = Math.sin(i + t * 0.02) * 40)); }
        add(new T.Mesh(G.box(9000, 6, 5000), tm('#e6b980')), 0, -290, -2500);
        break;
    }
  }

  function setStage(st) {
    if (curStage === st.id) return;
    for (const [, g] of stageCache) g.visible = false;
    let g = stageCache.get(st.id);
    if (!g) { g = buildStage(st); stageCache.set(st.id, g); scene.add(g); }
    g.visible = true; curStage = st.id;
    scene.background = g.userData.sky;
    const Lc = LIGHT[st.deco] || LIGHT.elah;
    hemi.color.set(Lc.hemi[0]); hemi.groundColor.set(Lc.hemi[1]); hemi.intensity = Lc.hemi[2];
    sun.color.set(Lc.sun[0]); sun.intensity = Lc.sun[1]; amb.intensity = Lc.amb;
    scene.fog = new T.Fog(new T.Color(st.sky[1]), 3000, 9000);
  }

  /* ---------- per-world object management ---------- */
  const objMap = new Map(); // game object -> three object
  let seen = new Set();
  function obtain(key, build, parent = dyn) {
    let o = objMap.get(key);
    if (!o) { o = build(); objMap.set(key, o); parent.add(o); }
    seen.add(key); o.visible = true; return o;
  }
  function sweep() {
    for (const [k, o] of objMap) if (!seen.has(k)) { o.parent && o.parent.remove(o); objMap.delete(k); disposeTree(o); }
    seen = new Set();
  }
  function disposeTree(o) { o.traverse(c => { if (c.isMesh && c.geometry && !c.userData.shared) c.geometry.dispose(); }); }

  function syncWorld(W) {
    setStage(W.stage);
    const st = stageCache.get(W.stage.id);
    for (const fn of st.userData.anim) fn(W.t);
    // hazards
    for (const w of st.userData.walls) { const down = W.wallsDown > 0; w.wg.visible = !down; w.rub.visible = down; w.warn.material.opacity = W.hazard && W.hazard.t < 50 && W.stage.hazard === 'walls' ? 0.25 + 0.2 * Math.sin(W.t * 0.5) : 0; }
    if (st.userData.altarWarn) st.userData.altarWarn.material.opacity = W.hazard && W.stage.hazard === 'fire' && W.hazard.t < 60 ? 0.15 + 0.12 * Math.sin(W.t * 0.4) : 0;
    if (st.userData.lcol) { const H = W.hazard; st.userData.lcol.material.opacity = H && H.t < 70 ? 0.12 + 0.12 * Math.sin(H.t * 0.5) : 0; if (H) st.userData.lcol.position.x = H.x; st.userData.bolt.visible = !!(H && H.t >= 70 && H.t < 82); if (H) st.userData.bolt.position.x = H.x; }

    // fighters
    for (const f of W.fighters) {
      const R = obtain(f, () => { const r = buildRig(f.hero); r.root.userData.rig = r; return r.root; }).userData.rig;
      const root = R.root;
      if (f.dead) { root.visible = false; continue; }
      const PS = Art.pose(f, W.t);
      poseRig(R, f, W, PS);
      let sx = f.damageShake > 0 && f.hitlag > 0 ? (Math.random() - 0.5) * 6 : 0;
      if (PS.shake) sx += (Math.random() - 0.5) * PS.shake * 2;
      root.position.set(f.x + sx, -f.y - (f.stun && f.stun.type === 'buried' ? f.h * 0.45 : 0), 0);
      R.yaw.scale.x = f.facing; R.yaw.rotation.y = -0.55 * f.facing;
      const blink = f.invuln > 0 && f.invuln < 9000 && !f.onHalo && Math.floor(W.t / 3) % 2 === 0;
      R.yaw.visible = !blink;
      R.halo.visible = !!f.onHalo;
      R.glow.visible = !!(f.finalReady || f.inFinal); if (R.glow.visible) R.glow.material.opacity = 0.55 + Math.sin(W.t * 0.2) * 0.15;
      R.ice.visible = !!(f.stun && f.stun.type === 'frozen');
      R.dirt.visible = !!(f.stun && f.stun.type === 'buried'); R.dirt.position.y = f.h * 0.45;
      R.shield.visible = f.state === 'shield';
      if (R.shield.visible) { const r = f.h * 0.55 * (0.35 + 0.65 * f.shieldHP / 100); R.shield.scale.setScalar(r); R.shield.material.color.set(f.color); R.shield.material.emissive.set(f.color).multiplyScalar(0.4); }
      R.reflect.visible = !!f.reflect;
      if (f.reflect) { R.reflect.scale.setScalar(f.reflect.r); R.reflect.rotation.set(W.t * 0.05, W.t * 0.08, 0); R.reflect.material.color.set(f.reflect.absorb ? '#9cf' : '#ffe680'); }
      const m = f.move, fxk = m && m.def.fx;
      R.gates.visible = fxk === 'gates' && m.t >= 6;
      R.chariot.visible = fxk === 'chariot' && m.t >= 8;
      R.axe.visible = fxk === 'axe' && m.t >= 8; if (R.axe.visible) { R.axe.scale.x = f.facing; R.axe.rotation.z = f.facing * 1.1; }
      if (R.chariot.visible) for (let i = 0; i < 4; i++) P.flame.add(f.x + (i - 1.5) * 16, -f.y + 10, 20, '#ffffff', 34, 1);
      if (fxk === 'stars' && m.t >= 6) for (let i = 0; i < 5; i++) P.star.add(f.x + Math.cos(W.t * 0.2 + i * 1.3) * 30, -f.y + f.h * 0.5 + Math.sin(W.t * 0.2 + i * 1.3) * 40, 30, '#ffe680', 16, 1);
      for (const fl of R.flames) P.flame.add(fl.x, fl.y, fl.z, '#ffffff', 22 + Math.sin(W.t * 0.7) * 3, 1);
    }
    // minions
    for (const mn of W.minions) {
      const g = obtain(mn, () => buildMinion(mn.type));
      g.position.set(mn.x, -mn.y, mn.type === 'eshel' ? -30 : 0);
      const d = mn.facing || 1; g.scale.x = Math.abs(g.scale.x) * (mn.type === 'eshel' ? 1 : d);
      const ud = g.userData;
      if (mn.type === 'eshel') { const a = Math.min(1, mn.t / 30); g.scale.set(a, a, a); }
      if (mn.type === 'fox') { ud.legs.forEach((l, i) => l.rotation.z = Math.sin(mn.t * 0.6 + i * 1.6) * 0.7); const fp = g.localToWorld(ud.flame.clone()); P.flame.add(fp.x, fp.y, fp.z, '#ffffff', 26, 1); }
      if (mn.type === 'snake') { ud.segs.forEach((s, i) => s.position.y = 5 + Math.sin(i * 0.9 + mn.t * 0.3) * 3); ud.tongue.scale.x = 0.6 + Math.abs(Math.sin(mn.t * 0.5)) * 0.6; }
      if (mn.type === 'golem') {
        const walk = Math.abs(mn.vx) > 0.5 ? Math.sin(W.t * 0.2) * 0.5 : 0;
        ud.legs[0].rotation.z = walk; ud.legs[1].rotation.z = -walk;
        let a0 = -1.25;
        if (mn.act === 'punch' || mn.act === 'jab' || mn.act === 'charge') a0 = mn.actT > 8 ? 0 : -2.2;
        if (mn.act === 'stomp' || mn.act === 'toss') a0 = mn.actT > 10 ? 1.3 : 0.6;
        ud.arms[0].rotation.z = a0; ud.arms[1].rotation.z = mn.act === 'stomp' || mn.act === 'toss' ? a0 : -1.3;
      }
    }
    // items
    for (const it of W.items) {
      const g = obtain(it, () => buildItem(it.kind));
      g.visible = !(it.life < 120 && Math.floor(W.t / 4) % 2);
      const y = it.kind === 'ruach' ? it.y - 22 : it.y - 14 + (it.grounded ? Math.sin(W.t * 0.08 + (it.bob || 0)) * 2 - 2 : 0);
      g.position.set(it.x, -y, 10); g.rotation.y = W.t * 0.04;
      if (it.kind === 'ruach') { g.rotation.y = 0; g.userData.md.rotation.z = W.t * 0.03; }
      if (g.userData.flame) { const fp = g.localToWorld(g.userData.flame.clone()); P.flame.add(fp.x, fp.y, fp.z, '#ffffff', 22, 1); }
    }
    // projectiles
    for (const p of W.projectiles) {
      const g = obtain(p, () => buildProj(p));
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2, dir = Math.sign(p.vx) || 1;
      g.position.set(cx, -cy, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
      switch (p.type) {
        case 'arrow': case 'peg': case 'javelin': g.rotation.z = -Math.atan2(p.vy, p.vx); break;
        case 'dustsword': if (p.t < 8) { for (let i = 0; i < 4; i++) P.smoke.add(cx + Math.cos(i * 2 + p.t) * 8, -cy + Math.sin(i * 3 + p.t) * 8, 10, '#d2b478', 14, 0.9); g.userData.sword.visible = false; } else { g.userData.sword.visible = true; g.rotation.z = -p.t * 0.5 * dir; } break;
        case 'stone': case 'hail': g.rotation.set(p.t * 0.2, 0, -p.t * 0.25 * dir); break;
        case 'geyser': { const c = g.userData.col; const s = 0.6 + 0.4 * Math.sin(p.t * 0.6); c.scale.y = s; c.position.y = -p.h * (1 - s) / 2; break; }
        case 'sound': g.scale.set(dir * (1 + p.t * 0.02), 1 + p.t * 0.02, 1); g.children.forEach(r => r.material.opacity = Math.max(0, p.life / 45)); break;
        case 'firebolt': P.flame.add(cx, -cy - p.h * 0.5, 10, '#ffffff', 50, 1); break;
        case 'torch': case 'milk': case 'item': g.rotation.z = -p.t * 0.3 * dir; if (g.userData.flame) { const fp = g.localToWorld(g.userData.flame.clone()); P.flame.add(fp.x, fp.y, fp.z, '#ffffff', 22, 1); } break;
        case 'star': g.rotation.z = p.t * 0.15; P.dot.add(cx, -cy, -10, '#ffd700', p.w * 2.2, 0.7); break;
      }
    }
    // fields
    for (const z of W.fields) {
      const fade = Math.min(1, z.life / 40);
      if (z.type === 'snow') {
        const g = obtain(z, () => { const m = new T.Mesh(G.cyl(1, 1, 6, 20), new T.MeshToonMaterial({ color: '#eaf8ff', gradientMap: gradMap, transparent: true, opacity: 0.9, emissive: new T.Color('#5a8aa8') })); m.receiveShadow = true; return m; });
        g.scale.set(z.r, 1, 80); g.position.set(z.x, -z.y + 2, 0); g.material.opacity = 0.9 * fade;
        for (let i = 0; i < 10; i++) P.dot.add(z.x - z.r + ((i * 37 + W.t * 0.6) % (z.r * 2)), -z.y + 70 - ((i * 53 + W.t * 1.3) % 70), (i % 5) * 15 - 30, '#ffffff', 8, fade);
      } else {
        const g = obtain(z, () => new T.Mesh(G.sph(1, 20, 14), new T.MeshBasicMaterial({ color: '#ffec78', transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending })));
        g.scale.setScalar(z.r); g.position.set(z.x, -z.y, 0); g.material.opacity = 0.22 * fade;
        P.dot.add(z.x, -z.y + z.r - 26, 20, '#ffd23a', 60, fade);
      }
    }
    // finals
    for (const F of W.finals) { const g = obtain(F, () => buildFinal(F)); updateFinal(F, g, W); }
    // effects
    for (const e of W.effects) {
      const p = e.t / e.life, x = e.x, y = -e.y;
      switch (e.type) {
        case 'spark': P.dot.add(x, y, 30, e.color, 9, 1 - p); break;
        case 'drop': P.norm.add(x, y, 30, '#78beff', 7, 1 - p); break;
        case 'ring': P.ring.add(x, y, 30, e.color, (e.r + e.t * e.grow) * 2.2, 1 - p); break;
        case 'hitring': P.star.add(x, y, 40, '#fffbd8', e.r * (0.6 + p) * 2.6, 1 - p); P.dot.add(x, y, 38, '#ffffff', e.r * 3, (1 - p) * 0.8); break;
        case 'dust': P.smoke.add(x - 6 - e.t * 1.2, y + 4 + e.t * 0.3, 20, '#ddd2be', 14 + e.t, 0.7 * (1 - p)); P.smoke.add(x + 6 + e.t * 1.2, y + 4 + e.t * 0.3, 20, '#ddd2be', 14 + e.t, 0.7 * (1 - p)); break;
        case 'smoke': P.smoke.add(x, y, 10, '#f0f0f0', 14 + e.t * 1.2, 0.5 * (1 - p)); break;
        case 'flame': P.flame.add(x, y + e.t, 25, '#ffffff', 18 * (1 - p) + 6, 1); break;
        case 'boom': P.dot.add(x, y, 40, '#ffb04a', e.r * (1 + p) * 2.4, 1 - p); P.flame.add(x, y, 42, '#ffffff', e.r * (0.8 + p) * 2, 1 - p); break;
      }
    }
    sweep();
  }

  /* ---------- camera & frame ---------- */
  function setView(cam, vw, vh, hudH, shakeX, shakeY) {
    camera.aspect = vw / vh;
    const visH = vh / cam.z;
    const dist = (visH / 2) / TAN;
    const ty = -(cam.y + hudH / (2 * cam.z));
    camera.position.set(cam.x + shakeX / cam.z, ty - shakeY / cam.z, dist);
    camera.near = Math.max(10, dist * 0.1); camera.far = dist + 9000;
    camera.lookAt(cam.x + shakeX / cam.z, ty - shakeY / cam.z, 0);
    camera.updateProjectionMatrix();
    if (scene.fog) { scene.fog.near = dist + 1800; scene.fog.far = dist + 8000; }
    const ps = renderer.getPixelRatio() * vh / (2 * TAN);
    for (const k in P) P[k].mat.uniforms.scale.value = ps;
    // keep the shadow camera on the action
    sun.position.set(cam.x - 500, -cam.y + 1100, 900); sun.target.position.set(cam.x, -cam.y, 0); sun.target.updateMatrixWorld();
  }

  let lastW = 0, lastH = 0;
  // adaptive quality: if frames are slow for a few seconds, step down resolution, then shadows
  const perf = { last: 0, acc: 0, n: 0, level: 0 };
  function adapt() {
    const now = performance.now();
    if (perf.last) { const dt = now - perf.last; if (dt < 250) { perf.acc += dt; perf.n++; } }
    perf.last = now;
    if (perf.n >= 180) {
      const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
      if (avg > 24 && perf.level < 3) {
        perf.level++;
        if (perf.level === 1) renderer.setPixelRatio(Math.min(1.25, renderer.getPixelRatio()));
        if (perf.level === 2) renderer.setPixelRatio(1);
        if (perf.level === 3) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
        lastW = 0;
      }
    }
  }
  function frame(W, vw, vh, hudH, shakeX, shakeY) {
    if (!ok) return;
    adapt();
    if (W !== curWorld) { for (const [, o] of objMap) { o.parent && o.parent.remove(o); disposeTree(o); } objMap.clear(); curWorld = W; }
    if (vw !== lastW || vh !== lastH) { renderer.setSize(vw, vh, false); lastW = vw; lastH = vh; }
    dyn.visible = true;
    for (const k in P) P[k].reset();
    syncWorld(W);
    for (const k in P) P[k].commit();
    setView(W.cam, vw, vh, hudH, shakeX, shakeY);
    renderer.render(scene, camera);
  }
  let curWorld = null;

  /* ---------- snapshots for menus / HUD ---------- */
  const snapCache = new Map();
  let studio = null;
  function snapshotHero(hero, mode) { // mode: 'full' | 'head'
    const key = hero.id + ':' + mode;
    if (snapCache.has(key)) return snapCache.get(key);
    if (!studio) {
      studio = { scene: new T.Scene(), cam: new T.PerspectiveCamera(26, 1, 10, 5000) };
      studio.scene.add(new T.HemisphereLight('#ffffff', '#554466', 1.8));
      const d = new T.DirectionalLight('#ffffff', 2.2); d.position.set(300, 500, 600); studio.scene.add(d);
    }
    const R = buildRig(hero); R.root.userData.rig = R;
    const full = mode === 'full';
    const Pz = { fa: full ? 0.15 : 1.3, ba: 1.3, lean: 0, legA: 0.22, legB: -0.18, crouch: 0, spin: 0, bob: 0, tuck: 0, weaponOut: true, eyes: 'o' };
    poseRig(R, null, { t: 0 }, Pz);
    if (full) { for (const k in R.weapons) R.weapons[k].rotation.z = -1.2; }
    else { for (const k in R.weapons) R.weapons[k].visible = false; if (R.bowBack) R.bowBack.visible = false; }
    R.yaw.rotation.y = full ? -0.95 : -1.05; studio.scene.add(R.root); R.root.updateMatrixWorld(true);
    const w = mode === 'full' ? 220 : 160, h = mode === 'full' ? 280 : 160;
    const cam = studio.cam; cam.aspect = w / h;
    if (mode === 'full') { const H = hero.h * 1.22; const dist = (H / 2) / Math.tan(13 * Math.PI / 180); cam.position.set(0, hero.h * 0.52, dist); cam.lookAt(0, hero.h * 0.5, 0); }
    else { const hy = R.head.getWorldPosition(new T.Vector3()); const sz = R.hr * 3.4; const dist = (sz / 2) / Math.tan(13 * Math.PI / 180); cam.position.set(hy.x + R.hr * 0.4, hy.y + R.hr * 0.15, dist); cam.lookAt(hy.x + R.hr * 0.2, hy.y, 0); }
    cam.updateProjectionMatrix();
    renderer.setSize(w, h, false); renderer.setClearColor(0x000000, 0);
    const bg = scene.background; renderer.render(studio.scene, cam);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    studio.scene.remove(R.root); disposeTree(R.root);
    renderer.setSize(lastW || 1, lastH || 1, false); renderer.setClearColor(0x000000, 1);
    snapCache.set(key, c); return c;
  }
  function snapshotStage(stage, w, h) {
    const key = 'stage:' + stage.id + ':' + w + 'x' + h;
    if (snapCache.has(key)) return snapCache.get(key);
    const prevStage = curStage; dyn.visible = false; for (const k in P) { P[k].reset(); P[k].commit(); }
    setStage(stage);
    const g = stageCache.get(stage.id); for (const fn of g.userData.anim) fn(0); for (const k in P) P[k].commit();
    renderer.setSize(w, h, false);
    setView({ x: 0, y: -150, z: Math.min(w / 1250, h / 560) }, w, h, 0, 0, 0);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    renderer.setSize(lastW || 1, lastH || 1, false); dyn.visible = true;
    if (prevStage && prevStage !== stage.id) { curStage = null; setStage(STAGE_BY_ID[prevStage]); }
    snapCache.set(key, c); return c;
  }

  /* ---------- init ---------- */
  function init(canvasEl) {
    if (!T) return false;
    try {
      canvas = canvasEl;
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    const mobile = (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(FOV, 16 / 9, 10, 12000);
    const gd = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    gradMap = new T.DataTexture(gd, 3, 1, T.RGBAFormat); gradMap.minFilter = gradMap.magFilter = T.NearestFilter; gradMap.needsUpdate = true;
    makeOutline(); makeTextures();
    hemi = new T.HemisphereLight('#ffffff', '#444444', 1.5); scene.add(hemi);
    amb = new T.AmbientLight('#ffffff', 0.25); scene.add(amb);
    sun = new T.DirectionalLight('#ffffff', 2.0); sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -1100, right: 1100, top: 900, bottom: -700, near: 100, far: 3500 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 1.5;
    scene.add(sun); scene.add(sun.target);
    dyn = new T.Group(); scene.add(dyn);
    P = { dot: Particles(TEX.dot, true), norm: Particles(TEX.dot, false), smoke: Particles(TEX.dot, false), flame: Particles(TEX.flame, true), star: Particles(TEX.star, true), ring: Particles(TEX.ring, true, 300) };
    for (const k in P) scene.add(P[k].pts);
    ok = true;
    return true;
  }

  return { init, frame, snapshotHero, snapshotStage, get ok() { return ok; }, setEnabled(v) { if (canvas) canvas.style.display = v ? 'block' : 'none'; } };
})();
