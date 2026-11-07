/* Torah Fighter — 3D renderer (Three.js). Sculpted procedural heroes, physically based materials, image-based
   lighting from a procedural sky, bloom + ACES tone mapping, textured stages with wind-blown grass.
   The game itself stays 2D: world (x, y-down) maps to Three (x, -y, 0). The perspective camera is placed so the
   z=0 fighting plane lines up pixel-for-pixel with the 2D overlay canvas (HUD, tags, text). */
'use strict';

const R3D = (() => {
  const T = window.THREE;
  let ok = false, renderer = null, scene = null, camera = null, canvas = null;
  let dyn = null, hemi = null, sun = null, amb = null;
  const FOV = 34, TAN = Math.tan(FOV * Math.PI / 360);
  const TAU = Math.PI * 2;

  /* ---------- noise ---------- */
  function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y, p = 0, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const w = (a) => p ? ((a % p) + p) % p : a;
    const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s), c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o = 4, p = 0, s = 0) { let t = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, p ? p * f : 0, s + i); f *= 2; a *= 0.5; } return t; }
  function vnoise3(x, y, z) { const zi = Math.floor(z), zf = z - zi, w = zf * zf * (3 - 2 * zf); return vnoise(x, y, 0, zi) * (1 - w) + vnoise(x, y, 0, zi + 1) * w; }
  function fbm3(x, y, z, o = 3) { let t = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise3(x * f + i * 17, y * f, z * f); f *= 2; a *= 0.5; } return t; }

  /* ---------- procedural textures (map + normal map from a height field) ---------- */
  function texFrom(size, heightFn, colorFn, strength = 2, srgb = true) {
    const hgt = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = heightFn(x / size, y / size);
    const mk = (fill) => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const img = x.createImageData(size, size); fill(img.data); x.putImageData(img, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t; };
    const map = colorFn ? mk((d) => { for (let i = 0; i < size * size; i++) { const c = colorFn(hgt[i], i % size / size, Math.floor(i / size) / size); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; } }) : null;
    if (map && srgb) map.colorSpace = T.SRGBColorSpace;
    const normal = mk((d) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const h = (xx, yy) => hgt[((yy + size) % size) * size + ((xx + size) % size)];
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    });
    return { map, normal };
  }
  const TX = {};
  function grey(v) { const g = Math.max(0, Math.min(255, v * 255)); return [g, g, g]; }
  function makeSurfaceTextures() {
    TX.cloth = texFrom(128, (u, v) => 0.55 * (Math.sin(u * 128 * Math.PI) * Math.sin(v * 128 * Math.PI) * 0.5 + 0.5) + 0.45 * fbm(u * 16, v * 16, 3, 16), (h) => grey(0.82 + h * 0.18), 3);
    TX.wood = texFrom(128, (u, v) => fbm(u * 3, v * 40, 3, 3) * 0.6 + Math.sin((u * 6 + fbm(u * 4, v * 8, 2, 4) * 3) * Math.PI * 2) * 0.2, (h) => grey(0.62 + h * 0.4), 4);
    TX.hair = texFrom(128, (u, v) => fbm(u * 60, v * 3, 3, 60) * 0.8 + vnoise(u * 128, v * 4, 128) * 0.2, (h) => grey(0.7 + h * 0.3), 6);
    TX.metal = texFrom(128, (u, v) => fbm(u * 50, v * 2, 2, 50) * 0.3 + fbm(u * 8, v * 8, 3, 8) * 0.2, (h) => grey(0.85 + h * 0.15), 1.5);
    TX.skin = texFrom(64, (u, v) => fbm(u * 24, v * 24, 2, 24), (h) => grey(0.93 + h * 0.07), 0.6);
    TX.scales = texFrom(128, (u, v) => { const r = v * 8, row = Math.floor(r), off = row % 2 ? 0.5 : 0, cx = (u * 8 + off) % 1 - 0.5, cy = r % 1; return Math.max(0, 1 - Math.hypot(cx, cy * 1.2) * 1.6); }, (h) => grey(0.55 + h * 0.45), 5);
    TX.water = texFrom(128, (u, v) => fbm(u * 6, v * 6, 4, 6), null, 3);
  }
  // stage ground textures, coloured per palette
  const groundTexCache = new Map();
  function hexRGB(hex) { const c = new T.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; }
  function mixRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function groundTex(kind, c1, c2) {
    const key = kind + c1 + c2; if (groundTexCache.has(key)) return groundTexCache.get(key);
    const A = hexRGB(c1), B = hexRGB(c2); let t;
    if (kind === 'rock') t = texFrom(256, (u, v) => { const s = Math.sin((v * 4 + fbm(u * 4, v * 4, 3, 4) * 2.2) * Math.PI * 2) * 0.08; const cr = Math.abs(fbm(u * 6 + 3, v * 6, 4, 6) - 0.5); return fbm(u * 6, v * 6, 5, 6) * 0.9 + s - Math.max(0, 0.05 - cr) * 3; }, (h) => mixRGB(B, A, Math.max(0, Math.min(1, h * 1.3 - 0.15))), 2.4);
    else if (kind === 'stone') t = texFrom(256, (u, v) => fbm(u * 10, v * 10, 5, 10) * 0.7 + fbm(u * 40, v * 40, 2, 40) * 0.3, (h) => mixRGB(B, A, Math.min(1, h * 1.2)), 3);
    else if (kind === 'grass') t = texFrom(256, (u, v) => fbm(u * 24, v * 24, 4, 24) * 0.6 + vnoise(u * 128, v * 128, 128) * 0.4, (h) => mixRGB(B, A, Math.min(1, h * 1.3)), 4);
    else if (kind === 'sand') t = texFrom(256, (u, v) => Math.sin((u * 10 + fbm(u * 3, v * 3, 3, 3) * 2) * Math.PI * 2) * 0.25 + fbm(u * 40, v * 40, 2, 40) * 0.4, (h) => mixRGB(B, A, 0.5 + h * 0.6), 3);
    else if (kind === 'brick') t = texFrom(256, (u, v) => { const r = v * 8, row = Math.floor(r), bx = (u * 4 + (row % 2) * 0.5) % 1, by = r % 1; const mortar = (bx < 0.05 || by < 0.1) ? 0 : 1; return mortar * (0.7 + fbm(u * 16, v * 16, 3, 16) * 0.3); }, (h) => h < 0.1 ? mixRGB(B, [60, 50, 40], 0.4) : mixRGB(B, A, h), 6);
    else if (kind === 'tile') t = texFrom(256, (u, v) => { const r = v * 10, row = Math.floor(r), bx = (u * 8 + (row % 2) * 0.5) % 1, by = r % 1; return Math.sqrt(Math.max(0, 1 - ((bx - 0.5) * 2) ** 2)) * (1 - by * 0.6) + fbm(u * 16, v * 16, 2, 16) * 0.15; }, (h) => mixRGB(B, A, h), 5);
    else t = texFrom(256, (u, v) => fbm(u * 10, v * 10, 4, 10), (h) => mixRGB(B, A, h), 3);
    groundTexCache.set(key, t); return t;
  }

  /* ---------- materials: PBR + rim light + hit flash ---------- */
  function enhance(m, rim = 0.3) {
    m.userData.flash = { value: 0 }; m.userData.rim = { value: rim };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.rimK = m.userData.rim; sh.uniforms.flashK = m.userData.flash;
      sh.fragmentShader = 'uniform float rimK;\nuniform float flashK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);\n totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * rimF * rimK + vec3(flashK);');
    };
    m.customProgramCacheKey = () => 'rimflash';
    return m;
  }
  const matCache = new Map();
  function toon(color, o = {}) { // name kept for older call sites; now physically based
    const key = [color, o.emissive, o.ei, o.opacity, o.side, o.rough, o.metal, o.tex, o.rim].join('|');
    let m = matCache.get(key);
    if (!m) { m = pbr(color, o); matCache.set(key, m); }
    return m;
  }
  function pbr(color, o = {}) {
    const m = new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0 });
    if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
    if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    if (o.side) m.side = o.side;
    const tx = o.tex && TX[o.tex];
    if (tx) { if (tx.map) m.map = tx.map; m.normalMap = tx.normal; const s = o.ns ?? 0.6; m.normalScale = new T.Vector2(s, s); }
    if (o.flat) m.flatShading = true;
    return enhance(m, o.rim ?? 0.22);
  }
  function cloth(color, o = {}) { const m = new T.MeshPhysicalMaterial({ color, roughness: 0.9, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new T.Color(color).lerp(new T.Color('#ffffff'), 0.2), side: o.side || T.FrontSide }); m.map = TX.cloth.map; m.normalMap = TX.cloth.normal; m.normalScale = new T.Vector2(0.45, 0.45); return enhance(m, 0.18); }
  function skinMat(color) { const m = new T.MeshPhysicalMaterial({ color, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new T.Color('#ff9f87') }); m.normalMap = TX.skin.normal; m.normalScale = new T.Vector2(0.25, 0.25); return enhance(m, 0.3); }
  function hairMat(color) { const m = new T.MeshStandardMaterial({ color, roughness: 0.62 }); m.map = TX.hair.map; m.normalMap = TX.hair.normal; m.normalScale = new T.Vector2(0.9, 0.9); return enhance(m, 0.35); }
  function metalMat(color, rough = 0.3) { const m = new T.MeshStandardMaterial({ color, roughness: rough, metalness: 1 }); m.normalMap = TX.metal.normal; m.normalScale = new T.Vector2(0.25, 0.25); return enhance(m, 0.2); }
  function woodMat(color = '#7b5230') { const m = new T.MeshStandardMaterial({ color, roughness: 0.7 }); m.map = TX.wood.map; m.normalMap = TX.wood.normal; m.normalScale = new T.Vector2(0.6, 0.6); return enhance(m, 0.15); }
  function leatherMat(color = '#6b4423') { const m = new T.MeshStandardMaterial({ color, roughness: 0.6 }); m.normalMap = TX.cloth.normal; m.normalScale = new T.Vector2(0.3, 0.3); return enhance(m, 0.2); }

  function mesh(geo, color, o = {}) {
    const m = new T.Mesh(geo, o.mat || toon(color, o));
    m.castShadow = o.shadow !== false; m.receiveShadow = o.receive !== false;
    return m;
  }
  function M(geo, mat, shadow = true) { const m = new T.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
  const G = {
    box: (w, h, d) => new T.BoxGeometry(w, h, d),
    sph: (r, ws = 16, hs = 12) => new T.SphereGeometry(r, ws, hs),
    cyl: (rt, rb, h, s = 12) => new T.CylinderGeometry(rt, rb, h, s),
    cone: (r, h, s = 12) => new T.ConeGeometry(r, h, s),
    ico: (r, d = 1) => new T.IcosahedronGeometry(r, d),
    tor: (r, t, rs = 8, ts = 20, arc = TAU) => new T.TorusGeometry(r, t, rs, ts, arc)
  };
  function deform(geo, fn) { const p = geo.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }
  // a limb that extends along +x from its origin (smooth tapered capsule)
  function capX(len, r1, r2) { const g = new T.CapsuleGeometry((r1 + r2) / 2, Math.max(0.1, len - (r1 + r2)), 4, 12); deform(g, (v) => { const t = (v.y + len / 2) / len; const s = (r1 + (r2 - r1) * (1 - t)) / ((r1 + r2) / 2); v.x *= s; v.z *= s; }); g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0); return g; }
  function capDown(len, r1, r2) { const g = new T.CapsuleGeometry((r1 + r2) / 2, Math.max(0.1, len - (r1 + r2)), 4, 12); deform(g, (v) => { const t = (v.y + len / 2) / len; const s = (r2 + (r1 - r2) * t) / ((r1 + r2) / 2); v.x *= s; v.z *= s; }); g.translate(0, -len / 2, 0); return g; }
  function limbX(len, r1, r2, color, o = {}) { return M(capX(len, r1, r2), o.mat || toon(color, o)); }
  function limbDown(len, r1, r2, color, o = {}) { return M(capDown(len, r1, r2), o.mat || toon(color, o)); }

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
      fragmentShader: 'uniform sampler2D tex; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(tex, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * t.rgb, a);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }',
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

  /* ---------- hero rig: sculpted, physically based ---------- */
  const STYLE = {
    avraham: { long: true, cape: 'tallit' }, moshe: { long: true, cape: '#cdbb93', hairBack: true }, david: { long: false, cape: '#a8231a', capeShort: true },
    shimshon: { long: false, bare: true }, benaya: { long: false, armor: 'leather', plume: '#c0392b' }, yonatan: { long: false, armor: 'leather', cape: '#1f3f73', capeShort: true },
    maharal: { long: true }, yehoshua: { long: false, armor: 'gold', cape: '#7e1b1b', plume: '#7e1b1b' }, eliyahu: { long: true, cape: 'fur', hairBack: true },
    gideon: { long: false, armor: 'leather' }, pinchas: { long: true }, yael: { long: true }, golyat: { long: false, armor: 'bronze', plume: '#b03a2e' }, soldier: { long: false, armor: 'leather' }
  };
  function curly(geo, r, amt, seed = 0, freq = 3) { return deform(geo, (v) => { const l = v.length() || 1; const d = (fbm3(v.x / r * freq + seed, v.y / r * freq, v.z / r * freq) - 0.45) * r * amt; v.multiplyScalar(1 + d / l); }); }
  function folds(geo, amt, n, axisLen) { return deform(geo, (v) => { const a = Math.atan2(v.z, v.x), t = Math.min(1, Math.abs(v.y) / axisLen); const s = 1 + amt * t * Math.sin(a * n); v.x *= s; v.z *= s; }); }
  function tallitTex() {
    return canvasTex(128, 256, (x) => { x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#1f3c88'; for (const y of [196, 212, 226]) x.fillRect(0, y, 128, y === 212 ? 9 : 5); x.fillStyle = '#1f3c88'; x.fillRect(0, 30, 128, 4); });
  }

  function headwear(R, L, hr, st) {
    const g = new T.Group(), hc = L.headColor || '#888';
    const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
    const hairCap = (mat, tilt = 0.6, r = 1.06, len = 0.58) => { const c = M(curly(new T.SphereGeometry(hr * r, 28, 18, 0, TAU, 0, Math.PI * len), hr, 0.16, 3, 4), mat); c.rotation.z = tilt; c.position.x = -hr * 0.03; g.add(c); return c; };
    const clothM = (c) => { const m = cloth(c); R.mats.push(m); return m; };
    const gold = () => { const m = metalMat('#d9ab35', 0.28); R.mats.push(m); return m; };
    switch (L.head) {
      case 'turban': {
        const m = clothM('#f1ebdc');
        for (let i = 0; i < 3; i++) { const t = M(deform(new T.TorusGeometry(hr * (1.0 - i * 0.09), hr * 0.26, 10, 28), (v) => { const a = Math.atan2(v.y, v.x); v.z *= 1 + 0.12 * Math.sin(a * 9 + i); }), m); t.rotation.x = Math.PI / 2; t.rotation.y = (i % 2 ? 0.12 : -0.1); t.position.y = hr * (0.32 + i * 0.2); g.add(t); }
        add(M(new T.SphereGeometry(hr * 0.86, 20, 10, 0, TAU, 0, Math.PI / 2), m), 0, hr * 0.62);
        const band = M(new T.TorusGeometry(hr * 1.08, hr * 0.07, 6, 28), clothM(hc)); band.rotation.x = Math.PI / 2; band.position.y = hr * 0.24; g.add(band);
        break;
      }
      case 'crown': {
        hairCap(R.mHair, 0.5);
        const c = M(deform(new T.CylinderGeometry(hr * 0.9, hr * 0.86, hr * 0.38, 40, 2, true), (v) => { if (v.y > 0) { const a = Math.atan2(v.z, v.x); v.y += Math.pow((Math.cos(a * 5) + 1) / 2, 3) * hr * 0.42; } }), gold());
        c.material.side = T.DoubleSide; c.position.y = hr * 0.78; g.add(c);
        ['#c0182b', '#1f5fd1', '#18a35a', '#c0182b', '#1f5fd1'].forEach((col, i) => { const a = i / 5 * TAU; const gm = new T.MeshPhysicalMaterial({ color: col, roughness: 0.08, metalness: 0, clearcoat: 1, emissive: col, emissiveIntensity: 0.25 }); add(M(new T.IcosahedronGeometry(hr * 0.1, 1), gm, false), Math.cos(a) * hr * 0.9, hr * 0.78, Math.sin(a) * hr * 0.9); });
        break;
      }
      case 'helmet': case 'bosshelm': {
        const metal = st.armor === 'gold' || L.head === 'bosshelm' ? metalMat(L.head === 'bosshelm' ? '#b07a3a' : '#d9ab35', 0.32) : metalMat('#b8c0c6', 0.3); R.mats.push(metal);
        add(M(new T.SphereGeometry(hr * 1.12, 32, 16, 0, TAU, 0, Math.PI * 0.52), metal), 0, hr * 0.02);
        const rim = M(new T.TorusGeometry(hr * 1.1, hr * 0.07, 8, 32), metal); rim.rotation.x = Math.PI / 2; rim.position.y = hr * 0.0; g.add(rim);
        add(M(new T.BoxGeometry(hr * 0.12, hr * 0.55, hr * 0.14), metal), hr * 1.1, -hr * 0.2);
        for (const z of [1, -1]) { const ch = M(new T.BoxGeometry(hr * 0.55, hr * 0.7, hr * 0.08), metal); ch.position.set(hr * 0.35, -hr * 0.35, z * hr * 1.0); ch.rotation.x = z * 0.15; g.add(ch); }
        if (st.plume) { const p = M(curly(new T.TorusGeometry(hr * 0.95, hr * 0.2, 10, 24, Math.PI), hr, 0.25, 5, 6), (() => { const m = hairMat(st.plume); R.mats.push(m); return m; })()); p.position.y = hr * 0.5; p.scale.z = 0.6; g.add(p); }
        break;
      }
      case 'circlet': { hairCap(R.mHair, 0.55); const t = M(new T.TorusGeometry(hr * 1.03, hr * 0.06, 8, 32), gold()); t.rotation.x = Math.PI / 2; t.rotation.z = 0.25; t.position.y = hr * 0.42; g.add(t); add(M(new T.IcosahedronGeometry(hr * 0.12, 1), new T.MeshPhysicalMaterial({ color: '#2a7de1', roughness: 0.05, clearcoat: 1, emissive: '#2a7de1', emissiveIntensity: 0.3 }), false), hr * 0.98, hr * 0.62); break; }
      case 'biret': {
        hairCap(R.mHair, 0.5);
        const felt = new T.MeshStandardMaterial({ color: '#141414', roughness: 0.95 }); enhance(felt, 0.25); R.mats.push(felt);
        add(M(new T.CylinderGeometry(hr * 1.5, hr * 1.5, hr * 0.09, 40), felt), 0, hr * 0.62);
        add(M(deform(new T.CylinderGeometry(hr * 0.9, hr * 0.98, hr * 0.85, 32), (v) => { if (v.y > 0) v.y -= Math.max(0, 0.1 - Math.abs(v.z) / hr * 0.15) * hr; }), felt), 0, hr * 1.05);
        break;
      }
      case 'kerchief': {
        const m = clothM(hc);
        add(M(curly(new T.SphereGeometry(hr * 1.1, 24, 14, 0, TAU, 0, Math.PI * 0.6), hr, 0.05, 2, 3), m)).rotation.z = 0.3;
        const tail = M(deform(new T.PlaneGeometry(hr * 0.9, hr * 2.0, 4, 8), (v) => { v.z = Math.sin((v.y / hr) * 1.2) * hr * 0.15; }), (() => { const c = cloth(hc, { side: T.DoubleSide }); R.mats.push(c); return c; })());
        tail.position.set(-hr * 0.9, -hr * 0.6, 0); tail.rotation.y = Math.PI / 2; tail.rotation.x = 0.15; g.add(tail);
        const band = M(new T.TorusGeometry(hr * 1.07, hr * 0.06, 6, 28), clothM('#3a2a1a')); band.rotation.x = Math.PI / 2; band.position.y = hr * 0.28; g.add(band);
        break;
      }
      case 'kohen': {
        const m = clothM('#ffffff');
        for (let i = 0; i < 4; i++) { const t = M(new T.TorusGeometry(hr * (1.0 - i * 0.06), hr * 0.22, 10, 28), m); t.rotation.x = Math.PI / 2; t.rotation.y = i % 2 ? 0.08 : -0.08; t.position.y = hr * (0.28 + i * 0.22); g.add(t); }
        add(M(new T.SphereGeometry(hr * 0.88, 24, 10, 0, TAU, 0, Math.PI / 2), m), 0, hr * 0.92);
        const cord = M(new T.TorusGeometry(hr * 1.14, hr * 0.045, 6, 30), clothM('#2c4fd6')); cord.rotation.x = Math.PI / 2; cord.position.y = hr * 0.5; g.add(cord);
        break;
      }
      case 'scarf': {
        const m = clothM(hc);
        add(M(curly(new T.SphereGeometry(hr * 1.17, 28, 16, 0, TAU, 0, Math.PI * 0.62), hr, 0.05, 1, 3), m)).rotation.z = 0.25;
        const drape = M(folds(new T.CylinderGeometry(hr * 1.02, hr * 1.5, hr * 2.6, 28, 4, true, Math.PI * 0.55, Math.PI * 0.9), 0.08, 9, hr * 1.3), (() => { const c = cloth(hc, { side: T.DoubleSide }); R.mats.push(c); return c; })());
        drape.position.set(-hr * 0.05, -hr * 1.05, 0); g.add(drape);
        break;
      }
      case 'locks': {
        hairCap(R.mHair, 0.45, 1.08, 0.62);
        R.locks = [];
        for (let i = 0; i < 7; i++) {
          const a = -1.0 + i * (2.0 / 6), z0 = Math.sin(a) * hr * 0.95, x0 = -hr * 0.55 - Math.cos(a) * hr * 0.3;
          const pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push(new T.Vector3(x0 - t * hr * 0.8, hr * 0.2 - t * hr * 3.6, z0 * (1 + t * 0.4) + Math.sin(t * 9 + i) * hr * 0.12)); }
          const tube = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 20, hr * 0.13, 7, false);
          deform(tube, (v) => { const k = 1 - Math.max(0, (hr * 0.2 - v.y) / (hr * 3.8)) * 0.45; v.x = x0 + (v.x - x0) * 1; v.z = v.z * 1; void k; });
          const piv = new T.Group(); piv.position.set(x0, hr * 0.2, z0); g.add(piv);
          const lk = M(tube, R.mHair); lk.position.set(-x0, -hr * 0.2, -z0); piv.add(lk); R.locks.push(piv);
        }
        break;
      }
      case 'none': default: hairCap(R.mHair, 0.62); break;
    }
    if (st.hairBack || L.hairy) add(M(curly(new T.SphereGeometry(hr, 24, 18), hr, L.hairy ? 0.4 : 0.22, 7, 3), R.mHair), -hr * 0.42, -hr * 0.55).scale.set(0.75, 1.45, 1.08);
    return g;
  }
  function shadeHex(hex, amt) { const c = new T.Color(hex); c.offsetHSL(0, 0, amt / 255); return '#' + c.getHexString(); }

  /* weapons, built pointing along +x from the hand; userData.tip/base drive the swing trails */
  const WMAT = {};
  function wmats() {
    if (WMAT.wood) return WMAT;
    WMAT.wood = woodMat('#7b5230'); WMAT.dark = woodMat('#5a3a1a'); WMAT.steel = metalMat('#dfe6ea', 0.22); WMAT.iron = metalMat('#9aa3a8', 0.38);
    WMAT.gold = metalMat('#d9ab35', 0.3); WMAT.bronze = metalMat('#b07a3a', 0.35); WMAT.bone = pbr('#efe3c8', { rough: 0.5 }); WMAT.leather = leatherMat('#4a2f18');
    WMAT.horn = pbr('#e2c896', { rough: 0.38, tex: 'wood', ns: 0.3 }); WMAT.clay = pbr('#b5651d', { rough: 0.7 }); WMAT.ice = new T.MeshPhysicalMaterial({ color: '#cfeaff', roughness: 0.1, transmission: 0.0, clearcoat: 1, emissive: '#2a5f8a', emissiveIntensity: 0.3 });
    WMAT.white = pbr('#ffffff', { rough: 0.6 }); WMAT.cord = pbr('#d8c9a8', { rough: 0.9 });
    return WMAT;
  }
  function buildWeapon(kind, k) {
    const W = wmats(), g = new T.Group();
    const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
    const tip = (x, y = 0) => { g.userData.tip = new T.Vector3(x, y, 0); g.userData.base = new T.Vector3(x * 0.45, y * 0.45, 0); };
    switch (kind) {
      case 'staff': case 'cane': case 'shepherd': case 'bigstaff': case 'aharon': {
        const len = (kind === 'shepherd' ? 52 : kind === 'cane' ? 60 : kind === 'bigstaff' ? 112 : 74) * k, r = (kind === 'bigstaff' ? 2.9 : 2.3) * k;
        const s = M(deform(capX(len, r * 1.05, r * 0.85), (v) => { v.y += Math.sin(v.x / len * 5) * r * 0.25; }), kind === 'bigstaff' ? W.dark : W.wood); s.position.x = -len * 0.35; g.add(s);
        if (kind !== 'staff' && kind !== 'aharon') { const c = M(new T.TorusGeometry(6.5 * k, r, 8, 16, Math.PI * 1.25), kind === 'bigstaff' ? W.dark : W.wood); c.position.set(len * 0.65, 6.5 * k, 0); c.rotation.z = -Math.PI * 0.62; g.add(c); }
        if (kind === 'aharon') for (let i = 0; i < 7; i++) add(M(new T.SphereGeometry(2.8 * k, 8, 6), i % 3 ? W.white : pbr('#f5b7b1', { rough: 0.6 })), len * 0.42 + i * 2.6 * k, (i % 2 ? 4 : -4) * k, (i % 3 - 1) * 3 * k);
        tip(len * 0.65); break;
      }
      case 'mantle': { const m = M(deform(new T.BoxGeometry(40 * k, 9 * k, 3 * k, 10, 2, 1), (v) => { v.z += Math.sin(v.x / k * 0.3) * 2 * k; }), (() => { const h = hairMat('#4a3420'); return h; })()); m.geometry.translate(20 * k, 0, 0); g.add(m); g.userData.whip = m; tip(40 * k); break; }
      case 'club': { add(M(deform(capX(44 * k, 3 * k, 6.5 * k), (v) => { const d = fbm3(v.x * 0.2, v.y * 0.2, v.z * 0.2) - 0.5; if (v.x > 20 * k) { v.y += d * 3 * k; v.z += d * 3 * k; } }), W.wood)); tip(44 * k); break; }
      case 'sword': {
        add(M(capX(12 * k, 2.2 * k, 2.2 * k), W.leather), -6 * k); add(M(new T.BoxGeometry(3 * k, 15 * k, 4.5 * k), W.gold), 6 * k); add(M(new T.SphereGeometry(2.8 * k, 10, 8), W.gold), -7 * k);
        const sh = new T.Shape(); sh.moveTo(0, -3 * k); sh.lineTo(42 * k, -2.6 * k); sh.lineTo(52 * k, 0); sh.lineTo(42 * k, 2.6 * k); sh.lineTo(0, 3 * k); sh.closePath();
        const geo = new T.ExtrudeGeometry(sh, { depth: 0.6 * k, bevelEnabled: true, bevelThickness: 0.7 * k, bevelSize: 0.7 * k, bevelSegments: 2 }); geo.translate(7.5 * k, 0, -0.3 * k);
        g.add(M(geo, W.steel)); tip(52 * k); break;
      }
      case 'spear': {
        const s = M(capX(104 * k, 1.9 * k, 1.7 * k), W.wood); s.position.x = -40 * k; g.add(s);
        const sh = new T.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(6 * k, 5.5 * k, 20 * k, 0); sh.quadraticCurveTo(6 * k, -5.5 * k, 0, 0);
        const geo = new T.ExtrudeGeometry(sh, { depth: 0.5 * k, bevelEnabled: true, bevelThickness: 0.9 * k, bevelSize: 0.6 * k, bevelSegments: 2 }); geo.translate(62 * k, 0, -0.25 * k); g.add(M(geo, W.steel));
        add(M(new T.CylinderGeometry(2.4 * k, 2.4 * k, 4 * k, 10), W.iron), 62 * k).rotation.z = Math.PI / 2; tip(82 * k); break;
      }
      case 'mallet': { add(M(capX(32 * k, 2 * k, 2 * k), W.wood)); const h = M(new T.CylinderGeometry(6.5 * k, 6.5 * k, 18 * k, 14), W.dark); h.position.x = 32 * k; g.add(h); tip(34 * k); break; }
      case 'jawbone': {
        const sh = new T.Shape(); sh.moveTo(-4, -4); sh.quadraticCurveTo(20, -16, 46, -10); sh.lineTo(48, 4); sh.quadraticCurveTo(22, 2, 8, 8); sh.lineTo(-4, 6); sh.closePath();
        const geo = new T.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.2, bevelSegments: 2 }); geo.scale(k, -k, k); geo.translate(0, 0, -1.5 * k);
        g.add(M(geo, W.bone)); for (let i = 0; i < 6; i++) add(M(new T.ConeGeometry(1.8 * k, 5 * k, 6), W.white), (18 + i * 5.5) * k, (12.5 - i * 0.3) * k); tip(46 * k, 10 * k); break;
      }
      case 'goliath': {
        add(M(capX(22 * k, 3.6 * k, 3.6 * k), W.leather), -13 * k); add(M(new T.SphereGeometry(4.5 * k, 12, 10), W.iron), -14 * k);
        add(M(new T.BoxGeometry(7 * k, 24 * k, 9 * k), W.iron), 11 * k);
        const sh = new T.Shape(); sh.moveTo(14, -11); sh.lineTo(108, -11); sh.lineTo(121, 3); sh.lineTo(108, 11); sh.lineTo(14, 11); sh.closePath();
        for (const hx of [24, 34]) { const h = new T.Path(); h.absarc(hx, 0, 3.2, 0, TAU, true); sh.holes.push(h); }
        const geo = new T.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.6, bevelSegments: 3 }); geo.scale(k, k, k); geo.translate(0, 0, -1.1 * k);
        g.add(M(geo, W.steel));
        add(M(new T.BoxGeometry(62 * k, 2.2 * k, 5.6 * k), W.iron), 74 * k, -2 * k);
        tip(121 * k); break;
      }
      case 'busters': { const s = M(capX(150 * k, 2.6 * k, 2.4 * k), W.dark); s.position.x = -50 * k; g.add(s); add(M(new T.ConeGeometry(6.5 * k, 28 * k, 8), W.bronze), 113 * k).rotation.z = -Math.PI / 2; tip(126 * k); break; }
      case 'sling': case 'slingdraw': { add(M(capX(22 * k, 0.7 * k, 0.7 * k), W.cord)); add(M(new T.IcosahedronGeometry(4 * k, 1), pbr('#9a9a9a', { rough: 0.8 })), 22 * k); g.userData.spin = true; tip(24 * k); break; }
      case 'bowdraw': case 'bowback': {
        const b = M(deform(new T.TorusGeometry(24 * k, 1.8 * k, 8, 24, 2.4), (v) => { const a = Math.atan2(v.y, v.x); v.multiplyScalar(1 + Math.abs(a - 1.2) * 0.04); }), W.dark); b.rotation.z = -1.2; b.position.x = -6 * k; g.add(b);
        add(M(new T.CylinderGeometry(2.2 * k, 2.2 * k, 9 * k, 10), W.leather), -6 * k + 24 * k);
        if (kind === 'bowdraw') { add(M(capX(32 * k, 0.9 * k, 0.9 * k), W.wood), -8 * k); add(M(new T.ConeGeometry(2.5 * k, 6 * k, 6), W.iron), 26 * k).rotation.z = -Math.PI / 2; for (const z of [1.2, -1.2]) add(M(new T.BoxGeometry(6 * k, 3 * k, 0.4 * k), pbr('#c0392b')), -6 * k, 0, z * k); }
        tip(24 * k); break;
      }
      case 'shofar': {
        const curve = new T.QuadraticBezierCurve3(new T.Vector3(0, 0, 0), new T.Vector3(14 * k, 18 * k, 0), new T.Vector3(34 * k, 9 * k, 0));
        const tube = new T.TubeGeometry(curve, 24, 1, 10); const pos = tube.attributes.position, n = tube.attributes.normal; // taper the horn
        for (let i = 0; i < pos.count; i++) { const t = Math.floor(i / 11) / 24; const r = (1.6 + t * t * 5.5) * k; const p = curve.getPoint(t); pos.setXYZ(i, p.x + n.getX(i) * r, p.y + n.getY(i) * r, p.z + n.getZ(i) * r); }
        tube.computeVertexNormals(); g.add(M(tube, W.horn)); tip(34 * k, 9 * k); break;
      }
      case 'jar': case 'jartorch': { const j = add(M(new T.LatheGeometry([0, 6, 9.5, 10, 8, 4.5, 5].map((r, i) => new T.Vector2(r * k, (i * 4 - 10) * k)), 18), W.clay), 10 * k); g.userData.flame = new T.Vector3(10 * k, 18 * k, 0); tip(10 * k, 10 * k); void j; break; }
      case 'torch': { add(M(capX(28 * k, 2 * k, 2.6 * k), W.wood)); add(M(new T.CylinderGeometry(4 * k, 3 * k, 7 * k, 10), W.leather), 29 * k).rotation.z = Math.PI / 2; g.userData.flame = new T.Vector3(32 * k, 3 * k, 0); tip(32 * k); break; }
      case 'peg': { add(M(capX(30 * k, 2.6 * k, 2.2 * k), W.wood)); add(M(new T.ConeGeometry(2.4 * k, 9 * k, 8), W.wood), 34 * k).rotation.z = -Math.PI / 2; tip(38 * k); break; }
      case 'hail': add(M(curly(new T.IcosahedronGeometry(14 * k, 2), 14 * k, 0.25, 4, 2), WMAT.ice), 14 * k); tip(28 * k); break;
      case 'bowl': { add(M(new T.SphereGeometry(10 * k, 18, 8, 0, TAU, Math.PI / 2, Math.PI / 2), W.clay), 10 * k); add(M(new T.CylinderGeometry(9.4 * k, 9.4 * k, 1, 18), pbr('#fffaf0', { rough: 0.3 }), false), 10 * k, -0.5); tip(20 * k); break; }
      case 'harp': { const f = M(new T.TorusGeometry(14 * k, 1.6 * k, 8, 16, Math.PI * 1.3), W.gold); f.position.set(12 * k, -2 * k, 0); g.add(f); for (let i = 0; i < 6; i++) add(M(new T.CylinderGeometry(0.3 * k, 0.3 * k, 22 * k, 4), W.cord, false), (5 + i * 2.6) * k, -2 * k); tip(26 * k); break; }
    }
    return g;
  }

  function buildRig(hero) {
    const L = hero.look, H = hero.h, k = H / 90, st = STYLE[hero.id] || {};
    const wd = Math.max(0.88, Math.min(1.55, hero.w / hero.h * 90 / 46));
    const tall = hero.id === 'moshe';
    const hr = H * (tall ? 0.066 : 0.084);
    const shY = H * 0.745, chestY = H * 0.65, waistY = H * 0.535, hipY = H * 0.47, kneeY = H * 0.25, headY = H - hr * 1.12;
    const root = new T.Group(), yaw = new T.Group(), spinG = new T.Group(), offG = new T.Group(), leanG = new T.Group();
    root.add(yaw); yaw.add(spinG); spinG.position.y = H / 2; spinG.add(offG); offG.position.y = -H / 2; offG.add(leanG);
    const R = { hero, root, yaw, spinG, offG, leanG, H, k, hr, weapons: {}, flames: [], mats: [], flash: 0, trail: [], sway: 0, capeSwing: 0 };
    const reg = (m) => { R.mats.push(m); return m; };
    const mRobe = reg(cloth(L.robe)), mRobeD = reg(cloth(L.robe, { side: T.DoubleSide })), mRobe2 = reg(cloth(L.robe2)), mRobe2D = reg(cloth(L.robe2, { side: T.DoubleSide }));
    const mSkin = reg(skinMat(L.skin)); R.mHair = reg(hairMat(L.hair || '#2a1a10')); const mBeard = reg(hairMat(L.beard || L.hair || '#2a1a10'));
    const mLeather = reg(leatherMat('#4f331c'));
    const armorMat = st.armor === 'gold' ? reg(metalMat('#d4a72c', 0.34)) : st.armor === 'bronze' ? reg(metalMat('#b07a3a', 0.38)) : st.armor === 'leather' ? reg(leatherMat('#6b4423')) : null;
    if (armorMat && st.armor !== 'leather') { armorMat.map = TX.scales.map; armorMat.normalMap = TX.scales.normal; armorMat.normalScale = new T.Vector2(1.2, 1.2); }

    // legs
    const thighL = hipY - kneeY, shinL = kneeY - H * 0.035;
    const leg = (z) => {
      const hip = new T.Group(); hip.position.set(0, hipY, z); leanG.add(hip);
      hip.add(M(capDown(thighL, 0.052 * H * wd, 0.04 * H * wd), st.long ? mRobe : mSkin));
      const knee = new T.Group(); knee.position.y = -thighL; hip.add(knee);
      knee.add(M(capDown(shinL, 0.039 * H * wd, 0.029 * H * wd), mSkin));
      const foot = M(capX(0.105 * H, 0.025 * H, 0.022 * H), mLeather); foot.position.set(-0.03 * H, -shinL + 0.005 * H, 0); foot.scale.z = 1.15; knee.add(foot);
      const strap = M(new T.TorusGeometry(0.032 * H, 0.006 * H, 6, 16), mLeather); strap.rotation.x = Math.PI / 2; strap.position.y = -shinL + 0.05 * H; knee.add(strap);
      return { hip, knee };
    };
    R.legF = leg(0.046 * H * wd); R.legB = leg(-0.046 * H * wd);

    // torso (lathe profile), neck
    const prof = [[0.078, waistY - 0.035 * H], [0.094, waistY + 0.02 * H], [0.109, chestY], [0.12, 0.7 * H], [0.114, shY - 0.004 * H], [0.088, shY + 0.022 * H], [0.045, 0.787 * H], [0.001, 0.792 * H]].map(([r, y]) => new T.Vector2(r * H * wd * (st.bare ? 1.06 : 1), y));
    const torsoG = new T.LatheGeometry(prof, 28); torsoG.scale(1, 1, 0.66);
    leanG.add(M(torsoG, mRobe));
    leanG.add(M(new T.CylinderGeometry(0.034 * H, 0.04 * H, 0.08 * H, 14), mSkin)).position.y = 0.8 * H;
    const collar = M(new T.TorusGeometry(0.05 * H, 0.012 * H, 8, 24), mRobe2); collar.rotation.x = Math.PI / 2; collar.scale.y = 0.75; collar.position.y = 0.778 * H; leanG.add(collar);
    if (st.bare) { // sleeveless tunic shows a muscled chest line and a strap
      const strap = M(new T.TorusGeometry(0.1 * H * wd, 0.012 * H, 6, 24, Math.PI), mLeather); strap.position.set(0, chestY + 0.02 * H, 0); strap.rotation.set(0, Math.PI / 2, 0.55); leanG.add(strap);
    }
    if (armorMat) {
      const ap = prof.slice(1, 6).map(v => new T.Vector2(v.x * 1.07, v.y));
      const ar = new T.LatheGeometry([new T.Vector2(ap[0].x, waistY - 0.01 * H), ...ap], 28); ar.scale(1, 1, 0.68); leanG.add(M(ar, armorMat));
      for (const z of [1, -1]) { const pd = M(new T.SphereGeometry(0.06 * H * wd, 16, 10, 0, TAU, 0, Math.PI / 2), armorMat); pd.position.set(0, shY - 0.005 * H, z * (0.12 * H * wd * 0.66 + 0.025 * H)); pd.rotation.x = z * 0.5; leanG.add(pd); }
    }
    if (hero.id === 'pinchas') {
      const tex = canvasTex(64, 80, (x) => { x.fillStyle = '#c9a227'; x.fillRect(0, 0, 64, 80); const c = ['#e74c3c', '#27ae60', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c']; for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { x.fillStyle = c[(r * 3 + q) % 6]; x.beginPath(); x.arc(13 + q * 19, 12 + r * 19, 7, 0, TAU); x.fill(); } });
      const ch = M(new T.BoxGeometry(2, 0.17 * H, 0.14 * H), new T.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.4 })); ch.position.set(0.112 * H * wd, chestY + 0.02 * H, 0); leanG.add(ch);
    }

    // skirt / robe below the belt (sways with motion)
    const hemY = st.long ? 0.03 * H : 0.24 * H, sl = waistY - hemY, flare = st.long ? 0.08 : 0.055;
    const skirtPts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; skirtPts.push(new T.Vector2((0.094 + flare * Math.pow(t, 0.8)) * H * wd, -t * sl)); }
    const skirtMain = folds(new T.LatheGeometry(skirtPts.slice(0, 8), 36), 0.09, 9, sl); skirtMain.scale(1, 1, 0.72);
    const skirtHem = folds(new T.LatheGeometry(skirtPts.slice(7), 36), 0.09, 9, sl); skirtHem.scale(1, 1, 0.72);
    const skirt = new T.Group(); skirt.position.y = waistY; leanG.add(skirt); R.skirt = skirt;
    skirt.add(M(skirtMain, mRobeD)); skirt.add(M(skirtHem, mRobe2D));
    const belt = M(new T.TorusGeometry(0.097 * H * wd, 0.016 * H, 8, 30), armorMat && st.armor === 'leather' ? mLeather : mRobe2); belt.rotation.x = Math.PI / 2; belt.scale.y = 0.69; belt.position.y = waistY; leanG.add(belt);
    // tzitzit at the corners
    if (!hero.boss && hero.id !== 'yael' && hero.id !== 'soldier') for (const z of [1, -1]) { const t = M(new T.CylinderGeometry(0.004 * H, 0.002 * H, 0.1 * H, 4), WMAT.white || pbr('#ffffff'), false); t.position.set(0.05 * H, -sl - 0.04 * H, z * 0.08 * H); skirt.add(t); }

    // cape / tallit / mantle
    if (st.cape) {
      const cw = 0.24 * H * wd, ch = st.capeShort ? 0.42 * H : 0.66 * H;
      const geo = new T.PlaneGeometry(cw, ch, 6, 14); geo.translate(0, -ch / 2, 0);
      let mat;
      if (st.cape === 'tallit') { mat = new T.MeshPhysicalMaterial({ map: tallitTex(), side: T.DoubleSide, roughness: 0.85, sheen: 1, sheenColor: new T.Color('#ffffff'), sheenRoughness: 0.5 }); mat.normalMap = TX.cloth.normal; enhance(mat, 0.25); R.mats.push(mat); }
      else if (st.cape === 'fur') { mat = hairMat('#4a3420'); mat.side = T.DoubleSide; R.mats.push(mat); }
      else mat = reg(cloth(st.cape, { side: T.DoubleSide }));
      const cape = M(geo, mat); const cg = new T.Group(); cg.position.set(-0.085 * H * wd, shY + 0.012 * H, 0); cg.rotation.y = Math.PI / 2; cg.add(cape); leanG.add(cg);
      R.cape = { mesh: cape, base: geo.attributes.position.array.slice(), ch };
      if (st.cape === 'tallit') for (const x of [-cw / 2 + 2, cw / 2 - 2]) { const tz = M(new T.CylinderGeometry(0.004 * H, 0.002 * H, 0.09 * H, 4), pbr('#ffffff'), false); tz.position.set(x, -ch - 0.04 * H, 0); cape.add(tz); }
    }

    // arms
    const armZ = 0.12 * H * wd * 0.66 + 0.038 * H * wd;
    const arm = (z, front) => {
      const sh = new T.Group(); sh.position.set(0, shY - 0.012 * H, z); leanG.add(sh);
      const ua = 0.14 * H, fa = 0.13 * H, rA = (st.bare ? 0.05 : 0.042) * H * wd;
      sh.add(M(capX(ua, rA, rA * 0.85), st.bare ? mSkin : (front ? mRobe2 : mRobe2)));
      const el = new T.Group(); el.position.x = ua; sh.add(el);
      el.add(M(capX(fa, rA * 0.82, rA * 0.66), mSkin));
      if (st.long && !st.bare) { const sl2 = M(new T.CylinderGeometry(rA * 1.55, rA * 1.05, 0.07 * H, 16, 1, true), mRobe2D); sl2.rotation.z = Math.PI / 2; sl2.position.x = -0.005 * H; el.add(sl2); }
      if (armorMat || st.bare) { const br = M(new T.CylinderGeometry(rA * 0.78, rA * 0.72, 0.055 * H, 14), mLeather); br.rotation.z = Math.PI / 2; br.position.x = fa * 0.62; el.add(br); }
      const hand = new T.Group(); hand.position.x = fa; el.add(hand);
      const palm = M(new T.SphereGeometry(0.031 * H * wd, 14, 10), mSkin); palm.scale.set(1.25, 0.85, 1); hand.add(palm);
      const th = M(capX(0.03 * H, 0.011 * H, 0.009 * H), mSkin); th.position.set(-0.004 * H, 0.008 * H, (z > 0 ? 1 : -1) * 0.02 * H); th.rotation.y = z > 0 ? -0.6 : 0.6; hand.add(th);
      return { sh, el, hand };
    };
    R.armF = arm(armZ, true); R.armB = arm(-armZ, false);

    // head
    const head = new T.Group(); head.position.set(0.012 * H, headY, 0); leanG.add(head); R.head = head;
    head.add(M(deform(new T.SphereGeometry(hr, 36, 26), (v) => {
      const nx = v.x / hr, ny = v.y / hr;
      if (ny < 0) { const t = -ny; v.z *= 1 - 0.3 * t * t; v.x *= 1 - 0.1 * t * t; if (nx > 0) v.x += hr * 0.08 * t; }
      if (nx > 0.5 && ny > 0.05 && ny < 0.45) v.x += hr * 0.05 * (1 - Math.abs(ny - 0.25) * 4); // brow
      v.y *= 1.08; v.z *= 0.9;
    }), mSkin));
    const nose = M(new T.SphereGeometry(hr * 0.2, 14, 10), mSkin); nose.scale.set(1.0, 1.25, 0.72); nose.position.set(hr * 0.97, -hr * 0.08, 0); head.add(nose);
    for (const z of [1, -1]) { const ear = M(new T.SphereGeometry(hr * 0.22, 12, 10), mSkin); ear.scale.set(0.55, 1, 0.32); ear.position.set(-hr * 0.04, -hr * 0.02, z * hr * 0.9); head.add(ear); }
    const eyeW = pbr('#f6f3ee', { rough: 0.2, rim: 0 }), iris = pbr(hero.id === 'david' ? '#3a6b3a' : '#2e1f12', { rough: 0.15, rim: 0 }), glint = new T.MeshBasicMaterial({ color: '#ffffff' });
    R.eyes = []; R.lids = [];
    for (const z of [1, -1]) {
      const e = new T.Group(); e.position.set(hr * 0.76, hr * 0.12, z * hr * 0.35); head.add(e);
      e.add(M(new T.SphereGeometry(hr * 0.19, 14, 12), eyeW, false));
      const ir = M(new T.SphereGeometry(hr * 0.11, 12, 10), iris, false); ir.position.set(hr * 0.12, 0, z * hr * 0.02); e.add(ir);
      const gl = new T.Mesh(new T.SphereGeometry(hr * 0.03, 6, 5), glint); gl.position.set(hr * 0.21, hr * 0.05, z * hr * 0.05); e.add(gl);
      const lid = M(new T.SphereGeometry(hr * 0.205, 14, 8, 0, TAU, 0, Math.PI * 0.5), mSkin, false); e.add(lid); R.lids.push(lid);
      const brow = M(new T.CapsuleGeometry(hr * 0.045, hr * 0.26, 3, 6), mBeard, false); brow.rotation.x = Math.PI / 2; brow.rotation.y = z * 0.25; brow.position.set(hr * 0.11, hr * 0.24, 0); e.add(brow);
      R.eyes.push(e);
    }
    if (L.beard && L.beardLen > 0) {
      const bl = L.beardLen;
      const b = M(curly(deform(new T.SphereGeometry(hr, 30, 22), (v) => { const ny = v.y / hr; v.y = ny < 0 ? v.y * (0.75 + bl * 1.05) : v.y * 0.45; v.x *= 0.82; }), hr, 0.32 + (L.hairy ? 0.2 : 0), hero.h, 3.5), mBeard);
      b.position.set(hr * 0.16, -hr * 0.42, 0); head.add(b);
      const mu = M(new T.CapsuleGeometry(hr * 0.09, hr * 0.5, 4, 8), mBeard); mu.rotation.x = Math.PI / 2; mu.position.set(hr * 0.86, -hr * 0.33, 0); mu.scale.y = 1; head.add(mu);
    } else { const m = M(new T.CapsuleGeometry(hr * 0.035, hr * 0.28, 3, 6), pbr('#8a3b2e', { rough: 0.4 }), false); m.rotation.x = Math.PI / 2; m.position.set(hr * 0.88, -hr * 0.42, 0); head.add(m); }
    const hw = headwear(R, L, hr, st); head.add(hw); R.headwear = hw;
    if (L.glow) { const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#fff2a8', transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending })); s.scale.set(hr * 6, hr * 6, 1); s.position.z = -hr * 1.5; head.add(s); }
    if (L.weapon === 'bow' || L.weapon === 'bow2') { R.bowBack = buildWeapon('bowback', k); R.bowBack.position.set(-0.1 * H, shY - 0.14 * H, 0); R.bowBack.rotation.z = 2.0; leanG.add(R.bowBack); }

    // extras
    const ex = (o) => { o.visible = false; root.add(o); return o; };
    R.shield = ex(new T.Mesh(new T.SphereGeometry(1, 32, 24), new T.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.05, clearcoat: 1, emissive: '#222222' }))); R.shield.position.y = H / 2;
    R.reflect = ex(new T.Mesh(new T.TorusGeometry(1, 0.035, 6, 48), new T.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.85 }))); R.reflect.position.y = H / 2;
    R.ice = ex(M(new T.BoxGeometry(hero.w * 1.5, H * 1.08, hero.w * 1.2), new T.MeshPhysicalMaterial({ color: '#bfeaff', transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.05, clearcoat: 1, emissive: '#1b4a66' }), false)); R.ice.position.y = H * 0.52;
    R.halo = ex(M(new T.CylinderGeometry(50, 50, 7, 32), metalMat('#ffe28a', 0.2), false)); R.halo.position.y = -2;
    R.glow = ex(new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#fff3a0', transparent: true, depthWrite: false, blending: T.AdditiveBlending }))); R.glow.scale.set(H * 2.2, H * 2.2, 1); R.glow.position.set(0, H / 2, -20);
    R.dirt = ex(M(new T.CylinderGeometry(hero.w, hero.w * 1.1, 8, 16), pbr('#7b5a3a'), false));
    R.gates = ex(new T.Group()); for (const s of [-1, 1]) { const d = M(new T.BoxGeometry(32, H * 0.75, 6), wmats().wood); d.position.set(s * 22, H * 1.25, 10); R.gates.add(d); const bar = M(new T.BoxGeometry(30, 4, 8), WMAT.iron); bar.position.set(s * 22, H * 1.2, 14); R.gates.add(bar); }
    R.chariot = ex(new T.Group()); { const c = M(new T.CylinderGeometry(hero.w * 1.2, hero.w * 0.9, 14, 20), pbr('#ff7a1a', { emissive: '#ff5a00', ei: 2.2 })); c.position.y = 2; R.chariot.add(c); }
    R.axe = ex(new T.Group()); { const h = M(capX(80 * k, 2.5 * k, 2.5 * k), wmats().wood); R.axe.add(h); const b = M(new T.BoxGeometry(22 * k, 30 * k, 3 * k), WMAT.steel); b.position.set(80 * k, 6 * k, 0); R.axe.add(b); R.axe.position.y = H; }
    // swing trail
    const tg = new T.BufferGeometry(); const TN = 9;
    tg.setAttribute('position', new T.BufferAttribute(new Float32Array(TN * 2 * 3), 3)); tg.setAttribute('ta', new T.BufferAttribute(new Float32Array(TN * 2), 1));
    const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } tg.setIndex(idx);
    const tm = new T.ShaderMaterial({ uniforms: { col: { value: new T.Color('#ffffff') } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'attribute float ta; varying float vA; void main(){ vA = ta; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col * vA * 1.6, vA);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }' });
    R.trailMesh = new T.Mesh(tg, tm); R.trailMesh.frustumCulled = false; R.trailMesh.matrixAutoUpdate = false; R.trailMesh.matrixWorldAutoUpdate = false; R.trailMesh.renderOrder = 6; root.add(R.trailMesh); R.TN = TN;
    root.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
    return R;
  }

  function weaponFor(R, kind) {
    if (!kind) return null;
    let w = R.weapons[kind];
    if (!w) { w = buildWeapon(kind, R.k * (R.hero.boss ? 0.8 : 1)); w.visible = false; R.armF.hand.add(w); R.weapons[kind] = w; }
    return w;
  }

  function poseRig(R, f, W, P, kOverride) {
    const H = R.H;
    const k = kOverride ?? (f && (f.move || f.hitstun > 0 || f.state === 'roll') ? 0.6 : 0.32);
    const lz = (o, t) => { o.rotation.z += (t - o.rotation.z) * k; };
    R.spinG.rotation.set(0, 0, 0);
    R.leanG.position.set(0, 0, 0); R.leanG.scale.set(1, 1, 1);
    let leanT = 0;
    if (P.horiz) { R.leanG.rotation.z = P.horiz * Math.PI / 2 * (f && f.state === 'down' ? 1 : -1); R.leanG.position.set(-H * 0.35 * P.horiz, H * 0.08 * P.horiz, 0); }
    else { leanT = -(P.lean || 0); lz(R.leanG, leanT); }
    if (P.spin) R.spinG.rotation.z = -P.spin;
    if (P.crouch) R.leanG.scale.y = 1 - P.crouch;
    const breathe = f && !f.move && f.grounded && f.state === 'idle' ? Math.sin(W.t * 0.07) * 0.012 : 0;
    R.leanG.position.y += -P.bob; R.leanG.scale.x = 1 + breathe; R.leanG.scale.z = 1 + breathe;
    const tk = P.tuck || 0;
    lz(R.legF.hip, P.legA + tk * 0.9); lz(R.legF.knee, -tk * 1.6 - Math.max(0, -P.legA) * 0.9);
    lz(R.legB.hip, P.legB + tk * 0.9); lz(R.legB.knee, -tk * 1.6 - Math.max(0, -P.legB) * 0.9);
    lz(R.armF.sh, -P.fa); lz(R.armB.sh, -P.ba);
    lz(R.armF.el, P.weaponOut ? 0.05 : 0.4); lz(R.armB.el, 0.4);
    // blink + expressions
    const blink = f && (W.t + R.H * 7) % 210 < 6;
    const lidT = P.eyes === 'o' ? (blink ? 1.45 : -0.25) : P.eyes === '-' ? 1.45 : 0.85;
    for (const l of R.lids) l.rotation.z += (lidT - l.rotation.z) * (kOverride ?? 0.6);
    // secondary motion: robe, cape, locks
    const lvx = f ? (f.vx + f.lvx) * f.facing : 0, air = f && !f.grounded ? (f.vy + f.lvy) : 0;
    const swayT = Math.max(-0.4, Math.min(0.4, -lvx * 0.035 + (f && f.move ? -0.05 : 0)));
    R.sway += (swayT - R.sway) * (kOverride ?? 0.15);
    if (R.skirt) { R.skirt.rotation.z = R.sway; R.skirt.scale.x = 1 + Math.min(0.25, Math.abs(P.legA - P.legB) * 0.12) + Math.min(0.15, Math.abs(air) * 0.01); }
    if (R.cape) {
      const target = Math.max(-0.3, Math.min(1.5, lvx * 0.1 + (air < 0 ? 0.25 : -air * 0.06) + (f && f.hitstun > 0 ? 0.8 : 0)));
      R.capeSwing += (target - R.capeSwing) * (kOverride ?? 0.12);
      const pos = R.cape.mesh.geometry.attributes.position, b = R.cape.base, ch = R.cape.ch, t0 = W.t * 0.12;
      for (let i = 0; i < pos.count; i++) { const y = b[i * 3 + 1], x = b[i * 3], t = Math.max(0, -y / ch); pos.setXYZ(i, x, y + Math.max(0, R.capeSwing) * t * t * ch * 0.25, -(Math.pow(t, 1.3) * ch * (0.14 + R.capeSwing * 0.5)) - Math.sin(t0 + t * 4 + x * 0.05) * t * ch * (0.03 + Math.abs(R.capeSwing) * 0.04)); }
      pos.needsUpdate = true; R.cape.mesh.geometry.computeVertexNormals();
    }
    if (R.locks) R.locks.forEach((l, i) => { l.rotation.z += ((-R.sway * 1.6 + Math.sin(W.t * 0.08 + i) * 0.06 + (air < 0 ? -0.25 : 0.1)) - l.rotation.z) * 0.2; });
    // weapon
    let kind = f ? Art.handWeapon(f) : defaultWeaponFor(R.hero);
    if (f && f.held && f.held.kind === 'staff') kind = 'aharon';
    if (kind === 'ruach' || kind === 'manna' || kind === 'honey') kind = null;
    for (const key in R.weapons) R.weapons[key].visible = false;
    R.flames.length = 0; R.curWeapon = null;
    const w = weaponFor(R, kind);
    if (w) {
      w.visible = true; R.curWeapon = w;
      let wa = P.fa;
      const longW = ['staff', 'bigstaff', 'spear', 'cane', 'shepherd', 'aharon'].includes(kind);
      if (!P.weaponOut && longW) wa = -Math.PI / 2 + 0.15;
      else if (!P.weaponOut && ['sword', 'club', 'mallet', 'torch'].includes(kind)) wa = P.fa - 1.2;
      if (kind === 'goliath' && !P.weaponOut) wa = -Math.PI / 2 - 0.5;
      const wr = -(wa - P.fa); w.rotation.z += (wr - w.rotation.z) * Math.max(k, 0.5);
      if (w.userData.whip) w.userData.whip.scale.x = P.anim === 'whip' ? 2.4 : 1;
      if (w.userData.spin) w.rotation.z += P.shooting ? W.t * 0.6 : 0;
      if (w.userData.flame) R.flames.push(w.localToWorld(w.userData.flame.clone()));
    }
    if (R.bowBack) R.bowBack.visible = !(kind === 'bowdraw');
    // hit flash
    R.flash = f && f.hitlag > 0 && f.damageShake > 0 ? 0.9 : R.flash * 0.72;
    const fv = R.flash * 0.7 + (f && f.finalReady ? 0.06 + Math.sin(W.t * 0.25) * 0.04 : 0);
    for (const m of R.mats) if (m.userData.flash) m.userData.flash.value = fv;
  }
  function defaultWeaponFor(hero) { return { club: 'club', sword: 'sword', spear: 'spear', mallet: 'mallet', staff: hero.look.weapon === 'mantle' ? 'mantle' : hero.look.weapon, fists: null }[hero.arch] || null; }
  function defaultWeapon(hero) { return defaultWeaponFor(hero); }

  // Smash-style swing trail from the weapon tip
  const _a = new T.Vector3(), _b = new T.Vector3();
  function updateTrail(R, f) {
    const m = f.move, d = m && m.def;
    let active = false;
    if (d && d.hits) for (const h of d.hits) if (m.t >= h.s - 2 && m.t <= h.e + 1) active = true;
    if (active) {
      if (R.curWeapon && R.curWeapon.userData.tip) { R.curWeapon.updateMatrixWorld(true); _a.copy(R.curWeapon.userData.tip).applyMatrix4(R.curWeapon.matrixWorld); _b.copy(R.curWeapon.userData.base).applyMatrix4(R.curWeapon.matrixWorld); }
      else { R.armF.hand.getWorldPosition(_a); R.armF.el.getWorldPosition(_b); _b.lerp(_a, 0.4); }
      R.trail.unshift([_a.x, _a.y, _a.z + 6, _b.x, _b.y, _b.z + 6]);
    } else if (R.trail.length) R.trail.pop();
    if (R.trail.length > R.TN) R.trail.length = R.TN;
    const pos = R.trailMesh.geometry.attributes.position, ta = R.trailMesh.geometry.attributes.ta, n = R.trail.length;
    for (let i = 0; i < R.TN; i++) {
      const p = R.trail[Math.min(i, n - 1)] || [0, 0, 0, 0, 0, 0];
      pos.setXYZ(i * 2, p[0], p[1], p[2]); pos.setXYZ(i * 2 + 1, p[3], p[4], p[5]);
      const a = i < n ? Math.pow(1 - i / R.TN, 1.5) * 0.85 : 0; ta.setX(i * 2, a); ta.setX(i * 2 + 1, a * 0.1);
    }
    pos.needsUpdate = true; ta.needsUpdate = true;
    R.trailMesh.visible = n > 1;
    R.trailMesh.material.uniforms.col.value.set(f.color).lerp(new T.Color('#ffffff'), 0.65);
  }

  /* ---------- minions, items, projectiles ---------- */
  let clayMat = null;
  function buildGolem(scale = 1) {
    const g = new T.Group();
    if (!clayMat) { clayMat = texMat('stone', '#b08a5e', '#6e5236', 1, 1, { ns: 1.6, rough: 0.95 }); }
    const clay = clayMat, lump = (geo, r, seed) => M(curly(geo, r, 0.22, seed, 2.5), clay);
    const body = lump(new T.BoxGeometry(54, 62, 40, 6, 6, 5), 40, 1); body.position.y = 72; g.add(body);
    const head = lump(new T.BoxGeometry(32, 30, 30, 5, 5, 5), 22, 2); head.position.set(4, 118, 0); g.add(head);
    for (const z of [7, -7]) { const e = new T.Mesh(new T.SphereGeometry(3, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(3, 2.2, 0.6) })); e.position.set(20, 120, z); g.add(e); }
    const tex = canvasTex(128, 48, (x) => { x.fillStyle = '#3b2a1a'; x.font = 'bold 36px "Frank Ruhl Libre", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('אמת', 64, 26); });
    const label = new T.Mesh(new T.PlaneGeometry(26, 10), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1 })); label.position.set(20.5, 128, 0); label.rotation.y = Math.PI / 2; g.add(label);
    const legs = [];
    for (const z of [11, -11]) { const p = new T.Group(); p.position.set(0, 44, z); g.add(p); p.add(M(curly(capDown(44, 11, 10), 12, 0.3, z, 3), clay)); legs.push(p); }
    const arms = [];
    for (const z of [33, -33]) { const p = new T.Group(); p.position.set(0, 94, z); g.add(p); p.add(M(curly(capX(42, 10, 9), 11, 0.3, z + 5, 3), clay)); const fist = lump(new T.BoxGeometry(19, 19, 19, 3, 3, 3), 12, z); fist.position.x = 44; p.add(fist); arms.push(p); }
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
      g.add(new T.Mesh(G.sph(18, 16, 12), new T.MeshStandardMaterial({ color: '#fff7c0', emissive: new T.Color('#ffd23a'), emissiveIntensity: 0.9 })));
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
      case 'geyser': { const c = new T.Mesh(G.cyl(p.w * 0.25, p.w * 0.55, p.h, 10, 1, true), new T.MeshStandardMaterial({ color: '#5aaeff', transparent: true, opacity: 0.75, emissive: new T.Color('#0a3a7a') })); g.add(c); g.userData.col = c; break; }
      case 'sound': { for (let i = 0; i < 3; i++) { const r = new T.Mesh(G.tor(20 + i * 12, 2.2, 4, 18, 1.6), new T.MeshBasicMaterial({ color: '#fff0b4', transparent: true, opacity: 0.8 })); r.rotation.z = -0.8; r.position.x = -(20 + i * 12); g.add(r); } break; }
      case 'firebolt': { const c = new T.Mesh(G.cone(p.w * 0.5, p.h, 8), new T.MeshStandardMaterial({ color: '#ff7a1a', emissive: new T.Color('#ff3300'), emissiveIntensity: 1 })); c.rotation.z = Math.PI; g.add(c); break; }
      case 'torch': { const w = buildWeapon('torch', 0.8); w.position.x = -12; g.add(w); g.userData.flame = new T.Vector3(14, 3, 0); break; }
      case 'milk': { const w = buildWeapon('bowl', 1); w.position.x = -10; g.add(w); break; }
      case 'peg': { const w = buildWeapon('peg', 0.9); w.position.x = -16; g.add(w); break; }
      case 'star': { const s = new T.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 0.45 : 1) * p.w / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath();
        const geo = new T.ExtrudeGeometry(s, { depth: 6, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 2, bevelSegments: 1 }); geo.translate(0, 0, -3);
        g.add(new T.Mesh(geo, new T.MeshStandardMaterial({ color: '#fff3a0', emissive: new T.Color('#ffc400'), emissiveIntensity: 0.9 }))); break; }
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
    if (kind === 'flood') { const m = new T.MeshStandardMaterial({ color: '#2a7fd4', transparent: true, opacity: 0.82, emissive: new T.Color('#06305e') }); for (const s of [-1, 1]) { const w = new T.Mesh(G.box(1, 1100, 700), m); w.userData.s = s; g.add(w); } }
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
        R.yaw.scale.x = F.dir; R.yaw.rotation.y = -0.7 * F.dir;
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
  let trails = null;
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

  const TERRAIN = {
    elah: { top: 'grass', topC: ['#8cc063', '#4f7f34'], side: 'rock', sideC: ['#a88660', '#5a4330'], grass: ['#7fb85a', '#4d8a35'], flowers: true },
    sinai: { top: 'rock', topC: ['#857491', '#4a3d52'], side: 'rock', sideC: ['#6a5873', '#2a2032'] },
    yericho: { top: 'sand', topC: ['#ecca94', '#c49a5e'], side: 'brick', sideC: ['#dcb47c', '#9c7646'] },
    carmel: { top: 'grass', topC: ['#97b06a', '#5a7a3a'], side: 'rock', sideC: ['#937563', '#4e3d32'], grass: ['#8eab62', '#5b7d3a'] },
    michmash: { top: 'sand', topC: ['#dfc290', '#b09060'], side: 'rock', sideC: ['#cdae84', '#7d6346'], grass: ['#c9b57a', '#9a8550'] },
    yamsuf: { top: 'sand', topC: ['#f2ddb4', '#cfb07f'], side: 'sand', sideC: ['#dcc293', '#a88a5c'] },
    prague: { top: 'tile', topC: ['#c4523f', '#6a2a22'], side: 'brick', sideC: ['#9a948c', '#4a4a52'] },
    midbar: { top: 'sand', topC: ['#f2d39c', '#cf9f62'], side: 'rock', sideC: ['#d6a86c', '#8a6238'] }
  };
  function texMat(kind, c1, c2, rx, ry, o = {}) {
    const t = groundTex(kind, c1, c2);
    const map = t.map.clone(), nm = t.normal.clone(); map.needsUpdate = nm.needsUpdate = true;
    map.repeat.set(rx, ry); nm.repeat.set(rx, ry);
    const m = new T.MeshStandardMaterial({ map, normalMap: nm, roughness: o.rough ?? 0.92, color: o.color || '#ffffff' });
    m.normalScale = new T.Vector2(o.ns ?? 1, o.ns ?? 1);
    if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
    return enhance(m, o.rim ?? 0.08);
  }
  const GRASS_T = { value: 0 };
  function grassMat(c) {
    const m = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: T.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = GRASS_T;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sw = sin(uTime * 1.7 + ip.x * 0.03 + ip.z * 0.05) * 0.6 + sin(uTime * 3.3 + ip.x * 0.11) * 0.25;
          transformed.x += sw * position.y * 0.32; transformed.z += sw * position.y * 0.12;
        #endif`);
    };
    m.customProgramCacheKey = () => 'grasswind';
    return m;
  }
  function bladeGeo() {
    const g = new T.BufferGeometry();
    const v = [-1.3, 0, 0, 1.3, 0, 0, -0.8, 6, 0.4, 0.8, 6, 0.4, 0, 13, 1.2];
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); g.computeVertexNormals();
    return g;
  }
  // merge several geometries (each with a flat colour) into one vertex-coloured geometry
  function mergeColored(parts) {
    const pos = [], nor = [], col = [], c = new T.Color();
    for (const { geo, color, m } of parts) {
      const gg = (geo.index ? geo.toNonIndexed() : geo.clone()); if (m) gg.applyMatrix4(m); if (!gg.attributes.normal) gg.computeVertexNormals();
      const p = gg.attributes.position.array, n = gg.attributes.normal.array; c.set(color);
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); const sh = 0.86 + ((i * 7919) % 97) / 97 * 0.24; col.push(c.r * sh, c.g * sh, c.b * sh); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
  }
  const VCOL = () => enhance(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 0.12);
  const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(s, s, s));
  const treeGeoCache = {};
  function treeGeo(kind) {
    if (treeGeoCache[kind]) return treeGeoCache[kind];
    const parts = [];
    if (kind === 'palm') {
      for (let i = 0; i < 8; i++) parts.push({ geo: new T.CylinderGeometry(5.2 - i * 0.25, 6 - i * 0.25, 18, 8), color: i % 2 ? '#7a5a3a' : '#6a4c30', m: mtx(i * 2.2, 9 + i * 17, 0, 0, 0, -0.06) });
      for (let i = 0; i < 9; i++) { const lf = deform(new T.PlaneGeometry(80, 16, 8, 1), (v) => { const t = (v.x + 40) / 80; v.y -= t * t * 34; v.y *= 1; v.z += Math.abs(v.y) * 0; }); lf.translate(40, 0, 0); parts.push({ geo: lf, color: i % 2 ? '#3f8a3a' : '#2f6e2d', m: mtx(18, 145, 0, (i % 2) * 0.3, i * TAU / 9, 0.25) }); }
    } else if (kind === 'olive' || kind === 'terebinth') {
      const tc = kind === 'olive' ? '#7a6a52' : '#6d4c2f', lc = kind === 'olive' ? ['#7f9a6a', '#93ad7c'] : ['#4f7c3c', '#5f9147'];
      parts.push({ geo: deform(new T.CylinderGeometry(5, 10, 70, 9, 6), (v) => { v.x += Math.sin(v.y * 0.05) * 6; }), color: tc, m: mtx(0, 35, 0) });
      for (const [x, y, z, r] of [[0, 92, 0, 38], [-30, 74, 8, 28], [32, 76, -6, 30], [-14, 112, -10, 24], [16, 110, 12, 24], [0, 80, 30, 24], [4, 80, -30, 24]]) parts.push({ geo: curly(new T.IcosahedronGeometry(r, 2), r, 0.45, x, 2.4), color: lc[(x + y) % 2 ? 0 : 1], m: mtx(x, y, z) });
    } else if (kind === 'cypress') {
      parts.push({ geo: new T.CylinderGeometry(3, 5, 30, 7), color: '#5a4030', m: mtx(0, 15, 0) });
      parts.push({ geo: curly(deform(new T.SphereGeometry(22, 14, 18), (v) => { v.y *= 3; }), 22, 0.35, 3, 3), color: '#2f5a32', m: mtx(0, 90, 0) });
    }
    return (treeGeoCache[kind] = mergeColored(parts));
  }
  function hillRidge(x0, x1, z, base, amp, freq, seed, cTop, cBot, depthAmp = 60) {
    const N = 140, Rr = 8, pos = [], col = [], idx = [], a = new T.Color(cTop), b = new T.Color(cBot);
    for (let r = 0; r <= Rr; r++) for (let i = 0; i <= N; i++) {
      const t = r / Rr, x = x0 + (x1 - x0) * i / N; const h = base + amp * (fbm(x * freq + seed, seed, 4) * 1.2 - 0.1);
      const y = (base - amp * 2.5) + (h - (base - amp * 2.5)) * t; const zz = z + (fbm(x * freq * 3, t * 3 + seed, 2) - 0.5) * depthAmp * t - (1 - t) * 40;
      pos.push(x, y, zz); const cc = b.clone().lerp(a, Math.pow(t, 1.5)); col.push(cc.r, cc.g, cc.b);
    }
    for (let r = 0; r < Rr; r++) for (let i = 0; i < N; i++) { const p = r * (N + 1) + i; idx.push(p, p + 1, p + N + 1, p + 1, p + N + 2, p + N + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, enhance(new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.05)); m.receiveShadow = false; return m;
  }
  function waterMat(color, opacity = 1) {
    const nm = TX.water.normal.clone(); nm.needsUpdate = true; nm.repeat.set(8, 8);
    const m = new T.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, normalMap: nm, normalScale: new T.Vector2(0.6, 0.6), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    return m;
  }

  function buildStage(st) {
    const root = new T.Group(), D = 300, TR = TERRAIN[st.deco] || TERRAIN.elah;
    const anim = [];
    let boulderMatCache = null;
    const sideRep = TR.side === 'brick' ? 1 / 110 : 1 / 230;
    const sideMat = texMat(TR.side, TR.sideC[0], TR.sideC[1], sideRep, sideRep, { ns: 1.4 });
    const topMat = texMat(TR.top, TR.topC[0], TR.topC[1], 1, 1, { ns: 1.1, rough: TR.top === 'tile' ? 0.6 : 0.95 });
    for (const g of st.ground) {
      const sh = new T.Shape(); const deep = g.h > 200;
      sh.moveTo(g.x, -g.y); sh.lineTo(g.x + g.w, -g.y);
      if (deep) { sh.lineTo(g.x + g.w, -(g.y + g.h)); sh.lineTo(g.x, -(g.y + g.h)); }
      else {
        const pts = [[1, 0.0], [0.97, 0.6], [0.85, 1.0], [0.72, 1.5], [0.6, 2.1], [0.5, 2.6], [0.38, 2.0], [0.26, 1.6], [0.12, 1.1], [0.03, 0.55], [0, 0]];
        for (const [fx, fy] of pts) sh.lineTo(g.x + g.w * fx, -(g.y + g.h * fy));
      }
      sh.closePath();
      const geo = new T.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelSize: 10, bevelThickness: 14, bevelSegments: 2, curveSegments: 4 });
      geo.translate(0, 0, -D / 2);
      // break up the rock below the surface
      const p = geo.attributes.position, v = new T.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const below = -g.y - v.y; if (below > 22) { const n = (fbm3(v.x * 0.012, v.y * 0.012, v.z * 0.012, 3) - 0.5) * Math.min(1, below / 60) * 46; v.x += n; v.y += n * 0.6; v.z += n * 0.8; p.setXYZ(i, v.x, v.y, v.z); } }
      geo.computeVertexNormals();
      const m = new T.Mesh(geo, sideMat); m.receiveShadow = true; m.castShadow = true; root.add(m);
      const topMat2 = topMat.clone(); topMat2.map = topMat.map.clone(); topMat2.normalMap = topMat.normalMap.clone(); topMat2.map.needsUpdate = topMat2.normalMap.needsUpdate = true;
      topMat2.map.repeat.set((g.w + 20) / 170, (D + 20) / 170); topMat2.normalMap.repeat.copy(topMat2.map.repeat); enhance(topMat2, 0.06);
      const top = new T.Mesh(deform(new T.BoxGeometry(g.w + 22, 18, D + 22, 24, 1, 6), (vv) => { if (vv.y < 0) vv.y -= 0; }), topMat2); top.position.set(g.x + g.w / 2, -g.y - 8, 0); top.receiveShadow = true; root.add(top);
      if (TR.grass) {
        const n = Math.min(4200, Math.floor(g.w * D / 70)), im = new T.InstancedMesh(bladeGeo(), grassMat(), n), c = new T.Color(), ca = new T.Color(TR.grass[0]), cb = new T.Color(TR.grass[1]);
        for (let i = 0; i < n; i++) {
          const x = g.x + 4 + Math.random() * (g.w - 8), z = -D / 2 - 6 + Math.random() * (D + 12), s = 0.7 + Math.random() * 0.9;
          im.setMatrixAt(i, mtx(x, -g.y + 1, z, 0, Math.random() * TAU, 0, s)); im.setColorAt(i, c.copy(cb).lerp(ca, Math.random()));
        }
        im.receiveShadow = true; root.add(im);
        if (TR.flowers) { const fl = new T.InstancedMesh(new T.IcosahedronGeometry(2.2, 0), enhance(new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 0.1), 140); for (let i = 0; i < 140; i++) { fl.setMatrixAt(i, mtx(g.x + Math.random() * g.w, -g.y + 9 + Math.random() * 4, -D / 2 + Math.random() * D)); fl.setColorAt(i, c.set(['#ffffff', '#f5d142', '#e8505b', '#c9a0ff'][i % 4])); } root.add(fl); }
      }
      // boulders along the front edge
      const boulderMat = boulderMatCache || (boulderMatCache = texMat('rock', TR.sideC[0], TR.sideC[1], 1, 1, { ns: 1.3 }));
      for (let i = 0; i < g.w / 90; i++) { const r = 10 + (i % 3) * 7; const b = new T.Mesh(curly(new T.IcosahedronGeometry(r, 1), r, 0.5, i, 2), boulderMat); b.position.set(g.x + 30 + i * 90 + (i * 37) % 40, -g.y - 40 - (i * 29) % 70, D / 2 + 10); b.castShadow = true; root.add(b); }
    }
    if (st.deco === 'michmash') {
      st.ground.forEach((g, i) => { const tex = canvasTex(256, 96, (x) => { x.fillStyle = 'rgba(255,248,230,.9)'; x.font = 'bold 64px "Frank Ruhl Libre", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(i ? 'סֶנֶּה' : 'בּוֹצֵץ', 128, 50); });
        const p = new T.Mesh(new T.PlaneGeometry(150, 56), new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })); p.position.set(g.x + g.w / 2, -g.y - 80, D / 2 + 20); root.add(p); });
    }
    // platforms
    const walls = [];
    const stoneMat = texMat('stone', TR.sideC[0], TR.sideC[1], 1 / 120, 1 / 120, { ns: 1.2 });
    const rockLocal = texMat('rock', TR.sideC[0], TR.sideC[1], 1, 1, { ns: 1.2 });
    for (const p of st.plats) {
      if (p.cloud) { const c = new T.Group(); const cm = enhance(new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#5a5070', emissiveIntensity: 0.5 }), 0.4); for (let i = 0; i < 7; i++) { const r = 22 + (i % 3) * 4; const s = new T.Mesh(curly(new T.IcosahedronGeometry(r, 2), r, 0.35, i, 2), cm); s.position.set(p.x + 14 + i * (p.w - 28) / 6, -p.y - 10, (i % 2) * 34 - 17); c.add(s); } root.add(c); anim.push((t) => { c.children.forEach((s, i) => s.position.y = -p.y - 10 + Math.sin(t * 0.05 + i) * 2.5); }); continue; }
      if (p.altar) {
        const altarMat = texMat('stone', '#c9bca8', '#7f7366', 1, 1, { ns: 1.4 });
        for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { const s = new T.Mesh(curly(new T.BoxGeometry(37, 25, 60, 3, 2, 3), 30, 0.12, r * 3 + q, 3), altarMat); s.position.set(p.x + 39 + q * 40, -p.y - 13 - r * 27, 0); s.castShadow = s.receiveShadow = true; root.add(s); }
        const bark = woodMat('#6b4a2a'); for (let i = 0; i < 4; i++) { const l = new T.Mesh(new T.CylinderGeometry(5, 5.5, 72, 10), bark); l.rotation.x = Math.PI / 2; l.rotation.y = (i % 2) * 0.15; l.position.set(p.x + 36 + i * 28, -p.y + 5, 0); l.castShadow = true; root.add(l); }
        const warn = new T.Mesh(G.box(p.w, 150, 80), new T.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0, depthWrite: false })); warn.position.set(p.x + p.w / 2, -p.y + 75, 0); root.add(warn); root.userData.altarWarn = warn;
        continue;
      }
      if (p.wall) {
        const wg = new T.Group(); const bm = texMat('brick', '#dcb47c', '#8c6a3b', p.w / 160, 0.4, { ns: 1.4 });
        const b = new T.Mesh(G.box(p.w, 32, 120), bm); b.position.set(p.x + p.w / 2, -p.y - 16, 0); b.castShadow = b.receiveShadow = true; wg.add(b);
        for (let x = p.x + 8; x < p.x + p.w; x += 30) { const c = new T.Mesh(G.box(16, 14, 120), bm); c.position.set(x, -p.y + 7, 0); c.castShadow = true; wg.add(c); }
        const warn = new T.Mesh(G.box(p.w + 4, 36, 124), new T.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0, depthWrite: false })); warn.position.copy(b.position); wg.add(warn);
        const rub = new T.Group(); for (let i = 0; i < 9; i++) { const r = new T.Mesh(curly(new T.BoxGeometry(22, 14, 30, 2, 2, 2), 20, 0.25, i, 3), bm); r.position.set(p.x + 12 + i * p.w / 9, -p.y - 64 - (i % 2) * 12, (i % 3) * 20 - 20); r.rotation.z = i; rub.add(r); }
        root.add(wg); root.add(rub); walls.push({ wg, rub, warn }); continue;
      }
      const sh = new T.Shape(); sh.moveTo(p.x + 6, -p.y); sh.lineTo(p.x + p.w - 6, -p.y); sh.lineTo(p.x + p.w - 14, -p.y - 16); sh.lineTo(p.x + 14, -p.y - 16); sh.closePath();
      const pg = new T.ExtrudeGeometry(sh, { depth: 90, bevelEnabled: true, bevelSize: 4, bevelThickness: 6, bevelSegments: 2 }); pg.translate(0, 0, -45);
      const pl = new T.Mesh(pg, stoneMat); pl.castShadow = pl.receiveShadow = true; root.add(pl);
      const tm = topMat.clone(); tm.map = topMat.map.clone(); tm.normalMap = topMat.normalMap.clone(); tm.map.needsUpdate = tm.normalMap.needsUpdate = true; tm.map.repeat.set(p.w / 170, 0.6); tm.normalMap.repeat.copy(tm.map.repeat); enhance(tm, 0.06);
      const tp = new T.Mesh(G.box(p.w + 4, 7, 104), tm); tp.position.set(p.x + p.w / 2, -p.y - 1, 0); tp.receiveShadow = true; root.add(tp);
    }
    root.userData.walls = walls;
    if (st.hazard === 'lightning') {
      const col = new T.Mesh(G.box(80, 1000, 80), new T.MeshBasicMaterial({ color: '#ffff80', transparent: true, opacity: 0, depthWrite: false })); col.position.y = 500; root.add(col); root.userData.lcol = col;
      const bolt = new T.Group(); let px = 0, py = 1000; const bm = new T.MeshBasicMaterial({ color: new T.Color(4, 4, 3.6), toneMapped: false });
      for (let i = 0; i < 12; i++) { const nx = (Math.random() - 0.5) * 50, ny = py - 85; const len = Math.hypot(nx - px, ny - py); const s = new T.Mesh(G.box(7, len, 7), bm); s.position.set((px + nx) / 2, (py + ny) / 2, 0); s.rotation.z = -Math.atan2(nx - px, -(ny - py)); bolt.add(s); px = nx; py = ny; }
      bolt.visible = false; root.add(bolt); root.userData.bolt = bolt;
    }
    scenery(st, root, anim, TR);
    root.userData.anim = anim;
    return root;
  }

  function scenery(st, root, anim, TR) {
    const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };
    const trees = (kind, list) => { const geo = treeGeo(kind), mat = VCOL(); for (const [x, z, s, ry] of list) { const t = new T.Mesh(geo, mat); t.position.set(x, -12, z); t.scale.setScalar(s); t.rotation.y = ry || 0; t.castShadow = z > -900; root.add(t); } };
    const floor = (kind, c1, c2, y = -300, size = 9000) => { const m = new T.Mesh(new T.PlaneGeometry(size, 5000), texMat(kind, c1, c2, size / 300, 5000 / 300, { ns: 0.8 })); m.rotation.x = -Math.PI / 2; m.position.set(0, y, -2400); m.receiveShadow = true; root.add(m); return m; };
    const sunGlow = (x, y, z, r, col) => { const gl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: col, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })); gl.scale.set(r, r, 1); add(gl, x, y, z); };
    const rnd = (a, b, i) => a + (b - a) * ((Math.sin(i * 127.1 + a) * 43758.5453) % 1 + 1) % 1;
    switch (st.deco) {
      case 'elah': {
        root.add(hillRidge(-6000, 6000, -4200, 300, 520, 0.0009, 1, '#86a7a8', '#a9c4c9', 0));
        root.add(hillRidge(-5000, 5000, -3000, 80, 380, 0.0014, 4, '#6f9a5c', '#8cb079'));
        root.add(hillRidge(-4000, 4000, -1800, -120, 230, 0.002, 9, '#6aa04c', '#7fae5f'));
        floor('grass', '#8cc063', '#4f7f34', -300);
        const brook = new T.Mesh(new T.PlaneGeometry(9000, 180), waterMat('#4f8fb8')); brook.rotation.x = -Math.PI / 2; brook.position.set(0, -296, -700); root.add(brook);
        anim.push((t) => { brook.material.normalMap.offset.set(t * 0.0012, t * 0.0006); });
        trees('terebinth', Array.from({ length: 16 }, (_, i) => [-2200 + i * 290 + rnd(-60, 60, i), -480 - (i % 3) * 320, 1.3 + (i % 3) * 0.35, i]));
        trees('olive', Array.from({ length: 8 }, (_, i) => [-1500 + i * 420, -1300 - (i % 2) * 200, 1.6, i * 2]));
        break;
      }
      case 'sinai': {
        const mt = new T.Mesh(curly(new T.ConeGeometry(2600, 2900, 48, 24), 2600, 0.28, 3, 2), texMat('rock', '#6a5873', '#2a2032', 6, 6, { ns: 1.5 }));
        add(mt, 0, 1000, -4400);
        root.add(hillRidge(-6000, 6000, -3000, -50, 650, 0.0011, 3, '#3a2d44', '#2a2032'));
        root.add(hillRidge(-5000, 5000, -1700, -200, 260, 0.002, 6, '#43354d', '#2e2436'));
        anim.push((t) => { for (let i = 0; i < 14; i++) { const k = ((t * 0.6 + i * 45) % 630); P.smoke.add(Math.sin(i * 1.7 + t * 0.01) * 260, 2380 + k * 1.6, -4300, '#6e6278', 700 + k * 1.3, 0.55 * (1 - k / 630)); } for (let i = 0; i < 3; i++) P.flame.add(Math.sin(i * 2) * 60, 2400 + Math.sin(t * 0.2 + i) * 20, -4200, '#ffffff', 520 + Math.sin(t * 0.3 + i) * 60, 1); });
        floor('rock', '#4a3d52', '#2a2032', -320);
        break;
      }
      case 'yericho': {
        root.add(hillRidge(-6000, 6000, -4200, 50, 300, 0.001, 2, '#d9b289', '#e8c9a0', 0));
        const bm = texMat('brick', '#dcb47c', '#9c7646', 8, 1.2, { ns: 1.3 });
        const wall = new T.Mesh(G.box(6400, 260, 140), bm); add(wall, 0, 90, -2100);
        for (let x = -3200; x < 3200; x += 110) add(new T.Mesh(G.box(60, 52, 140), bm), x, 245, -2100);
        for (let x = -2700; x < 2800; x += 900) { const tw = new T.Mesh(G.box(200, 420, 200), bm); add(tw, x, 170, -2080); for (let k = -80; k < 100; k += 50) add(new T.Mesh(G.box(30, 40, 200), bm), x + k, 400, -2080); }
        const plaster = texMat('sand', '#e8d2a8', '#b8946a', 2, 2, { ns: 0.6 });
        for (let i = 0; i < 10; i++) { const w = 150 + (i % 3) * 40, h = 90 + (i % 4) * 30; add(new T.Mesh(G.box(w, h, 140), plaster), -2200 + i * 480, h / 2 - 30, -1500 - (i % 2) * 150); }
        trees('palm', Array.from({ length: 14 }, (_, i) => [-1900 + i * 300 + rnd(-50, 50, i), -480 - (i % 3) * 300, 1.25 + (i % 2) * 0.3, i * 0.7]));
        floor('sand', '#e6c48e', '#c49a5e', -300);
        break;
      }
      case 'carmel': {
        const sea = new T.Mesh(new T.PlaneGeometry(14000, 6000), waterMat('#21507a')); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -330, -3800); root.add(sea);
        anim.push((t) => sea.material.normalMap.offset.set(t * 0.0008, t * 0.0004));
        root.add(hillRidge(-6000, -400, -2400, -100, 560, 0.0013, 5, '#5a4a62', '#463a50'));
        root.add(hillRidge(-4500, 4500, -1400, -220, 230, 0.002, 7, '#6b7d4c', '#59683e'));
        trees('olive', Array.from({ length: 12 }, (_, i) => [-2000 + i * 360, -520 - (i % 3) * 260, 1.4 + (i % 2) * 0.3, i]));
        trees('cypress', Array.from({ length: 6 }, (_, i) => [-1700 + i * 700, -900, 1.5, 0]));
        break;
      }
      case 'michmash': {
        const rm = texMat('rock', '#cdae84', '#7d6346', 3, 3, { ns: 1.6 });
        for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const c = new T.Mesh(curly(new T.CylinderGeometry(320 + i * 60, 460 + i * 90, 1800 - i * 200, 18, 10), 400, 0.25, i * 3 + s, 2), rm); add(c, s * (1550 + i * 520), 320, -900 - i * 720); }
        root.add(hillRidge(-6000, 6000, -4300, 200, 500, 0.001, 8, '#a9b9c9', '#c4cdd6', 0));
        floor('sand', '#c9a97c', '#8a6e4a', -700);
        break;
      }
      case 'yamsuf': {
        for (const s of [-1, 1]) {
          const wm = waterMat('#2f8fd0', 0.9); wm.emissive = new T.Color('#0a3d63'); wm.emissiveIntensity = 0.6; wm.normalMap.repeat.set(4, 6);
          const w = new T.Mesh(new T.BoxGeometry(1600, 2800, 3200, 1, 1, 1), wm); add(w, s * 1750, 400, -2700);
          anim.push((t) => { wm.normalMap.offset.set(t * 0.0005 * s, -t * 0.0015); for (let i = 0; i < 18; i++) P.dot.add(s * 950 + Math.sin(i + t * 0.05) * 20, -300 + i * 150, -1150 - (i % 4) * 400, '#e8f6ff', 34, 0.25); });
        }
        const fishes = []; for (let i = 0; i < 16; i++) { const f = new T.Group(); const b = new T.Mesh(new T.SphereGeometry(14, 12, 8), pbr(['#f39c12', '#e74c3c', '#f1c40f', '#1abc9c'][i % 4], { rough: 0.4 })); b.scale.set(1.8, 1, 0.6); f.add(b); const tl = new T.Mesh(new T.ConeGeometry(10, 16, 6), pbr('#e67e22')); tl.rotation.z = Math.PI / 2; tl.position.x = -28; f.add(tl); root.add(f); fishes.push(f); }
        anim.push((t) => fishes.forEach((f, i) => { const s = i % 2 ? 1 : -1; f.position.set(s * (1000 + ((t * (1 + i % 3) + i * 300) % 1000)), -100 + (i * 190) % 1500, -1200 - (i * 230) % 2000); }));
        floor('sand', '#efd9ae', '#b9986a', -280, 1400);
        for (let i = 0; i < 10; i++) { const r = 20 + i * 5; add(new T.Mesh(curly(new T.IcosahedronGeometry(r, 1), r, 0.4, i, 2), texMat('rock', '#9b8a6a', '#5f5240', 1, 1)), -600 + i * 130, -270, -500 - i * 140); }
        break;
      }
      case 'prague': {
        const plaster = texMat('sand', '#3a4560', '#1b2234', 1, 2, { ns: 0.5 });
        const winTex = canvasTex(64, 128, (x) => { x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128); x.fillStyle = '#ffcf70'; for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) if ((r + c) % 3) x.fillRect(10 + c * 28, 14 + r * 38, 14, 20); });
        const roofM = texMat('tile', '#7a2f26', '#3a1612', 3, 3, { ns: 1.2 });
        const roofSh = new T.Shape(); roofSh.moveTo(-60, 0); roofSh.lineTo(0, 64); roofSh.lineTo(60, 0); roofSh.closePath();
        for (let i = 0; i < 18; i++) {
          const h = 260 + (i * 97) % 300, x = -2600 + i * 300, z = -700 - (i % 3) * 500;
          const front = new T.MeshStandardMaterial({ map: plaster.map, emissive: new T.Color('#ffffff'), emissiveMap: winTex, emissiveIntensity: 1.6, roughness: 0.9 });
          add(new T.Mesh(G.box(220, h, 200), [plaster, plaster, plaster, plaster, front, plaster]), x, -250 + h / 2, z);
          const roof = new T.Mesh(new T.ExtrudeGeometry(roofSh, { depth: 200, bevelEnabled: false }), roofM); roof.scale.x = 2; roof.position.set(x, -250 + h, z - 100); root.add(roof);
          if (i % 3 === 0) add(new T.Mesh(G.box(24, 60, 24), plaster), x + 50, -250 + h + 50, z);
        }
        { const sh = new T.Shape(); sh.moveTo(-240, 0); sh.lineTo(-240, 240); for (let s = 0; s < 5; s++) { sh.lineTo(-240 + s * 48, 240 + s * 44 + 44); sh.lineTo(-240 + (s + 1) * 48, 240 + s * 44 + 44); } for (let s = 4; s >= 0; s--) { sh.lineTo(240 - s * 48, 240 + s * 44 + 44); sh.lineTo(240 - s * 48, 240 + s * 44); } sh.lineTo(240, 240); sh.lineTo(240, 0); sh.closePath();
          add(new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 160, bevelEnabled: false }), texMat('brick', '#5a5a66', '#2a2a34', 1 / 120, 1 / 120)), 0, -260, -1900); }
        const moon = new T.Mesh(new T.SphereGeometry(150, 24, 16), new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.2, 1.9), toneMapped: true, fog: false })); add(moon, 1500, 1500, -4500); sunGlow(1500, 1500, -4520, 1400, '#c8d4ff');
        root.add(hillRidge(-6000, 6000, -3600, -100, 300, 0.0012, 2, '#1a2238', '#141a2c', 0));
        break;
      }
      case 'midbar': default: {
        root.add(hillRidge(-6000, 6000, -4200, 100, 600, 0.0008, 3, '#c9a07a', '#e0bf98', 0));
        root.add(hillRidge(-5000, 5000, -2800, -100, 260, 0.0016, 5, '#e2b67c', '#d7a768'));
        root.add(hillRidge(-4000, 4000, -1500, -220, 120, 0.0025, 9, '#eac48a', '#d9ad72'));
        const pc = new T.Group(); const cm = enhance(new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#8a8070', emissiveIntensity: 0.6 }), 0.5);
        for (let i = 0; i < 14; i++) { const r = 140 - i * 5; const c = new T.Mesh(curly(new T.IcosahedronGeometry(r, 2), r, 0.4, i, 2), cm); c.position.set(Math.sin(i) * 30, i * 150, 0); pc.add(c); }
        add(pc, -2600, -100, -3800); anim.push((t) => pc.children.forEach((c, i) => c.position.x = Math.sin(i + t * 0.02) * 40));
        floor('sand', '#efcf98', '#cf9f62', -300);
        break;
      }
    }
    anim.push((t) => { GRASS_T.value = t / 60; });
  }

  function setStage(st) {
    if (curStage === st.id) return;
    for (const [, g] of stageCache) g.visible = false;
    let g = stageCache.get(st.id);
    if (!g) { g = buildStage(st); stageCache.set(st.id, g); scene.add(g); }
    g.visible = true; curStage = st.id;
    const S = SKY[st.deco] || SKY.elah; curSky = S;
    const u = sky.material.uniforms;
    u.top.value.set(S.top); u.hor.value.set(S.hor); u.bot.value.set(S.bot); u.sunCol.value.set(S.sunCol); u.cloudCol.value.set(S.cc);
    u.sunDir.value.set(S.sun[0], S.sun[1], S.sun[2]).normalize(); u.cloudAmt.value = S.cloud; u.night.value = S.night || 0;
    scene.background = null;
    const Lc = LIGHT[st.deco] || LIGHT.elah;
    hemi.color.set(Lc.hemi[0]); hemi.groundColor.set(Lc.hemi[1]); hemi.intensity = Lc.hemi[2] * 0.4;
    sun.color.set(Lc.sun[0]); sun.intensity = Lc.sun[1] * 1.25;
    scene.fog = new T.Fog(new T.Color(S.hor), 3000, 9000);
    // image-based lighting from this stage's sky
    if (envRT) envRT.dispose();
    u.sunK.value = 0; u.gain.value = 0.55; u.night.value = 0;
    envRT = pmrem.fromScene(skyEnvScene, 0.04, 1, 200);
    u.sunK.value = 1; u.gain.value = 1; u.night.value = S.night || 0;
    scene.environment = envRT.texture;
    if (studio) studio.scene.environment = envRT.texture;
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
      R.yaw.scale.x = f.facing; R.yaw.rotation.y = -0.8 * f.facing;
      root.updateMatrixWorld(true); updateTrail(R, f);
      const blink = f.invuln > 0 && f.invuln < 9000 && !f.onHalo && Math.floor(W.t / 3) % 2 === 0;
      R.yaw.visible = !blink;
      R.halo.visible = !!f.onHalo;
      R.glow.visible = !!(f.finalReady || f.inFinal); if (R.glow.visible) R.glow.material.opacity = 0.55 + Math.sin(W.t * 0.2) * 0.15;
      R.ice.visible = !!(f.stun && f.stun.type === 'frozen');
      R.dirt.visible = !!(f.stun && f.stun.type === 'buried'); R.dirt.position.y = f.h * 0.45;
      R.shield.visible = f.state === 'shield';
      if (R.shield.visible) { const r = f.h * 0.55 * (0.35 + 0.65 * f.shieldHP / 100); R.shield.scale.setScalar(r); R.shield.material.color.set(f.color); R.shield.material.emissive.set(f.color).multiplyScalar(0.6); }
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
        const g = obtain(z, () => { const m = new T.Mesh(G.cyl(1, 1, 6, 20), new T.MeshStandardMaterial({ color: '#eaf8ff', transparent: true, opacity: 0.9, emissive: new T.Color('#5a8aa8') })); m.receiveShadow = true; return m; });
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

  /* ---------- sky dome (procedural gradient, sun, clouds, stars) ---------- */
  const SKY_FRAG = `
uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 cloudCol;
uniform float cloudAmt; uniform float night; uniform float time; uniform float sunK; uniform float gain;
varying vec3 vDir;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * nn(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(hor, bot, pow(clamp(-y, 0.0, 1.0), 0.5));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  c += sunCol * (pow(sd, 1400.0) * 9.0 * sunK + pow(sd, 14.0) * 0.45 + pow(sd, 3.0) * 0.08);
  if (y > 0.01) {
    vec2 uv = d.xz / (y + 0.15) * 1.4 + vec2(time * 0.006, 0.0);
    float cl = smoothstep(0.48, 0.82, fb(uv)) * cloudAmt * smoothstep(0.01, 0.2, y);
    vec3 cc = cloudCol * (0.8 + 0.35 * fb(uv * 2.0 + 3.0)) + sunCol * 0.25 * pow(sd, 5.0);
    c = mix(c, cc, cl);
  }
  if (night > 0.0) { vec2 g = floor(vec2(atan(d.x, d.z) * 320.0, y * 420.0)); float st = step(0.996, hh(g)) * (0.6 + 0.4 * sin(time * 2.0 + hh(g + 1.0) * 30.0)); c += vec3(st) * night * smoothstep(0.02, 0.3, y); }
  gl_FragColor = vec4(c * gain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
  let sky = null, skyEnvScene = null, pmrem = null, envRT = null;
  function makeSky() {
    const mat = new T.ShaderMaterial({
      uniforms: { top: { value: new T.Color() }, hor: { value: new T.Color() }, bot: { value: new T.Color() }, sunDir: { value: new T.Vector3(0.3, 0.5, -1) }, sunCol: { value: new T.Color('#fff2d0') }, cloudCol: { value: new T.Color('#ffffff') }, cloudAmt: { value: 0.6 }, night: { value: 0 }, time: { value: 0 }, sunK: { value: 1 }, gain: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false, fog: false
    });
    sky = new T.Mesh(new T.SphereGeometry(5000, 48, 24), mat); sky.renderOrder = -10; sky.frustumCulled = false;
    skyEnvScene = new T.Scene(); skyEnvScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), mat));
  }
  const SKY = {
    elah: { top: '#3d86d6', hor: '#cfe9ff', bot: '#9cc78a', sun: [0.5, 0.55, -1], sunCol: '#fff1cf', cloud: 0.62, cc: '#ffffff' },
    sinai: { top: '#1d1530', hor: '#7d5a7a', bot: '#2e2436', sun: [-0.3, 0.1, -1], sunCol: '#ff8a50', cloud: 0.9, cc: '#5b4a66', night: 0.4 },
    yericho: { top: '#4f7fc2', hor: '#ffd29c', bot: '#d9a066', sun: [-0.45, 0.2, -1], sunCol: '#ffc070', cloud: 0.35, cc: '#ffe7cc' },
    carmel: { top: '#2b2150', hor: '#f0a060', bot: '#2e5e8c', sun: [0.4, 0.04, -1], sunCol: '#ff9a40', cloud: 0.55, cc: '#e8a0a8' },
    michmash: { top: '#3b7fd0', hor: '#e8f2ff', bot: '#a8865a', sun: [-0.3, 0.6, -1], sunCol: '#fff4dc', cloud: 0.55, cc: '#ffffff' },
    yamsuf: { top: '#2e7fc8', hor: '#bfe8ff', bot: '#1f5f8a', sun: [0.2, 0.7, -1], sunCol: '#ffffff', cloud: 0.45, cc: '#ffffff' },
    prague: { top: '#050a1c', hor: '#24345a', bot: '#0b1222', sun: [0.45, 0.35, -1], sunCol: '#c8d4ff', cloud: 0.25, cc: '#3a4466', night: 1 },
    midbar: { top: '#5a9ad8', hor: '#ffe6c2', bot: '#e6b980', sun: [0.0, 0.45, -1], sunCol: '#fff4e0', cloud: 0.2, cc: '#ffffff' }
  };

  /* ---------- post-processing: MSAA scene target -> bloom chain -> tone map / grade / vignette ---------- */
  const post = { on: false, w: 0, h: 0, scene: null, bright: null, a: [], b: [], quad: null, qcam: null, mBright: null, mBlur: null, mComp: null };
  const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function makePost() {
    post.qcam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    post.quad = new T.Mesh(new T.PlaneGeometry(2, 2)); post.quad.frustumCulled = false;
    post.qscene = new T.Scene(); post.qscene.add(post.quad);
    post.mBright = new T.ShaderMaterial({ uniforms: { t: { value: null }, thr: { value: 0.82 } }, vertexShader: FS_VERT, toneMapped: false,
      fragmentShader: 'uniform sampler2D t; uniform float thr; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float k = smoothstep(thr, thr + 0.7, l); gl_FragColor = vec4(c * k, 1.0); }' });
    post.mBlur = new T.ShaderMaterial({ uniforms: { t: { value: null }, dir: { value: new T.Vector2() } }, vertexShader: FS_VERT, toneMapped: false,
      fragmentShader: 'uniform sampler2D t; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += (texture2D(t, vUv + dir * 1.385).rgb + texture2D(t, vUv - dir * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + dir * 3.231).rgb + texture2D(t, vUv - dir * 3.231).rgb) * 0.070; gl_FragColor = vec4(c, 1.0); }' });
    post.mComp = new T.ShaderMaterial({ uniforms: { tS: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, bloom: { value: 0.85 }, vig: { value: 0.32 }, sat: { value: 1.1 }, flash: { value: 0 } }, vertexShader: FS_VERT,
      fragmentShader: `uniform sampler2D tS, b0, b1, b2, b3; uniform float bloom, vig, sat, flash; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tS, vUv).rgb;
          vec3 b = texture2D(b0, vUv).rgb * 0.5 + texture2D(b1, vUv).rgb * 0.7 + texture2D(b2, vUv).rgb * 0.9 + texture2D(b3, vUv).rgb * 1.1;
          c += b * bloom * 0.45 + vec3(flash);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(l), c, sat), 0.0);
          vec2 d = vUv - 0.5; c *= 1.0 - vig * dot(d, d) * 1.8;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
  }
  function sizePost(w, h) {
    if (post.w === w && post.h === h && post.scene) return;
    [post.scene, post.bright, ...post.a, ...post.b].forEach(r => r && r.dispose());
    post.w = w; post.h = h;
    post.scene = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: quality >= 2 ? 4 : 0 });
    const opt = { type: T.HalfFloatType, depthBuffer: false };
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    post.bright = new T.WebGLRenderTarget(bw, bh, opt);
    post.a = []; post.b = [];
    for (let i = 0; i < 4; i++) { post.a.push(new T.WebGLRenderTarget(bw, bh, opt)); post.b.push(new T.WebGLRenderTarget(bw, bh, opt)); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
  }
  function pass(mat, target) { post.quad.material = mat; renderer.setRenderTarget(target); renderer.render(post.qscene, post.qcam); }
  function renderPost(flash = 0) {
    const pr = renderer.getPixelRatio();
    sizePost(Math.round(lastW * pr), Math.round(lastH * pr));
    renderer.setRenderTarget(post.scene); renderer.render(scene, camera);
    post.mBright.uniforms.t.value = post.scene.texture; pass(post.mBright, post.bright);
    let src = post.bright;
    for (let i = 0; i < 4; i++) {
      const A = post.a[i], B = post.b[i];
      post.mBlur.uniforms.t.value = src.texture; post.mBlur.uniforms.dir.value.set(1 / A.width, 0); pass(post.mBlur, A);
      post.mBlur.uniforms.t.value = A.texture; post.mBlur.uniforms.dir.value.set(0, 1 / A.height); pass(post.mBlur, B);
      src = B;
    }
    const u = post.mComp.uniforms; u.tS.value = post.scene.texture; u.b0.value = post.b[0].texture; u.b1.value = post.b[1].texture; u.b2.value = post.b[2].texture; u.b3.value = post.b[3].texture; u.flash.value = flash;
    pass(post.mComp, null);
  }

  /* ---------- camera & frame ---------- */
  function setView(cam, vw, vh, hudH, shakeX, shakeY) {
    camera.aspect = vw / vh;
    const visH = vh / cam.z;
    const dist = (visH / 2) / TAN;
    const ty = -(cam.y + hudH / (2 * cam.z));
    camera.position.set(cam.x + shakeX / cam.z, ty - shakeY / cam.z, dist);
    camera.near = Math.max(10, dist * 0.08); camera.far = dist + 12000;
    camera.lookAt(cam.x + shakeX / cam.z, ty - shakeY / cam.z, 0);
    camera.updateProjectionMatrix();
    if (scene.fog) { scene.fog.near = dist + 900; scene.fog.far = dist + 7500; }
    sky.position.copy(camera.position);
    const ps = renderer.getPixelRatio() * vh / (2 * TAN);
    for (const k in P) P[k].mat.uniforms.scale.value = ps;
    // shadow frustum hugs the visible play area
    const half = Math.min(1400, Math.max(520, visH * camera.aspect * 0.62));
    const sc = sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half * 0.8; sc.bottom = -half * 0.8; sc.updateProjectionMatrix();
    const sd = curSky ? curSky.sun : [0.4, 0.6, -1];
    sun.position.set(cam.x + sd[0] * -900 - 300, -cam.y + 1300, 1100); sun.target.position.set(cam.x, -cam.y, 0); sun.target.updateMatrixWorld();
  }

  let lastW = 0, lastH = 0, quality = 2, curSky = null;
  // adaptive quality: 2 = bloom + MSAA + 2k shadows, 1 = direct render + 1k shadows, 0 = no shadows, 1x pixels
  const perf = { last: 0, acc: 0, n: 0 };
  function setQuality(q) {
    quality = q;
    sun.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    renderer.shadowMap.enabled = q >= 1;
    if (q === 0) renderer.setPixelRatio(1);
    post.w = 0; lastW = 0;
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  function adapt() {
    const now = performance.now();
    if (perf.last) { const dt = now - perf.last; if (dt < 250) { perf.acc += dt; perf.n++; } }
    perf.last = now;
    if (perf.n >= 150) {
      const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
      if (avg > 22 && quality > 0) setQuality(quality - 1);
      else if (avg > 22 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); lastW = 0; }
    }
  }
  let curWorld = null;
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
    sky.material.uniforms.time.value = W.t / 60;
    if (quality >= 2) renderPost(0); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  }

  /* ---------- snapshots for menus / HUD ---------- */
  const snapCache = new Map();
  let studio = null;
  function snapshotHero(hero, mode) { // mode: 'full' | 'head' | 'bust'
    const key = hero.id + ':' + mode;
    if (snapCache.has(key)) return snapCache.get(key);
    if (!studio) {
      studio = { scene: new T.Scene(), cam: new T.PerspectiveCamera(26, 1, 10, 5000) };
      studio.scene.environment = envRT ? envRT.texture : null;
      studio.scene.add(new T.HemisphereLight('#ffffff', '#554466', 0.9));
      const d = new T.DirectionalLight('#fff4e4', 2.6); d.position.set(300, 500, 600); studio.scene.add(d);
      const rim = new T.DirectionalLight('#ffe2a0', 2.2); rim.position.set(-500, 300, -300); studio.scene.add(rim);
    }
    const R = buildRig(hero); R.root.userData.rig = R;
    const full = mode === 'full', bust = mode === 'bust';
    const Pz = { fa: full ? 0.15 : bust ? -2.35 : 1.3, ba: bust ? 0.75 : 1.3, lean: bust ? 0.05 : 0, legA: 0.22, legB: -0.18, crouch: 0, spin: 0, bob: 0, tuck: 0, weaponOut: true, eyes: 'o' };
    poseRig(R, null, { t: 0 }, Pz, 1);
    if (full) { for (const k in R.weapons) R.weapons[k].rotation.z = -1.2; }
    else if (bust) { for (const k in R.weapons) R.weapons[k].rotation.z = 0.55; }
    else { for (const k in R.weapons) R.weapons[k].visible = false; if (R.bowBack) R.bowBack.visible = false; }
    R.yaw.rotation.y = full ? -0.95 : bust ? -0.85 : -1.05; studio.scene.add(R.root); R.root.updateMatrixWorld(true);
    const w = full ? 260 : bust ? 360 : 180, h = full ? 330 : bust ? 270 : 180;
    const cam = studio.cam; cam.aspect = w / h;
    if (full) { const H = hero.h * 1.22; const dist = (H / 2) / Math.tan(13 * Math.PI / 180); cam.position.set(0, hero.h * 0.52, dist); cam.lookAt(0, hero.h * 0.5, 0); }
    else if (bust) { const hy = R.head.getWorldPosition(new T.Vector3()); const sz = R.hr * 6.6; const dist = (sz / 2) / Math.tan(13 * Math.PI / 180); cam.position.set(hy.x + R.hr * 1.4, hy.y - R.hr * 0.6, dist); cam.lookAt(hy.x + R.hr * 1.0, hy.y - R.hr * 1.3, 0); }
    else { const hy = R.head.getWorldPosition(new T.Vector3()); const sz = R.hr * 4.4; const dist = (sz / 2) / Math.tan(13 * Math.PI / 180); cam.position.set(hy.x + R.hr * 0.5, hy.y - R.hr * 0.1, dist); cam.lookAt(hy.x + R.hr * 0.3, hy.y - R.hr * 0.25, 0); }
    cam.updateProjectionMatrix();
    renderer.setRenderTarget(null); renderer.setSize(w, h, false); renderer.setClearColor(0x000000, 0);
    renderer.render(studio.scene, cam);
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
    renderer.setRenderTarget(null); renderer.setSize(w, h, false);
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
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(FOV, 16 / 9, 10, 12000);
    makeTextures(); makeSurfaceTextures(); makeSky(); makePost();
    scene.add(sky);
    pmrem = new T.PMREMGenerator(renderer);
    hemi = new T.HemisphereLight('#ffffff', '#444444', 0.6); scene.add(hemi);
    amb = new T.AmbientLight('#ffffff', 0.0); scene.add(amb);
    sun = new T.DirectionalLight('#ffffff', 2.6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -1100, right: 1100, top: 900, bottom: -700, near: 100, far: 4000 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 1.2; sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    dyn = new T.Group(); scene.add(dyn);
    P = { dot: Particles(TEX.dot, true), norm: Particles(TEX.dot, false), smoke: Particles(TEX.dot, false), flame: Particles(TEX.flame, true), star: Particles(TEX.star, true), ring: Particles(TEX.ring, true, 300) };
    for (const k in P) scene.add(P[k].pts);
    trails = new T.Group(); scene.add(trails);
    ok = true;
    if (mobile) setQuality(1);
    return true;
  }

  function debugNaN() { const out = []; scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.position) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) { let path = o.geometry.type; let q = o.parent, d = 0; while (q && d < 4) { path += '<' + (q.type) ; q = q.parent; d++; } out.push(path + ' idx' + i); break; } } }); return out; }
  return { debugNaN, init, frame, snapshotHero, snapshotStage, get ok() { return ok; }, get quality() { return quality; }, setQuality, setEnabled(v) { if (canvas) canvas.style.display = v ? 'block' : 'none'; } };
})();
