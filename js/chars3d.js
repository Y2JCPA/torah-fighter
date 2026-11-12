/* Torah Fighter — skinned heroes. Loads the KayKit Adventurers models (CC0, Kay Lousberg, www.kaylousberg.com),
   recolours and dresses them per hero, and drives their skeletal animation from the 2D fighter state.
   render3d.js asks for a rig with build(hero) and poses it every frame with pose(R, f, W); if the models are not
   loaded (or fail to load) build() returns null and the renderer falls back to its procedural figures. */
'use strict';

const Chars3D = (() => {
  let T = null, api = null;
  const BASES = {}, CLIPS = {}, texCache = new Map();
  const st = { status: 'idle', progress: 0, error: null };
  let promise = null;
  const DIR = 'assets/kaykit/';
  const FILES = ['Mage', 'Knight', 'Barbarian', 'Rogue'];
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- per-hero dressing ----------
     base: which model; head: head-bone scale (the pack is chibi; smaller heads read as taller, older figures);
     slim: width/height ratio of the model scale; long: ankle-length robe; cape: colour of the back cloth (false = none);
     metal: armour tint; idle: standing clip. */
  const CFG = {
    avraham: { base: 'Mage', head: 0.84, long: true, cape: '#f4f1e8' },
    moshe: { base: 'Mage', head: 0.66, slim: 0.8, long: true, cape: '#cdbb93' },
    david: { base: 'Rogue', headFrom: 'Knight', head: 0.86, cape: '#a8231a' },
    shimshon: { base: 'Barbarian', head: 0.78, broad: 1.2, slim: 1.08, cape: false, idle: 'Unarmed_Idle', ownBeard: true, hairCap: { back: 0.15 } },
    benaya: { base: 'Knight', headFrom: 'Barbarian', ownBeard: true, head: 0.84, cape: '#16a085', metal: '#8f9aa0' },
    yonatan: { base: 'Rogue', headFrom: 'Knight', head: 0.86, cape: '#f1c40f' },
    maharal: { base: 'Mage', head: 0.84, long: true, cape: '#16161f' },
    yehoshua: { base: 'Knight', head: 0.84, cape: '#7e1b1b', metal: '#d9ab35' },
    eliyahu: { base: 'Mage', head: 0.84, long: true, cape: '#4a3420' },
    gideon: { base: 'Rogue', headFrom: 'Barbarian', ownBeard: true, head: 0.86, cape: false },
    pinchas: { base: 'Mage', head: 0.84, long: true, cape: false },
    yael: { base: 'Rogue', head: 0.86, long: true, cape: false, hairAs: 'headColor' },
    golyat: { base: 'Knight', headFrom: 'Barbarian', ownBeard: true, head: 0.72, cape: '#7a2318', metal: '#b07a3a' },
    soldier: { base: 'Rogue', headFrom: 'Barbarian', ownBeard: true, head: 0.86, cape: false }
  };
  for (const k in CFG) if (!CFG[k].idle) CFG[k].idle = 'Idle';

  /* atlas cells (column, row of the 8x4 gradient atlas) -> what they colour */
  const ROLES = {
    Mage: { '0,0': 'skin', '7,2': 'skin', '1,0': 'hair', '0,1': 'robe', '1,1': 'robe', '7,1': 'robeD', '2,1': 'cape', '2,2': 'leather', '0,2': 'trim', '5,0': 'belt', '3,0': 'metal', '4,0': 'metal' },
    Knight: { '0,0': 'skin', '1,0': 'hair', '0,1': 'cape', '1,1': 'trim', '3,0': 'metal', '7,0': 'metal', '2,1': 'metal', '3,1': 'metal', '4,0': 'metalD', '7,1': 'metalD' },
    Barbarian: { '0,0': 'skin', '1,0': 'hair', '0,1': 'robe', '1,1': 'robe', '2,2': 'robe', '7,0': 'cape', '6,3': 'skin' },
    Rogue: { '0,0': 'skin', '1,0': 'hair', '0,1': 'robeD', '1,1': 'robe', '1,2': 'robe', '0,2': 'trim' }
  };
  const HIDE = /Hat|Helmet|Spellbook|1H_|2H_|Shield|Offhand|Mug|Knife|Throwable|Crossbow/;

  /* ---------- loading ---------- */
  function available() { return !!(window.THREE && window.THREE.GLTFLoader && window.THREE.SkeletonUtils); }
  function preload(onProgress) {
    if (promise) return promise;
    T = window.THREE;
    if (!available()) { st.status = 'failed'; st.error = 'GLTFLoader missing'; promise = Promise.resolve(false); return promise; }
    st.status = 'loading';
    const loader = new T.GLTFLoader(); let done = 0;
    promise = Promise.all(FILES.map(n => loader.loadAsync(DIR + n + '.glb').then(g => {
      BASES[n] = prepBase(n, g);
      done++; st.progress = done / FILES.length; if (onProgress) onProgress(st.progress);
    }))).then(() => {
      if (!CLIPS.Idle) throw new Error('animations missing');
      st.status = 'ready'; return true;
    }).catch(e => { st.status = 'failed'; st.error = String(e && e.message || e); console.warn('Chars3D: models unavailable, using procedural heroes.', e); return false; });
    return promise;
  }
  function prepBase(name, g) {
    for (const c of g.animations) {
      const tracks = c.tracks.filter(t => !/IK|control|^root\./.test(t.name) && !/\.scale$/.test(t.name) && (!/\.position$/.test(t.name) || /^hips\./.test(t.name)));
      CLIPS[c.name] = new T.AnimationClip(c.name, c.duration, tracks);
    }
    let img = null;
    g.scene.traverse(o => {
      if (o.isMesh) { o.userData.shared = true; if (o.material.map) img = o.material.map.image; }
    });
    if (name === 'Barbarian') { // bare arms: move the glove cells of the arm meshes to a spare cell that is painted skin
      g.scene.traverse(o => {
        if (o.isMesh && /Arm/.test(o.name)) {
          const uv = o.geometry.attributes.uv;
          for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (Math.floor(u * 8) === 6 && v < 0.25) uv.setXY(i, u, v + 0.75); }
          uv.needsUpdate = true;
        }
      });
    }
    return { name, scene: g.scene, img };
  }

  /* ---------- per-hero atlas ---------- */
  function shadeOf(hex, m) { const c = new T.Color(hex); return [c.r * 255 * m, c.g * 255 * m, c.b * 255 * m]; }
  function srgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function heroTextures(hero, cfg) {
    const key = hero.id; if (texCache.has(key)) return texCache.get(key);
    const base = BASES[cfg.base], L = hero.look, S = 512, cw = S / 8, chh = S / 4;
    const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(base.img, 0, 0, S, S);
    const m = document.createElement('canvas'); m.width = m.height = 64; const mx = m.getContext('2d'); mx.fillStyle = 'rgb(0,200,0)'; mx.fillRect(0, 0, 64, 64);
    const col = {
      skin: srgb(L.skin), hair: srgb(cfg.hairAs ? L[cfg.hairAs] : (L.hair || L.beard || '#2a1a10')), robe: srgb(L.robe), robeD: srgb(L.robe).map(v => v * 0.72), trim: srgb(L.robe2),
      cape: srgb(cfg.cape || L.robe2), belt: srgb(cfg.belt || '#7a4a26'), leather: srgb('#7a4a26'),
      metal: cfg.metal ? srgb(cfg.metal) : null, metalD: cfg.metal ? srgb(cfg.metal).map(v => v * 0.6) : null
    };
    const roles = ROLES[cfg.base];
    for (const cell in roles) {
      const role = roles[cell], tgt = col[role]; const [cx, cy] = cell.split(',').map(Number);
      if (role === 'metal' || role === 'metalD') { mx.fillStyle = 'rgb(0,95,255)'; mx.fillRect(cx * 8, cy * 16, 8, 16); }
      if (!tgt) continue;
      const img = x.getImageData(cx * cw, cy * chh, cw, chh), d = img.data;
      const ti = (4 * cw + Math.floor(cw * 0.4)) * 4, top = Math.max(30, d[ti] * 0.3 + d[ti + 1] * 0.59 + d[ti + 2] * 0.11);
      const depth = role === 'skin' ? 0.55 : role === 'hair' ? 0.7 : 0.62;
      for (let i = 0; i < d.length; i += 4) {
        const r = clamp((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / top, 0, 1.08), k = 1 - (1 - r) * depth;
        d[i] = clamp(tgt[0] * k, 0, 255); d[i + 1] = clamp(tgt[1] * k, 0, 255); d[i + 2] = clamp(tgt[2] * k, 0, 255);
      }
      x.putImageData(img, cx * cw, cy * chh);
    }
    const map = new T.CanvasTexture(c); map.flipY = false; map.colorSpace = T.SRGBColorSpace; map.magFilter = T.LinearFilter; map.generateMipmaps = false; map.minFilter = T.LinearFilter;
    const orm = new T.CanvasTexture(m); orm.flipY = false; orm.magFilter = T.NearestFilter; orm.minFilter = T.NearestFilter; orm.generateMipmaps = false;
    const out = { map, orm }; texCache.set(key, out); return out;
  }

  /* ---------- small accessory helpers (toy-like, faceted, to match the models) ---------- */
  function flat(R, color, o = {}) {
    const m = new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0, flatShading: o.smooth ? false : true, side: o.side || T.FrontSide });
    if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
    api.enhance(m, o.rim ?? 0.18); R.mats.push(m); return m;
  }
  function M(geo, mat) { const m = new T.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
  function deform(geo, fn) { const p = geo.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }
  function put(parent, m, x = 0, y = 0, z = 0) { m.position.set(x, y, z); parent.add(m); return m; }

  /* Everything below is in head-bone units: the head is a rounded box about x ±0.54, y -0.1..0.97, z -0.5..0.53, face on +z,
     eyes near y 0.45, brows 0.6, hairline 0.7. Pieces follow the head's rounded-box outline (a superellipse seen from above). */
  const HX = 0.565, HZ = 0.55, HCZ = 0.01;
  function outline(a, n = 3) { const sx = Math.abs(Math.sin(a)) / HX, cz = Math.abs(Math.cos(a)) / HZ; return 1 / Math.pow(Math.pow(sx, n) + Math.pow(cz, n), 1 / n); }
  // a shell hugging the head: from the crown (yTop) down to low(a) at each angle a (0 = face, ±PI = back of the head)
  function shell(o) {
    const NA = o.na || 36, NV = o.nv || 10, a0 = o.from ?? -Math.PI, a1 = o.to ?? Math.PI, yTop = o.top ?? 1.02, thick = o.thick ?? 1.07;
    const pos = [], idx = [];
    for (let i = 0; i <= NA; i++) {
      const a = lerp(a0, a1, i / NA), yl = o.low(a);
      for (let j = 0; j <= NV; j++) {
        const v = j / NV, y = lerp(yTop, yl, Math.pow(v, 0.75));
        let k = thick * (y > 0.5 ? Math.pow(Math.max(0, 1 - Math.pow((y - 0.5) / (yTop - 0.5), 3)), 1 / 3) : 1);
        if (o.shape) k *= o.shape(a, y, v);
        const r = outline(a, o.n) * k; let px = Math.sin(a) * r, pz = Math.cos(a) * r + HCZ;
        if (o.pull) { const q = o.pull(a, y, v); px *= q; pz = o.pz + (pz - o.pz) * q; }
        pos.push(px, y, pz);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NV; j++) { const p = i * (NV + 1) + j, q = p + NV + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // a band around the head at height y
  function band(y, tube, grow = 1.08, tiltX = 0, sq = 1) {
    const pts = []; for (let i = 0; i < 28; i++) { const a = i / 28 * TAU, r = outline(a) * grow; pts.push(new T.Vector3(Math.sin(a) * r, y, Math.cos(a) * r + HCZ)); }
    const g = new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 56, tube, 7, true);
    if (sq !== 1) { g.translate(0, -y, 0); g.scale(1, sq, 1); g.translate(0, y, 0); }
    if (tiltX) { g.translate(0, -y, 0); g.rotateX(tiltX); g.translate(0, y, 0); }
    return g;
  }
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function buildBeard(R, g, L, cfg) {
    const len = L.beardLen || 0; if (!L.beard || len <= 0 || cfg.ownBeard) { if (cfg.ownBeard && len > 0.75) beardTail(R, g, L, len); return; }
    const mat = flat(R, L.beard, { rough: 0.92, smooth: true, side: T.DoubleSide });
    const drop = 0.02 + len * 0.5, W = len < 0.5 ? 1.45 : 1.7, chin = -0.06, side = len < 0.5 ? 0.3 : 0.42;
    const front = (a) => Math.pow(Math.max(0, Math.cos(a * 0.85)), 1.2);
    const geo = shell({ from: -W, to: W, top: 0.3, thick: 0.985, n: 2.5, na: 30, nv: 10, pz: 0.2,
      low: (a) => chin - 0.04 - drop * front(a),
      // below the chin the beard gathers towards a rounded tip under the mouth
      pull: (a, y) => { const u = clamp((chin - y) / (drop + 0.04), 0, 1); return Math.sqrt(Math.max(0.0, 1 - Math.pow(u, 2.4))) * (1 - 0.28 * u) * (1 - 0.07 * sstep(W - 0.45, W, Math.abs(a))); } });
    // the top edge: under the nose in front, rising a little to the sideburns
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(x, z - HCZ); const topY = lerp(0.2, side, sstep(0.7, 1.6, Math.abs(a))); if (y > chin) p.setY(i, chin + (y - chin) * (topY - chin) / (0.3 - chin)); }
    geo.computeVertexNormals();
    g.add(M(geo, mat));
    const mu = M(deform(new T.SphereGeometry(1, 12, 8), (v) => { v.x *= 0.24; v.y *= 0.055; v.z *= 0.06; v.y -= Math.abs(v.x) * 0.3; v.z -= v.x * v.x * 0.7; }), mat);
    put(g, mu, 0, 0.235, 0.555);
  }
  function beardTail(R, g, L, len) { // lengthens a model's own short beard
    const mat = flat(R, L.beard, { rough: 0.92, smooth: true });
    const d = 0.1 + len * 0.3;
    put(g, M(deform(new T.SphereGeometry(1, 12, 10), (v) => { const dn = v.y < 0 ? -v.y : 0; v.x *= 0.34 * (1 - dn * 0.5); v.z *= 0.17 * (1 - dn * 0.4); v.y *= v.y > 0 ? 0.14 : d; }), mat), 0, 0.02, 0.36);
  }
  function hairCap(R, g, L, o = {}) { // for the models whose head is bare under its hat
    const mat = flat(R, L.hair, { rough: 0.9, smooth: true, side: T.DoubleSide });
    g.add(M(shell({ top: 1.03, thick: 1.045, low: (a) => lerp(0.84, o.back ?? 0.12, sstep(1.0, 1.55, Math.abs(a))) }), mat));
    return mat;
  }
  function dome(r, sy = 1, phi = 0.5) { const s = new T.SphereGeometry(r, 18, 9, 0, TAU, 0, Math.PI * phi); s.scale(1, sy, 1); return s; }
  function buildHeadwear(R, g, hero, cfg) {
    const L = hero.look, hc = L.headColor || '#888888', kind = L.head;
    if (cfg.hairCap) hairCap(R, g, L, cfg.hairCap);
    switch (kind) {
      case 'turban': case 'kohen': {
        const white = flat(R, kind === 'kohen' ? '#ffffff' : '#f1ebdc', { smooth: true, rough: 0.92, side: T.DoubleSide });
        const n = kind === 'kohen' ? 4 : 3;
        for (let i = 0; i < n; i++) { const t = M(band(0.8 + i * 0.13, 0.12, 1.0 - i * 0.07, (i % 2 ? 0.07 : -0.06), 1.1), white); g.add(t); }
        g.add(M(shell({ top: 0.86 + n * 0.14, thick: 0.98, low: () => 0.7, nv: 6 }), white));
        g.add(M(band(kind === 'kohen' ? 0.87 : 0.72, 0.035, kind === 'kohen' ? 1.17 : 1.14), flat(R, kind === 'kohen' ? '#2c4fd6' : hc, { smooth: true })));
        break;
      }
      case 'crown': case 'circlet': {
        const gold = flat(R, '#e0b23a', { metal: 1, rough: 0.3, smooth: true, side: T.DoubleSide });
        if (kind === 'crown') {
          const c = M(deform(new T.CylinderGeometry(0.47, 0.44, 0.18, 20, 1, true), (v) => { if (v.y > 0) { const a = Math.atan2(v.z, v.x); v.y += Math.pow((Math.cos(a * 5) + 1) / 2, 2) * 0.24; } }), gold);
          put(g, c, 0, 1.02, 0);
          ['#c0182b', '#1f5fd1', '#18a35a', '#c0182b', '#1f5fd1'].forEach((col, i) => { const a = i / 5 * TAU + Math.PI / 2; put(g, M(new T.IcosahedronGeometry(0.05, 0), flat(R, col, { rough: 0.15, emissive: col, ei: 0.3 })), Math.cos(a) * 0.46, 1.02, Math.sin(a) * 0.46); });
        } else {
          g.add(M(band(0.84, 0.035, 0.99, -0.08), gold));
          put(g, M(new T.IcosahedronGeometry(0.06, 0), flat(R, '#2a7de1', { rough: 0.1, emissive: '#2a7de1', ei: 0.4 })), 0, 0.8, 0.56);
        }
        break;
      }
      case 'helmet': case 'bosshelm': {
        const metal = flat(R, kind === 'bosshelm' ? '#b07a3a' : (cfg.metal || '#b8c0c6'), { metal: 1, rough: 0.34, smooth: true, side: T.DoubleSide });
        g.add(M(shell({ top: 1.08, thick: 1.08, n: 2.6, low: (a) => { const b = Math.abs(a); return b < 1.0 ? 0.74 : b < 1.6 ? lerp(0.74, 0.2, sstep(1.0, 1.2, b)) : lerp(0.2, 0.0, sstep(1.6, 2.1, b)); } }), metal));
        g.add(M(band(0.76, 0.04, 1.06), metal));
        put(g, M(new T.BoxGeometry(0.09, 0.3, 0.05), metal), 0, 0.6, 0.585); // nose guard
        const plume = { yehoshua: '#7e1b1b', benaya: '#c0392b', golyat: '#b03a2e' }[hero.id];
        if (plume) { const p = M(deform(new T.TorusGeometry(0.55, 0.13, 6, 16, Math.PI * 0.72), (v) => { v.z *= 0.75; }), flat(R, plume, { rough: 0.95, smooth: true })); p.rotation.y = -Math.PI / 2; p.rotation.x = 0.15; put(g, p, 0, 0.72, -0.05); }
        break;
      }
      case 'biret': {
        const felt = flat(R, '#17171d', { rough: 0.95, smooth: true });
        put(g, M(new T.CylinderGeometry(0.82, 0.82, 0.05, 28), felt), 0, 0.9, 0);
        put(g, M(new T.CylinderGeometry(0.5, 0.56, 0.4, 24), felt), 0, 1.1, 0);
        put(g, M(new T.TorusGeometry(0.56, 0.03, 6, 24).rotateX(Math.PI / 2), flat(R, '#34343f', { smooth: true })), 0, 0.95, 0);
        break;
      }
      case 'kerchief': {
        const m = flat(R, hc, { smooth: true, rough: 0.92, side: T.DoubleSide });
        g.add(M(shell({ top: 1.05, thick: 1.09, low: (a) => { const b = Math.abs(a); return lerp(0.74, -0.25, sstep(0.7, 2.6, b)); }, shape: (a, y) => y < 0.1 ? 1 + (0.1 - y) * 0.25 : 1 }), m));
        g.add(M(band(0.78, 0.045, 1.12, -0.08), flat(R, '#3a2a1a', { smooth: true })));
        break;
      }
      case 'scarf': {
        const m = flat(R, hc, { smooth: true, rough: 0.92, side: T.DoubleSide });
        // covers the hair completely: over the crown, down past the shoulders, open only around the face
        g.add(M(shell({ top: 1.06, thick: 1.12, na: 44, nv: 12, low: (a) => { const b = Math.abs(a); return lerp(0.77, -0.42, sstep(0.95, 1.3, b)); },
          shape: (a, y) => (y < 0.1 ? 1 + (0.1 - y) * 0.3 : 1) }), m));
        g.add(M(band(0.79, 0.035, 1.14, -0.06), flat(R, L.robe2 || '#ffffff', { smooth: true })));
        break;
      }
      case 'locks': {
        const hair = flat(R, L.hair, { rough: 0.9, smooth: true }); R.locks = [];
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i - 3) / 3 * 1.45, r = outline(a) * 1.0, x0 = Math.sin(a) * r, z0 = Math.cos(a) * r;
          const piv = new T.Group(); piv.position.set(x0, 0.3, z0); g.add(piv);
          const pts = []; for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push(new T.Vector3(Math.sin(a) * t * 0.14 + Math.sin(t * 6 + i * 2) * 0.035, -t * 0.95, Math.cos(a) * t * 0.14)); }
          const tube = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 10, 0.075, 6, false);
          piv.add(M(tube, hair));
          put(piv, M(new T.SphereGeometry(0.085, 7, 5), hair), pts[5].x, pts[5].y, pts[5].z);
          put(piv, M(new T.TorusGeometry(0.08, 0.025, 5, 10).rotateX(Math.PI / 2), flat(R, L.robe2 || '#d35400', { smooth: true })), pts[4].x, pts[4].y, pts[4].z);
          R.locks.push(piv);
        }
        break;
      }
    }
    if (L.glow) { const s = new T.Sprite(new T.SpriteMaterial({ map: api.TEX.glow, color: '#fff2a8', transparent: true, opacity: 0.32, depthWrite: false, blending: T.AdditiveBlending })); s.scale.set(3.4, 3.4, 1); s.position.set(0, 0.5, -0.5); g.add(s); }
  }

  /* ---------- rig ---------- */
  const BONES = ['hips', 'spine', 'chest', 'head', 'upperarml', 'upperarmr', 'lowerarml', 'lowerarmr', 'wristl', 'wristr', 'handl', 'handr', 'handslotl', 'handslotr', 'upperlegl', 'upperlegr', 'lowerlegl', 'lowerlegr', 'footl', 'footr'];
  function build(hero) {
    if (st.status !== 'ready' || !api) return null;
    const cfg = CFG[hero.id]; if (!cfg || !BASES[cfg.base]) return null;
    const L = hero.look, H = hero.h, hs = cfg.head || 1;
    const top = 1.241 + 0.97 * hs, sy = H / top, sxz = sy * (cfg.slim || 1);
    const root = new T.Group(), yaw = new T.Group(), tilt = new T.Group(), off = new T.Group(), model = new T.Group();
    root.add(yaw); yaw.add(tilt); tilt.position.y = H / 2; tilt.add(off); off.position.y = -H / 2; off.add(model);
    model.rotation.y = Math.PI / 2; model.scale.set(sxz, sy, sxz);
    const sc = T.SkeletonUtils.clone(BASES[cfg.base].scene); model.add(sc);
    const R = { skinned: true, hero, cfg, root, yaw, tilt, model, sc, H, k: H / 90, s: sy, hr: 0.52 * hs * sy, weapons: {}, flames: [], mats: [], flash: 0, trail: [], bones: {},
      cur: null, fades: [], key: '', keyT: 0, lastT: null, phase: 0, tiltA: 0, pitchA: 0, flipA: 0, hits: 0 };
    const tex = heroTextures(hero, cfg);
    const mat = new T.MeshStandardMaterial({ map: tex.map, roughness: 1, metalness: cfg.metal ? 1 : 0, side: T.DoubleSide });
    if (cfg.metal) { mat.metalnessMap = tex.orm; mat.roughnessMap = tex.orm; } else mat.roughness = 0.78;
    api.enhance(mat, 0.2); R.mats.push(mat); R.bodyMat = mat;
    sc.traverse(o => {
      if (o.isBone) R.bones[o.name] = o;
      if (o.isMesh) {
        o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        if (HIDE.test(o.name) || (/Cape/.test(o.name) && cfg.cape === false)) o.visible = false;
      }
    });
    for (const n of BONES) if (!R.bones[n]) return null;
    if (cfg.headFrom && cfg.headFrom !== cfg.base && BASES[cfg.headFrom]) { // another model's head on this body (same skeleton)
      let own = null, skel = null; sc.traverse(o => { if (o.isSkinnedMesh) { skel = o.skeleton; if (/_Head/.test(o.name)) own = o; } });
      const donor = T.SkeletonUtils.clone(BASES[cfg.headFrom].scene); let hm = null; donor.traverse(o => { if (o.isSkinnedMesh && /_Head/.test(o.name)) hm = o; });
      if (own && hm && skel) { hm.material = mat; hm.castShadow = true; hm.receiveShadow = true; hm.frustumCulled = false; own.parent.add(hm); hm.bind(skel, hm.bindMatrix); own.visible = false; }
    }
    const B = R.bones;
    B.head.scale.setScalar(hs);
    if (cfg.broad) { B.chest.scale.set(cfg.broad, 1.06, cfg.broad * 0.96); B.head.scale.set(hs / cfg.broad, hs / 1.06, hs / (cfg.broad * 0.96)); }
    // head dressing
    const hg = new T.Group(); B.head.add(hg); R.headG = hg;
    if (!Chars3D.debugBare) { buildBeard(R, hg, L, cfg); buildHeadwear(R, hg, hero, cfg); }
    R.head = new T.Object3D(); R.head.position.set(0, 0.47, 0); B.head.add(R.head);
    // long robe
    if (cfg.long) {
      const robe = flat(R, L.robe, { smooth: true, rough: 0.85, side: T.DoubleSide }), hem = flat(R, L.robe2, { smooth: true, rough: 0.85, side: T.DoubleSide });
      const sk = new T.Group(); sk.position.y = 0.2; B.hips.add(sk); R.skirt = sk;
      const fold = (geo) => deform(geo, (v) => { const a = Math.atan2(v.z, v.x), t = clamp((0.1 - v.y) / 0.5, 0, 1); const s = 1 + 0.07 * t * Math.sin(a * 8); v.x *= s; v.z *= s; });
      const body = fold(new T.CylinderGeometry(0.4, 0.52, 0.5, 20, 3, true)); body.translate(0, -0.25, 0); body.scale(1, 1, 0.9);
      const hm = fold(new T.CylinderGeometry(0.52, 0.535, 0.06, 20, 1, true)); hm.translate(0, -0.53, 0); hm.scale(1, 1, 0.9);
      sk.add(M(body, robe)); sk.add(M(hm, hem));
    }
    if (hero.id === 'pinchas') { // the choshen
      if (!texCache.has('choshen')) { const c = document.createElement('canvas'); c.width = 64; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#c9a227'; x.fillRect(0, 0, 64, 80); const cs = ['#e74c3c', '#27ae60', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c']; for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { x.fillStyle = cs[(r * 3 + q) % 6]; x.beginPath(); x.arc(13 + q * 19, 12 + r * 19, 7, 0, TAU); x.fill(); } const tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; texCache.set('choshen', tx); }
      put(B.chest, M(new T.BoxGeometry(0.26, 0.3, 0.04), new T.MeshStandardMaterial({ map: texCache.get('choshen'), roughness: 0.3, metalness: 0.4 })), 0, 0.1, 0.345);
    }
    if (L.weapon === 'bow' || L.weapon === 'bow2') { // the bow is slung on the back until it is drawn
      const bg = new T.Group(); bg.scale.setScalar(1 / sy); bg.position.set(0.05, 0.02, -0.46); bg.rotation.z = 2.1; B.chest.add(bg);
      R.bowBack = api.buildWeapon('bowback', R.k * 0.9); R.bowBack.position.x = -8 * R.k; bg.add(R.bowBack);
    }
    // weapon mount: buildWeapon() models point along +x in px; the hand slot's long axis is +y in model units
    const mount = new T.Group(); mount.rotation.z = Math.PI / 2; mount.scale.set(1 / sy, 1 / sy, 1 / sy); B.handslotr.add(mount);
    R.armF = { hand: mount, el: B.lowerarmr };
    R.mixer = new T.AnimationMixer(sc); R.actions = {};
    R.keep = [B.spine, B.chest, B.upperarml, B.upperarmr, B.lowerarml, B.lowerarmr]; R.keepQ = R.keep.map(b => b.quaternion.clone()); R.dirty = false;
    setAnim(R, cfg.idle, 0, 0); applyAnim(R);
    return R;
  }

  /* ---------- animation ---------- */
  function setAnim(R, name, time, blend) {
    if (!CLIPS[name]) name = 'Idle';
    if (!R.cur || R.cur.name !== name) {
      if (R.cur) R.fades.push(R.cur);
      const i = R.fades.findIndex(a => a.name === name);
      if (i >= 0) R.cur = R.fades.splice(i, 1)[0];
      else { let a = R.actions[name]; if (!a) a = R.actions[name] = R.mixer.clipAction(CLIPS[name]); a.reset(); a.play(); R.cur = { name, a, w: R.fades.length && blend > 0 ? 0 : 1 }; }
      R.blend = blend;
    }
    const dur = CLIPS[name].duration;
    R.cur.a.time = dur > 0 ? clamp(time, 0, dur - 0.001) : 0;
  }
  function applyAnim(R, dt = 1) {
    const c = R.cur;
    c.w = R.blend > 0 ? Math.min(1, c.w + dt / R.blend) : 1;
    let sum = 0; for (const f of R.fades) sum += f.w;
    const rest = 1 - c.w;
    if (rest <= 0.001 || sum <= 0.0001) { for (const f of R.fades) f.a.stop(); R.fades.length = 0; c.w = 1; }
    else for (const f of R.fades) { f.w *= rest / sum; f.a.setEffectiveWeight(f.w); }
    c.a.setEffectiveWeight(c.w);
    R.mixer.update(0);
  }

  // key moments of the attack clips (seconds): w = wound up, i = impact, j = end of the active swing, e = recovered
  const KT = {
    '1H_Melee_Attack_Chop': { w: 0.52, i: 0.6, e: 1.0 }, '1H_Melee_Attack_Slice_Diagonal': { w: 0.34, i: 0.42, e: 0.95 }, '1H_Melee_Attack_Slice_Horizontal': { w: 0.2, i: 0.28, j: 0.38, e: 1.0 },
    '1H_Melee_Attack_Stab': { w: 0.33, i: 0.43, j: 0.75, e: 1.45 }, '2H_Melee_Attack_Chop': { w: 0.6, i: 0.85, e: 1.5 }, '2H_Melee_Attack_Slice': { w: 0.33, i: 0.41, j: 0.47, e: 1.05 },
    '2H_Melee_Attack_Spin': { w: 0.57, i: 0.66, j: 1.36, e: 1.9 }, '2H_Melee_Attack_Stab': { w: 0.33, i: 0.43, j: 0.8, e: 1.45 },
    'Unarmed_Melee_Attack_Kick': { w: 0.2, i: 0.36, j: 0.5, e: 0.9 }, 'Unarmed_Melee_Attack_Punch_A': { w: 0.33, i: 0.48, j: 0.75, e: 1.35 }, 'Unarmed_Melee_Attack_Punch_B': { w: 0.34, i: 0.5, j: 0.7, e: 1.5 },
    'Dualwield_Melee_Attack_Chop': { w: 0.38, i: 0.5, j: 0.62, e: 1.2 }, 'Throw': { w: 0.57, i: 0.74, j: 0.8, e: 1.3 }, 'Spellcast_Shoot': { w: 0.17, i: 0.28, j: 0.45, e: 0.9 },
    'Spellcast_Raise': { w: 0.13, i: 0.55, j: 1.45, e: 2.05 }, 'Use_Item': { w: 0.15, i: 0.5, j: 1.1, e: 1.55 }, 'Interact': { w: 0.1, i: 0.36, j: 0.7, e: 1.25 },
    '1H_Ranged_Shoot': { w: 0.25, i: 0.37, j: 0.5, e: 1.0 }, '2H_Ranged_Shoot': { w: 0.25, i: 0.37, j: 0.5, e: 1.0 }, 'Cheer': { w: 0.04, i: 0.14, j: 1.3, e: 1.6 },
    'Spellcast_Long': { w: 0.3, i: 1.0, j: 1.9, e: 2.3 }, 'Dodge_Forward': { w: 0.03, i: 0.1, j: 0.36, e: 0.39 }, 'Block_Attack': { w: 0.36, i: 0.45, j: 0.5, e: 0.9 }
  };
  const TWO = { staff: 1, bigstaff: 1, shepherd: 1, cane: 1, aharon: 1, spear: 1, busters: 1, goliath: 1 };
  // def.anim -> [clip, {pitch: lean the torso (rad, + = forward), tilt: lean the whole body, flip: turn around}]
  const ATK = {
    fist: { jab: ['Unarmed_Melee_Attack_Punch_A', { tilt: -0.12 }], swing: ['Unarmed_Melee_Attack_Punch_A', { tilt: -0.2 }], whip: ['Unarmed_Melee_Attack_Punch_A'], overhead: ['1H_Melee_Attack_Chop', { tilt: -0.22 }], slam: ['Dualwield_Melee_Attack_Chop', { tilt: -0.25 }], thrust: ['Unarmed_Melee_Attack_Kick'],
      up: ['Unarmed_Melee_Attack_Punch_B'], low: ['Unarmed_Melee_Attack_Kick', { tilt: 0.25 }], spin: ['2H_Melee_Attack_Spin'], back: ['Unarmed_Melee_Attack_Kick', { flip: 1 }], down: ['Dualwield_Melee_Attack_Chop', { tilt: -0.6 }] },
    one: { jab: ['1H_Melee_Attack_Stab'], swing: ['1H_Melee_Attack_Slice_Horizontal'], whip: ['1H_Melee_Attack_Slice_Horizontal'], overhead: ['1H_Melee_Attack_Chop'], slam: ['1H_Melee_Attack_Chop'], thrust: ['1H_Melee_Attack_Stab'],
      up: ['1H_Melee_Attack_Chop', { pitch: -0.3, k: { w: 0.1, i: 0.2, j: 0.46, e: 0.06 } }], low: ['1H_Melee_Attack_Slice_Horizontal', { pitch: 0.5 }], spin: ['2H_Melee_Attack_Spin'], back: ['1H_Melee_Attack_Slice_Horizontal', { flip: 1 }], down: ['1H_Melee_Attack_Chop', { tilt: -0.6 }] },
    two: { jab: ['2H_Melee_Attack_Stab'], swing: ['2H_Melee_Attack_Slice'], whip: ['2H_Melee_Attack_Slice'], overhead: ['2H_Melee_Attack_Chop'], slam: ['2H_Melee_Attack_Chop'], thrust: ['2H_Melee_Attack_Stab'],
      up: ['2H_Melee_Attack_Chop', { pitch: -0.3, k: { w: 0.52, i: 0.66, j: 0.83, e: 1.5 } }], low: ['2H_Melee_Attack_Slice', { pitch: 0.5 }], spin: ['2H_Melee_Attack_Spin'], back: ['2H_Melee_Attack_Slice', { flip: 1 }], down: ['2H_Melee_Attack_Chop', { tilt: -0.6 }] }
  };
  const COMMON = { rise: ['Cheer'], crawl: ['Dodge_Forward', { tilt: -1.0 }], cast: ['Spellcast_Shoot'], point: ['Spellcast_Shoot'], raise: ['Spellcast_Raise'], harp: ['Spellcast_Long'], eat: ['Use_Item'], grab: ['Interact'], throw: ['Throw'], flash: ['Spellcast_Raise'] };
  function attackSpec(f, kind) {
    const m = f.move, d = m.def || {}, A = d.anim || 'swing';
    const cls = !kind ? 'fist' : TWO[kind] ? 'two' : 'one';
    let e = COMMON[A] || ATK[cls][A];
    if (A === 'shoot') e = kind === 'bowdraw' ? ['2H_Ranged_Shoot'] : (kind === 'slingdraw' || kind === 'sling') ? ['Throw'] : d.item ? ['Throw'] : ['Spellcast_Shoot'];
    if (!e) e = ATK[cls].swing;
    const name = e[0], o = e[1] || {}, K = o.k || KT[name] || { w: 0.2, i: 0.4, e: CLIPS[name] ? CLIPS[name].duration : 1 };
    const fr = Math.max(2, d.frames || 30), hit = d.hits && d.hits.length ? d.hits[0] : null;
    const last = d.hits && d.hits.length ? d.hits[d.hits.length - 1] : null;
    const s = clamp(hit ? hit.s : d.chargeAt != null ? d.chargeAt + 2 : Math.round(fr * 0.35), 1, fr - 1);
    const en = clamp(last ? last.e : s + 3, s + 1, fr);
    const cw = d.charge != null && d.charge < s ? d.charge : d.chargeAt != null && d.chargeAt < s ? d.chargeAt : Math.max(0.5, s * 0.55);
    const j = K.j != null ? K.j : K.i + Math.min(0.14, (en - s) / 60);
    const t = m.t || 0; let ct;
    if (t <= cw) ct = lerp(0, K.w, t / cw);
    else if (t <= s) ct = lerp(K.w, K.i, (t - cw) / Math.max(0.001, s - cw));
    else if (t <= en) ct = lerp(K.i, j, (t - s) / (en - s));
    else ct = lerp(j, K.e, clamp((t - en) / Math.max(1, fr - en), 0, 1));
    const act = t >= cw && t <= en + 4 ? 1 : clamp(1 - (t - en - 4) / 6, 0, 1) * (t > en ? 1 : clamp(t / cw, 0, 1));
    return { clip: name, time: ct, blend: 3, tilt: (o.tilt || 0) * act, pitch: (o.pitch || 0) * act, flip: o.flip ? act : 0, charging: (d.charge != null && t === d.charge && m.charge > 0) || (d.chargeAt != null && t === d.chargeAt && m.charge > 0) };
  }

  function loopT(R, name, rate, dt) { R.phase += dt / 60 * rate; const d = CLIPS[name] ? CLIPS[name].duration : 1; if (R.phase >= d) R.phase %= d; return R.phase; }
  function pickSpec(R, f, W, kind, dt) {
    const s = f.state, t = R.keyT / 60, h = f.hero;
    const one = (key, clip, time, blend, extra) => Object.assign({ key, clip, time, blend }, extra);
    if (f.stun && f.stun.type === 'frozen') return { hold: true };
    if (f.move) { const a = attackSpec(f, kind); a.key = 'mv'; return a; }
    if (f.inFinal) return one('final', 'Spellcast_Raise', Math.min(0.9, 0.15 + t * 1.2), 5);
    if (s === 'grabbed' || f.grabbedBy) return one('grabbed', 'Hit_B', 0.3 + Math.sin(W.t * 0.4) * 0.05, 4, { tilt: 0.15 });
    if (f.hitstun > 0 || s === 'hit') {
      if (f.tumble && !f.grounded) return one('tumble', 'Hit_B', 0.3, 3, { spin: 0.25 });
      if (!f.grounded) return one('hitair', 'Hit_B', Math.min(0.4, 0.05 + t), 2, { tilt: 0.35 });
      return one('hit' + (R.hits & 1), R.hits & 1 ? 'Hit_B' : 'Hit_A', Math.min(R.hits & 1 ? 0.45 : 0.3, 0.03 + t * 1.1), 2);
    }
    if (f.stun) {
      if (f.stun.type === 'sleep') return one('sleep', 'Sit_Floor_Idle', loopT(R, 'Sit_Floor_Idle', 0.6, dt), 10);
      if (f.stun.type === 'buried') return one('buried', 'Hit_A', 0.12 + Math.sin(W.t * 0.3) * 0.04, 4);
      return one('dizzy', 'Hit_B', 0.42 + Math.sin(W.t * 0.09) * 0.12, 8, { tilt: Math.sin(W.t * 0.07) * 0.12 });
    }
    if (s === 'down') return one('down', 'Lie_Idle', loopT(R, 'Lie_Idle', 1, dt), 6);
    if (s === 'ledge') return one('ledge', 'Jump_Idle', loopT(R, 'Jump_Idle', 0.6, dt), 4, { hang: 1 });
    if (s === 'shield' || f.shieldStun > 0) return one('shield', 'Blocking', loopT(R, 'Blocking', 1, dt), 4);
    if (s === 'roll') return one('roll', 'Dodge_Backward', clamp(f.stateT / 22, 0, 1) * 0.38, 3, { tilt: Math.sin(clamp(f.stateT / 24, 0, 1) * Math.PI) * 0.35 });
    if (s === 'spotdodge') return one('spot', 'Dodge_Left', Math.sin(clamp(f.stateT / 20, 0, 1) * Math.PI) * 0.3, 3, { side: Math.sin(clamp(f.stateT / 20, 0, 1) * Math.PI) });
    if (s === 'airdodge') return one('airdodge', 'Dodge_Forward', clamp(f.stateT / 20, 0, 1) * 0.38, 3, { spin: 0.26, spinKey: f.stateT });
    if (s === 'grabbing' || f.grabbing) return one('grabbing', 'Interact', 0.4, 4);
    if (f.jumpSquat > 0) return one('squat', 'Jump_Start', clamp(t * 4, 0, 0.3), 2);
    if (!f.grounded) {
      if (f.helpless) return one('helpless', 'Hit_B', 0.5 + Math.sin(W.t * 0.2) * 0.04, 8, { tilt: -0.15 });
      if (R.key === 'squat' || R.key === 'rise') { if (t < 0.16 || R.key === 'squat') return one('rise', 'Jump_Start', 0.3 + clamp(R.key === 'squat' ? 0 : t, 0, 0.16) * 1.4, 2); }
      return one('air', 'Jump_Idle', loopT(R, 'Jump_Idle', 1, dt), 6, { tilt: clamp(-(f.vy || 0) * 0.012, -0.12, 0.14) });
    }
    if (f.landLag > 0) return one('land', 'Jump_Land', clamp(0.14 + t * 1.5, 0, 0.62), 2);
    if (s === 'crouch') return one('crouch', 'Jump_Land', 0.3, 5);
    if (s === 'run' || s === 'walk') {
      const sp = Math.abs(f.vx || 0);
      if (s === 'run') return one('run', 'Running_A', loopT(R, 'Running_A', clamp(sp / (h.run || 5), 0.75, 1.35) * 1.25, dt), 5, { tilt: -0.1 });
      return one('walk', 'Walking_A', loopT(R, 'Walking_A', clamp(sp / (h.walk || 2.6), 0.6, 1.4) * 1.15, dt), 6);
    }
    return one('idle', R.cfg.idle, loopT(R, R.cfg.idle, 1, dt), R.key === 'down' ? 12 : 7);
  }

  const _q = new (window.THREE ? window.THREE.Quaternion : Object)(), _q2 = window.THREE ? new window.THREE.Quaternion() : null, _v = window.THREE ? new window.THREE.Vector3() : null, _d = window.THREE ? new window.THREE.Vector3() : null;
  // rotation of a bone in model space (the chain of local rotations above it)
  function modelQuat(R, bone, out) { out.copy(bone.quaternion); let p = bone.parent; while (p && p !== R.sc.parent) { out.premultiply(p.quaternion); p = p.parent; } return out; }
  // swing a bone so that its long (+y) axis points along dir (model space: +z forward, +y up), blended by k
  function aim(R, bone, dir, k) {
    modelQuat(R, bone.parent, _q2); modelQuat(R, bone, _q);
    _v.set(0, 1, 0).applyQuaternion(_q); _d.copy(dir).normalize();
    const c = new T.Quaternion().setFromUnitVectors(_v, _d).multiply(_q);
    c.premultiply(_q2.invert());
    bone.quaternion.slerp(c, k);
  }

  let UPQ = null, _e = null;
  function weaponFor(R, kind) {
    if (!kind) return null;
    let w = R.weapons[kind];
    if (!w) { w = api.buildWeapon(kind, R.k * (R.hero.boss ? 0.8 : 1) * (R.cfg.wk || 1)); w.visible = false; R.armF.hand.add(w); R.weapons[kind] = w; }
    return w;
  }

  /* pose(R, f, W, P): f may be null for the menus / finals; then P.clip / P.time choose a still or looping pose. */
  function pose(R, f, W, P) {
    const tNow = W && W.t != null ? W.t : 0;
    let dt = R.lastT == null ? 1 : tNow - R.lastT; R.lastT = tNow; if (!(dt >= 0 && dt < 5)) dt = 1;
    let kind = null;
    if (f) {
      kind = Art.handWeapon(f); if (f.held && f.held.kind === 'staff') kind = 'aharon';
      if (kind === 'ruach' || kind === 'manna' || kind === 'honey') kind = null;
      if (f.hitlag > 0 && f.damageShake > 0) { if (!R.inHit) { R.hits++; R.inHit = true; } } else if (!(f.hitstun > 0)) R.inHit = false;
    } else kind = P && P.weapon !== undefined ? P.weapon : api.defaultWeapon(R.hero);
    const spec = f ? pickSpec(R, f, W, kind, dt) : { key: 'still', clip: (P && P.clip) || R.cfg.idle, time: (P && P.time) || 0, blend: 0, tilt: (P && P.tilt) || 0 };
    if (!spec.hold) {
      // the mixer only rewrites a bone when its animated value changes, so undo last frame's procedural tweaks first
      if (R.dirty) { for (let i = 0; i < R.keep.length; i++) R.keep[i].quaternion.copy(R.keepQ[i]); R.dirty = false; }
      if (spec.key !== R.key) { R.key = spec.key; R.keyT = 0; if (spec.key !== 'mv') R.phase = spec.key === 'idle' ? R.phase : 0; } else R.keyT += dt;
      setAnim(R, spec.clip, spec.time, spec.blend);
      applyAnim(R, dt);
      for (let i = 0; i < R.keep.length; i++) R.keepQ[i].copy(R.keep[i].quaternion);
    }
    const B = R.bones;
    // whole-body lean / tumble
    const kk = f ? 0.35 : 1;
    if (spec.spin) { R.spinA = (R.spinA || 0) + spec.spin * dt; R.tilt.rotation.z = R.spinA; R.tiltA = 0; }
    else { R.spinA = 0; R.tiltA += ((spec.tilt || 0) - R.tiltA) * kk; R.tilt.rotation.z = R.tiltA; }
    R.pitchA += ((spec.pitch || 0) - R.pitchA) * 0.45; R.flipA += ((spec.flip || 0) - R.flipA) * 0.4;
    if (!spec.hold) {
      if (Math.abs(R.pitchA) > 0.01) { B.spine.rotateX(R.pitchA * 0.5); B.chest.rotateX(R.pitchA * 0.5); R.dirty = true; }
      if (spec.hang) { R.dirty = true; for (const sd of ['l', 'r']) { aim(R, B['upperarm' + sd], _d.set(sd === 'l' ? 0.22 : -0.22, 1, 0.3), 1); B['lowerarm' + sd].quaternion.identity(); } }
    }
    R.model.rotation.y = Math.PI / 2 + R.flipA * Math.PI;
    R.model.position.z = (spec.side || 0) * -R.H * 0.22;
    if (R.locks) { const lvx = f ? (f.vx + (f.lvx || 0)) * f.facing : 0; R.lockA = (R.lockA || 0) + ((clamp(lvx * 0.05, -0.5, 0.7)) - (R.lockA || 0)) * 0.15; R.locks.forEach((l, i) => { l.rotation.x = -R.lockA + Math.sin(tNow * 0.08 + i) * 0.04; }); }
    if (R.skirt) { // keep the robe over the feet
      R.sc.updateMatrixWorld(true); let fz = 0.3, fx = 0.3;
      for (const sd of ['l', 'r']) { _v.setFromMatrixPosition(B['foot' + sd].matrixWorld); B.hips.worldToLocal(_v); fz = Math.max(fz, Math.abs(_v.z)); fx = Math.max(fx, Math.abs(_v.x)); }
      const tz = clamp((fz + 0.2) / 0.47, 1, 1.9), tx = clamp((fx + 0.2) / 0.52, 1, 1.5);
      R.skirt.scale.z += (tz - R.skirt.scale.z) * (f ? 0.5 : 1); R.skirt.scale.x += (tx - R.skirt.scale.x) * (f ? 0.5 : 1);
    }
    // weapon
    for (const key in R.weapons) R.weapons[key].visible = false;
    R.flames.length = 0; R.curWeapon = null;
    const w = weaponFor(R, kind);
    if (w) {
      w.visible = true; R.curWeapon = w;
      const mv = f && f.move, shooting = mv && mv.def && mv.def.anim === 'shoot';
      // long weapons are carried upright like a walking staff unless they are being swung
      const carry = TWO[kind] && kind !== 'goliath' && !(mv || (f && (f.hitstun > 0 || f.state === 'hit' || f.state === 'down' || f.state === 'grabbed' || f.state === 'ledge' || f.helpless || f.inFinal))) && !(P && P.carry === false) ? 1 : 0;
      w.userData.carry = (w.userData.carry ?? carry) + (carry - (w.userData.carry ?? carry)) * (f ? 0.3 : 1);
      if (w.userData.carry > 0.01) {
        modelQuat(R, B.handslotr, _q).multiply(R.armF.hand.quaternion).invert();
        const run = f && (f.state === 'run' || !f.grounded) ? 1 : 0; w.userData.lean = (w.userData.lean || 0) + (run - (w.userData.lean || 0)) * 0.2;
        _q.multiply(UPQ).multiply(_q2.setFromEuler(_e.set(0, 0, 0.3 + w.userData.lean * 0.7)));
        w.quaternion.identity().slerp(_q, w.userData.carry);
      } else w.quaternion.identity();
      if (w.userData.whip) w.userData.whip.scale.x = mv && mv.def && mv.def.anim === 'whip' ? 2.4 : 1;
      if (w.userData.spin) w.rotation.z = shooting ? tNow * 0.6 : 0;
      if (w.userData.flame) { R.root.updateMatrixWorld(true); R.flames.push(w.localToWorld(w.userData.flame.clone())); }
    }
    if (R.bowBack) R.bowBack.visible = kind !== 'bowdraw';
    // hit flash / final-ready pulse / charge shimmer
    R.flash = f && f.hitlag > 0 && f.damageShake > 0 ? 0.9 : R.flash * 0.72;
    const fv = R.flash * 0.7 + (f && f.finalReady ? 0.06 + Math.sin(tNow * 0.25) * 0.04 : 0) + (spec.charging ? 0.1 + Math.sin(tNow * 0.9) * 0.08 : 0);
    for (const m of R.mats) if (m.userData.flash) m.userData.flash.value = fv;
    return spec;
  }

  function setup(a) { api = a; T = a.T; _e = new T.Euler(); UPQ = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1), new T.Vector3(1, 0, 0))); }
  return { preload, build, pose, setup, weaponFor, isLong: (k) => !!TWO[k], available, state: st, CFG, KT, get clips() { return CLIPS; }, get ready() { return st.status === 'ready'; } };
})();
