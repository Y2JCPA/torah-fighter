/* Torah Fighter — screens, menus, game loop, rendering glue. */
'use strict';

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = document.getElementById('ui');
  const touchEl = document.getElementById('touch');
  const rotateEl = document.getElementById('rotate');
  let vw = 0, vh = 0, dpr = 1;

  /* ---------- persistence ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tf_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tf_' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const settings = Object.assign({ music: true, sfx: true, touch: 'auto', shake: true, tapJump: true, hitboxes: false }, store.get('settings', {}));
  const rules = Object.assign({ mode: 'stock', stocks: 3, time: 3, items: 'medium', cpu: 4, teams: false, hazards: true, finals: true }, store.get('rules', {}));
  const cleared = store.get('cleared', {});
  Audio.setMusic(settings.music); Audio.setSfx(settings.sfx);
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  /* ---------- canvas ---------- */
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    rotateEl.classList.toggle('hidden', !(isTouch && vh > vw && state.scene === 'match'));
  }
  window.addEventListener('resize', resize);

  /* ---------- state ---------- */
  const state = { scene: 'title', W: null, match: null, demo: null, screenBack: null, classic: null, training: null, combo: { n: 0, dmg: 0, show: 0 } };

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function show(node, back) {
    ui.innerHTML = ''; if (node) ui.appendChild(node); state.screenBack = back || null;
    const first = node && node.querySelector('[data-nav].default') || (node && node.querySelector('[data-nav]'));
    if (first && !isTouch) first.focus({ preventScroll: true });
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function click(node, sel, fn) { node.querySelectorAll(sel).forEach(e => e.addEventListener('click', (ev) => { Audio.init(); Audio.play('menu'); fn(e, ev); })); }
  function heroCanvas(hero, w, h, full = true) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2);
    if (full) Art.portrait(x, hero, w / 2, h / 2, h * 0.95, true); else Art.portrait(x, hero, w / 2, h / 2 + 2, Math.min(w, h) * 0.8);
    return c;
  }
  function stageCanvas(stage, w, h) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2);
    const W = ENG.createWorld({ stage, players: [], stocks: 1, items: 'off', mode: 'training', noCountdown: true });
    W.cam = { x: 0, y: -120, z: Math.min(w / 1300, h / 560) };
    Art.stageBG(x, W, w, h);
    x.save(); x.translate(w / 2, h / 2); x.scale(W.cam.z, W.cam.z); x.translate(-W.cam.x, -W.cam.y); Art.stage(x, W); x.restore();
    return c;
  }

  /* ---------- spatial menu navigation (keyboard / gamepad) ---------- */
  function navMove(dx, dy) {
    const items = [...ui.querySelectorAll('[data-nav]')].filter(e => e.offsetParent !== null && !e.disabled);
    if (!items.length) return;
    let cur = document.activeElement;
    if (!items.includes(cur)) { items[0].focus(); return; }
    if (cur.tagName === 'SELECT' && dx) { cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + dx)); cur.dispatchEvent(new Event('change')); Audio.play('menu'); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = 1e9;
    for (const e of items) {
      if (e === cur) continue;
      const q = e.getBoundingClientRect(), ex = q.left + q.width / 2, ey = q.top + q.height / 2;
      const ddx = ex - cx, ddy = ey - cy;
      if (dx && Math.sign(ddx) !== dx) continue; if (dy && Math.sign(ddy) !== dy) continue;
      if (dx && Math.abs(ddx) < 4) continue; if (dy && Math.abs(ddy) < 4) continue;
      const d = dx ? Math.abs(ddx) + Math.abs(ddy) * 2.5 : Math.abs(ddy) + Math.abs(ddx) * 2.5;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); Audio.play('menu'); }
  }
  function menuTick() {
    const m = Input.menu();
    if (!ui.firstElementChild) return;
    if (m.up) navMove(0, -1); if (m.down) navMove(0, 1); if (m.left) navMove(-1, 0); if (m.right) navMove(1, 0);
    if (m.ok) { const a = document.activeElement; if (a && a.matches('[data-nav]') && ui.contains(a)) { Audio.init(); if (a.tagName !== 'SELECT' && !(m.nativeKey && a.tagName === 'BUTTON')) a.click(); } }
    if (m.back && state.screenBack) { Audio.play('back'); state.screenBack(); }
  }

  /* ---------- Title ---------- */
  function startDemo() {
    const pick = [...HEROES].sort(() => Math.random() - 0.5).slice(0, 4);
    const st = STAGES[Math.floor(Math.random() * (STAGES.length - 1))];
    state.demo = ENG.createWorld({ stage: st, players: pick.map(h => ({ hero: h, cpu: 6 })), stocks: 99, items: 'high', hazards: true, mode: 'training', noCountdown: true });
  }
  function titleScreen() {
    state.scene = 'title'; state.W = null; touchEl.classList.add('hidden'); if (!state.demo) startDemo();
    const n = el(`<div class="screen" style="background:linear-gradient(180deg,rgba(10,5,25,.55),rgba(10,5,25,.25) 45%,rgba(10,5,25,.75))">
      <div class="logo"><div class="he">גִּבּוֹרֵי הַתּוֹרָה</div><h1>TORAH FIGHTER</h1><p>The heroes of Tanach. Every move comes from a passuk.</p></div>
      <div class="menu">
        <button class="btn gold default" data-nav data-go="versus">⚔️ <span>Versus<small>1–4 players, CPUs, items</small></span><span class="he">קְרָב</span></button>
        <button class="btn" data-nav data-go="classic">📜 <span>Classic Journey<small>Seven battles, then Golyat</small></span><span class="he">מַסָּע</span></button>
        <button class="btn" data-nav data-go="training">🎯 <span>Training<small>Practice on a dummy</small></span><span class="he">אִמּוּן</span></button>
        <button class="btn" data-nav data-go="sefer">📖 <span>The Sefer<small>Heroes, sources & Sefaria texts</small></span><span class="he">סֵפֶר</span></button>
        <button class="btn" data-nav data-go="controls">🎮 <span>How to Play</span><span class="he">הוֹרָאוֹת</span></button>
        <button class="btn" data-nav data-go="settings">⚙️ <span>Settings</span><span class="he">הַגְדָּרוֹת</span></button>
      </div>
      <div class="foot">Move sources researched with the <a href="https://www.sefaria.org" target="_blank" rel="noopener">Sefaria</a> API · Keyboard, gamepad or touch</div>
    </div>`);
    click(n, '[data-go]', (b) => ({ versus: versusScreen, classic: classicPick, training: trainingPick, sefer: () => seferScreen('heroes'), controls: controlsScreen, settings: settingsScreen })[b.dataset.go]());
    show(n);
    Audio.startMusic(0);
  }

  /* ---------- Versus: character & slot setup ---------- */
  const DEVICE_LABEL = { any: 'Any (keyboard/pad/touch)', kbAll: 'Keyboard', kb1: 'Keyboard left (WASD)', kb2: 'Keyboard right (Arrows)', touch: 'Touch screen', pad0: 'Gamepad 1', pad1: 'Gamepad 2', pad2: 'Gamepad 3', pad3: 'Gamepad 4' };
  let slots = store.get('slots', null) || [
    { type: 'human', hero: null, device: 'any', level: 4, team: 0 },
    { type: 'cpu', hero: null, device: 'kb2', level: 4, team: 1 },
    { type: 'off', hero: null, device: 'pad1', level: 4, team: 0 },
    { type: 'off', hero: null, device: 'pad2', level: 4, team: 1 }
  ];
  let activeSlot = 0;
  function autoDevices() {
    const humans = slots.filter(s => s.type === 'human');
    const pads = Input.padIndexes();
    if (humans.length === 1) { if (!['any', 'touch', 'kbAll', 'pad0', 'pad1', 'pad2', 'pad3'].includes(humans[0].device)) humans[0].device = 'any'; return; }
    const used = new Set();
    humans.forEach((s, i) => {
      if (s.device === 'any') s.device = i === 0 ? (pads.length > 0 && humans.length > 2 ? 'pad' + pads[0] : 'kb1') : 'kb2';
      if (used.has(s.device)) { s.device = ['kb1', 'kb2', ...pads.map(p => 'pad' + p), 'touch'].find(d => !used.has(d)) || s.device; }
      used.add(s.device);
    });
  }
  function versusScreen() {
    state.scene = 'menu'; touchEl.classList.add('hidden');
    const n = el(`<div class="screen">
      <div class="hdr"><button class="btn small" data-nav data-back>← Back</button><h2>Choose Your Hero <span class="he">בְּחַר גִּבּוֹר</span></h2><button class="btn small" data-nav data-random>🎲 Random</button></div>
      <div class="grid" id="grid"></div>
      <div class="slots" id="slots"></div>
      <div class="rules" id="rules"></div>
    </div>`);
    const grid = n.querySelector('#grid');
    HEROES.forEach(h => {
      const c = el(`<div class="card" tabindex="0" data-nav data-hero="${h.id}"><div class="picks"></div>${h.guest ? '<span class="guest">GUEST</span>' : ''}<div class="nm">${esc(h.name)}<span class="he">${h.he}</span></div></div>`);
      c.insertBefore(heroCanvas(h, 100, 92), c.querySelector('.nm'));
      grid.appendChild(c);
    });
    function renderSlots() {
      autoDevices();
      const sw = n.querySelector('#slots'); sw.innerHTML = '';
      slots.forEach((s, i) => {
        const hero = s.hero ? HERO_BY_ID[s.hero] : null;
        const d = el(`<div class="slot ${i === activeSlot ? 'active' : ''} ${s.type === 'off' ? 'off' : ''}" style="border-color:${i === activeSlot ? '' : 'transparent'}">
          <div class="pl" style="color:${ENG.PCOLORS[i]}">P${i + 1} · <button class="mini" data-nav data-type="${i}" style="width:auto">${s.type === 'human' ? '🙂 Player' : s.type === 'cpu' ? '🤖 CPU' : '— Off'}</button></div>
          <div class="hn">${hero ? esc(hero.name) : s.type === 'off' ? '' : '<i>Random</i>'}</div>
          ${s.type === 'human' ? `<select data-nav data-dev="${i}">${['any', 'kbAll', 'kb1', 'kb2', 'touch', 'pad0', 'pad1', 'pad2', 'pad3'].map(dv => `<option value="${dv}" ${dv === s.device ? 'selected' : ''}>${DEVICE_LABEL[dv]}</option>`).join('')}</select>` : ''}
          ${s.type === 'cpu' ? `<select data-nav data-lvl="${i}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => `<option value="${l}" ${l === s.level ? 'selected' : ''}>CPU level ${l}</option>`).join('')}</select>` : ''}
          ${rules.teams && s.type !== 'off' ? `<button class="mini" data-nav data-team="${i}" style="background:${s.team ? '#2e6fb3' : '#b33a2e'}">Team ${s.team ? 'Blue' : 'Red'}</button>` : ''}
        </div>`);
        if (hero) d.insertBefore(heroCanvas(hero, 120, 80), d.querySelector('.hn'));
        d.addEventListener('click', (e) => { if (e.target.closest('select,button')) return; activeSlot = i; renderSlots(); });
        sw.appendChild(d);
      });
      sw.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { const s = slots[+b.dataset.type]; s.type = s.type === 'human' ? 'cpu' : s.type === 'cpu' ? 'off' : 'human'; activeSlot = +b.dataset.type; Audio.play('menu'); renderSlots(); }));
      sw.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('change', () => { slots[+b.dataset.dev].device = b.value; }));
      sw.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('change', () => { slots[+b.dataset.lvl].level = +b.value; }));
      sw.querySelectorAll('[data-team]').forEach(b => b.addEventListener('click', () => { const s = slots[+b.dataset.team]; s.team = s.team ? 0 : 1; renderSlots(); }));
      // picks on cards
      grid.querySelectorAll('.card').forEach(c => {
        const p = c.querySelector('.picks'); p.innerHTML = '';
        slots.forEach((s, i) => { if (s.type !== 'off' && s.hero === c.dataset.hero) p.appendChild(el(`<span class="pick" style="background:${ENG.PCOLORS[i]}">P${i + 1}</span>`)); });
      });
      store.set('slots', slots);
    }
    function renderRules() {
      const r = n.querySelector('#rules');
      r.innerHTML = `
        <label>Rules<select data-nav data-r="mode"><option value="stock">Stock</option><option value="time">Time</option></select></label>
        ${rules.mode === 'stock' ? `<label>Stocks<select data-nav data-r="stocks">${[1, 2, 3, 4, 5].map(v => `<option value="${v}">${v}</option>`).join('')}</select></label>` : `<label>Minutes<select data-nav data-r="time">${[1, 2, 3, 5, 7].map(v => `<option value="${v}">${v}</option>`).join('')}</select></label>`}
        <label>Items<select data-nav data-r="items"><option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label>Ruach Orb (Final)<select data-nav data-r="finals"><option value="true">On</option><option value="false">Off</option></select></label>
        <label>Teams<select data-nav data-r="teams"><option value="false">Free for all</option><option value="true">Teams</option></select></label>
        <label>Stage hazards<select data-nav data-r="hazards"><option value="true">On</option><option value="false">Off</option></select></label>
        <button class="btn gold" data-nav data-go>Choose Stage →</button>`;
      r.querySelectorAll('[data-r]').forEach(s => {
        s.value = String(rules[s.dataset.r]);
        s.addEventListener('change', () => { const k = s.dataset.r; let v = s.value; if (v === 'true' || v === 'false') v = v === 'true'; else if (!isNaN(+v)) v = +v; rules[k] = v; store.set('rules', rules); renderRules(); renderSlots(); });
      });
      r.querySelector('[data-go]').addEventListener('click', () => {
        const act = slots.filter(s => s.type !== 'off');
        if (act.length < 2) { alert('You need at least two fighters. Set another slot to Player or CPU.'); return; }
        if (rules.teams && new Set(act.map(s => s.team)).size < 2) { alert('Put fighters on both teams.'); return; }
        Audio.play('select'); stageScreen();
      });
    }
    grid.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => {
      Audio.init(); Audio.play('select');
      const s = slots[activeSlot]; if (s.type === 'off') s.type = activeSlot === 0 ? 'human' : 'cpu';
      s.hero = c.dataset.hero;
      // advance to next human/cpu slot without a hero
      for (let k = 1; k <= 4; k++) { const j = (activeSlot + k) % 4; if (slots[j].type !== 'off' && !slots[j].hero) { activeSlot = j; break; } }
      renderSlots();
    }));
    click(n, '[data-back]', () => titleScreen());
    click(n, '[data-random]', () => { slots.forEach(s => { if (s.type !== 'off') s.hero = HEROES[Math.floor(Math.random() * HEROES.length)].id; }); renderSlots(); });
    renderSlots(); renderRules();
    show(n, titleScreen);
  }

  function stageScreen() {
    const n = el(`<div class="screen">
      <div class="hdr"><button class="btn small" data-nav data-back>← Back</button><h2>Choose the Battlefield <span class="he">שְׂדֵה הַקְּרָב</span></h2><button class="btn small" data-nav data-rs>🎲 Random</button></div>
      <div class="stages" id="stg"></div></div>`);
    const box = n.querySelector('#stg');
    STAGES.forEach((s, i) => {
      const d = el(`<div class="stg ${i === 0 ? 'default' : ''}" tabindex="0" data-nav data-st="${s.id}"><div class="info"><b>${esc(s.name)} <span class="he">${s.he}</span></b><small>${esc(s.note)}${s.hazard ? ' <b style="color:#ffb37a">Hazard</b>' : ''}</small></div></div>`);
      d.insertBefore(stageCanvas(s, 260, 120), d.firstChild);
      box.appendChild(d);
    });
    const go = (id) => {
      Audio.play('select');
      const players = slots.filter(s => s.type !== 'off').map((s) => ({
        hero: s.hero ? HERO_BY_ID[s.hero] : HEROES[Math.floor(Math.random() * HEROES.length)], cpu: s.type === 'cpu' ? s.level : 0, device: s.type === 'human' ? s.device : null, team: s.team
      }));
      startMatch({ stage: STAGE_BY_ID[id], players, stocks: rules.mode === 'stock' ? rules.stocks : 99, time: rules.mode === 'time' ? rules.time * 60 : 0, items: rules.items, teams: rules.teams, hazards: rules.hazards, finals: rules.finals, mode: 'versus' });
    };
    n.querySelectorAll('[data-st]').forEach(d => d.addEventListener('click', () => go(d.dataset.st)));
    click(n, '[data-rs]', () => go(STAGES[Math.floor(Math.random() * STAGES.length)].id));
    click(n, '[data-back]', versusScreen);
    show(n, versusScreen);
  }

  /* ---------- Match ---------- */
  function startMatch(cfg, onEnd) {
    Audio.init();
    // Give each fighter a slot index matching its config position for colors
    state.W = ENG.createWorld(cfg);
    state.W.cfg.hitboxes = settings.hitboxes;
    state.match = { cfg, onEnd: onEnd || versusResults, koOrder: [] };
    state.scene = 'match'; state.demo = null;
    const useTouch = settings.touch === 'always' || (settings.touch === 'auto' && isTouch && cfg.players.some(p => !p.cpu && (p.device === 'touch' || p.device === 'any')));
    touchEl.classList.toggle('hidden', !useTouch);
    state.W.touchPad = useTouch ? 1 : 0; state.hudH = useTouch ? 0 : 70;
    resize();
    const hud = el(`<div class="screen clear" style="padding:0;pointer-events:none"></div>`);
    if (!useTouch) { const pb = el(`<button class="pausebtn" style="pointer-events:auto" title="Pause">❚❚</button>`); pb.addEventListener('click', () => togglePause()); hud.appendChild(pb); }
    if (cfg.mode === 'training') hud.appendChild(trainingBar());
    show(hud, null);
    Audio.startMusic(cfg.stage.music || 0);
  }

  function togglePause() {
    const W = state.W; if (!W || W.over) return;
    W.paused = !W.paused; state.skipMenu = true;
    if (W.paused) {
      Audio.play('back');
      const n = el(`<div class="screen dim" style="z-index:10"><div class="panel" style="text-align:center">
        <h2>Paused <span class="he" style="color:var(--gold2)">הַפְסָקָה</span></h2>
        <div class="menu" style="margin:10px auto">
          <button class="btn gold center default" data-nav data-p="resume">Resume</button>
          <button class="btn center" data-nav data-p="restart">Restart</button>
          <button class="btn center" data-nav data-p="controls">Controls</button>
          <button class="btn red center" data-nav data-p="quit">Quit to Menu</button>
        </div></div></div>`);
      const prev = ui.firstElementChild;
      click(n, '[data-p]', (b) => {
        const a = b.dataset.p;
        if (a === 'resume') { n.remove(); W.paused = false; state.screenBack = null; }
        if (a === 'restart') { const m = state.match; startMatch(m.cfg, m.onEnd); }
        if (a === 'quit') { state.W = null; state.classic = null; titleScreen(); }
        if (a === 'controls') { n.querySelector('.panel').innerHTML = controlsHTML() + '<button class="btn center" data-nav id="cb">Back</button>'; n.querySelector('#cb').addEventListener('click', () => { n.remove(); W.paused = false; }); }
      });
      ui.appendChild(n); state.screenBack = () => { n.remove(); W.paused = false; state.screenBack = null; };
      const f = n.querySelector('[data-nav]'); if (f && !isTouch) f.focus();
    } else {
      const d = ui.querySelector('.screen.dim'); if (d) d.remove();
    }
  }

  function readInputs(W) {
    for (const f of W.fighters) {
      if (f.cpu) f.inp = AI.think(f, W);
      else f.inp = Input.read(f.device || 'any', settings.tapJump);
      if (f.inp.pause && !W.over && W.t - (state.lastPauseT || -99) > 20) { state.lastPauseT = W.t; togglePause(); f.inp.pause = false; }
    }
  }

  function tick() {
    if (state.scene === 'match' && state.W) {
      const W = state.W;
      if (!W.paused) {
        if (W.countdown === 179 || W.countdown === 119 || W.countdown === 59) Audio.play('countdown');
        if (W.countdown === 1) Audio.play('go');
        readInputs(W);
        ENG.step(W);
        if (W.cfg.mode === 'training') trainingTick(W);
        for (const ev of W.events) if (ev.type === 'ko' && ev.f.stocks <= 0) state.match.koOrder.push(ev.f);
        W.events.length = 0;
        if (W.over && W.endT === 1) { Audio.play('win'); }
        if (W.over && W.endT === 150) state.match.onEnd(W);
      }
    } else if (state.demo) {
      const D = state.demo;
      for (const f of D.fighters) f.inp = AI.think(f, D);
      ENG.step(D);
      if (D.t > 60 * 60) startDemo();
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = state.scene === 'match' ? state.W : state.demo;
    if (!W) { ctx.fillStyle = '#140c26'; ctx.fillRect(0, 0, vw, vh); return; }
    const hudH = state.scene === 'match' ? (state.hudH ?? 70) : 0;
    ENG.updateCamera(W, vw, vh - hudH);
    const cam = W.cam;
    Art.stageBG(ctx, W, vw, vh);
    ctx.save();
    const shake = settings.shake ? W.shake : 0;
    ctx.translate(vw / 2 + (Math.random() - 0.5) * shake, (vh - hudH) / 2 + (Math.random() - 0.5) * shake);
    ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    Art.stage(ctx, W);
    for (const z of W.fields) Art.field(ctx, z, W);
    for (const F of W.finals) if (F.fin.kind === 'flood' || F.fin.kind === 'pillars') Art.finalFx(ctx, F, W);
    for (const m of W.minions) Art.minion(ctx, m, W);
    for (const it of W.items) Art.item(ctx, it, W);
    for (const f of W.fighters) Art.fighter(ctx, f, W);
    for (const p of W.projectiles) Art.proj(ctx, p, W);
    for (const F of W.finals) if (!(F.fin.kind === 'flood' || F.fin.kind === 'pillars')) Art.finalFx(ctx, F, W);
    for (const e of W.effects) Art.effect(ctx, e, W);
    if (W.cfg.hitboxes && W.lastHB) { ctx.fillStyle = 'rgba(255,0,0,.35)'; for (const h of W.lastHB) ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h); ctx.strokeStyle = 'rgba(0,255,255,.6)'; for (const f of W.fighters) { const b = f.hurtbox(); ctx.strokeRect(b.x, b.y, b.w, b.h); } }
    ctx.restore();
    if (state.scene === 'match') {
      const yOff = (vh - hudH) / 2;
      Art.offscreen(ctx, W, vw, vh, (x, y) => [vw / 2 + (x - cam.x) * cam.z, yOff + (y - cam.y) * cam.z]);
      Art.hud(ctx, W, vw, vh);
      if (W.over && W.endT < 150) {
        ctx.save(); ctx.textAlign = 'center'; ctx.font = `900 ${Math.min(110, vw / 8)}px "Trebuchet MS", sans-serif`; ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe680';
        const txt = W.cfg.time && W.timeLeft <= 0 ? 'TIME!' : 'GAME!'; ctx.strokeText(txt, vw / 2, vh * 0.42); ctx.fillText(txt, vw / 2, vh * 0.42); ctx.restore();
      }
    }
  }

  /* ---------- Results ---------- */
  function placements(W) {
    const fs = [...W.fighters];
    if (W.cfg.time) return fs.sort((a, b) => b.score - a.score || a.damage - b.damage);
    const order = state.match.koOrder;
    return fs.sort((a, b) => {
      const ai = a.stocks > 0 ? 999 : order.indexOf(a), bi = b.stocks > 0 ? 999 : order.indexOf(b);
      return bi - ai;
    });
  }
  function versusResults(W) {
    state.scene = 'menu'; touchEl.classList.add('hidden');
    const pl = placements(W);
    const win = pl[0];
    const teamWin = W.cfg.teams ? (win.team ? 'Blue Team' : 'Red Team') : null;
    const n = el(`<div class="screen">
      <div class="winner">${teamWin ? esc(teamWin) : esc(win.hero.name)} wins!<span class="he">חֲזַק וֶאֱמַץ!</span></div>
      <div class="results" id="res"></div>
      <div class="menu" style="flex-direction:row;flex-wrap:wrap;justify-content:center;width:auto">
        <button class="btn gold center default" data-nav data-a="again">↻ Rematch</button>
        <button class="btn center" data-nav data-a="chars">Change Heroes</button>
        <button class="btn center" data-nav data-a="menu">Main Menu</button>
      </div></div>`);
    const box = n.querySelector('#res');
    pl.forEach((f, i) => {
      const d = el(`<div class="res" style="border-color:${f.color}"><div class="place">${i + 1}${['st', 'nd', 'rd', 'th'][Math.min(i, 3)]}</div>
        <div><b>${esc(f.hero.name)}</b> <span style="color:${f.color}">${f.cpu ? 'CPU' : 'P' + (f.slot + 1)}</span></div>
        <table><tr><td>KOs</td><td>${f.stats.kos}</td></tr><tr><td>Falls</td><td>${f.stats.falls}</td></tr><tr><td>Self-destructs</td><td>${f.stats.sds}</td></tr><tr><td>Damage dealt</td><td>${Math.round(f.stats.dealt)}%</td></tr><tr><td>Damage taken</td><td>${Math.round(f.stats.taken)}%</td></tr></table></div>`);
      d.insertBefore(heroCanvas(f.hero, 160, 130), d.children[1]);
      box.appendChild(d);
    });
    click(n, '[data-a]', (b) => { if (b.dataset.a === 'again') startMatch(state.match.cfg); else if (b.dataset.a === 'chars') versusScreen(); else titleScreen(); });
    show(n, titleScreen);
    Audio.startMusic(2);
  }

  /* ---------- Classic Journey ---------- */
  const JOURNEY = [
    { stage: 'michmash', foes: 1, lvl: 2, title: 'The Garrison at Michmash', he: 'וַיַּעַל יוֹנָתָן עַל יָדָיו וְעַל רַגְלָיו', en: 'Yonatan climbed up on his hands and feet, and they fell before him.', ref: 'I Shmuel 14:13' },
    { stage: 'elah', foes: 2, lvl: 3, title: 'The Valley of Elah', he: 'וַיַּחֲנוּ בְּעֵמֶק הָאֵלָה', en: 'Shaul and the men of Yisrael camped in the Valley of Elah.', ref: 'I Shmuel 17:2' },
    { stage: 'yericho', foes: 2, lvl: 3, ally: true, title: 'The Walls of Yericho (team battle)', he: 'וַיָּרִיעוּ הָעָם תְּרוּעָה גְדוֹלָה וַתִּפֹּל הַחוֹמָה תַּחְתֶּיהָ', en: 'The people gave a great shout and the wall fell where it stood.', ref: 'Yehoshua 6:20' },
    { stage: 'carmel', foes: 1, lvl: 5, title: 'Showdown on Carmel', he: 'וַתִּפֹּל אֵשׁ ה׳ וַתֹּאכַל אֶת הָעֹלָה', en: 'Fire from Hashem fell and burned up the offering.', ref: 'I Melachim 18:38' },
    { stage: 'yamsuf', foes: 3, lvl: 4, title: 'Between the Walls of Water', he: 'וַיִּבָּקְעוּ הַמָּיִם', en: 'And the waters were split.', ref: 'Shemos 14:21' },
    { stage: 'sinai', foes: 1, lvl: 7, title: 'At the Foot of the Mountain', he: 'וְהַר סִינַי עָשַׁן כֻּלּוֹ', en: 'Har Sinai was all smoke.', ref: 'Shemos 19:18' },
    { stage: 'elah', boss: true, lvl: 6, title: 'Golyat of Gat', he: 'וְאָנֹכִי בָא אֵלֶיךָ בְּשֵׁם ה׳ צְבָאוֹת', en: 'You come against me with a sword and a spear and a javelin, but I come against you in the name of Hashem of Hosts.', ref: 'I Shmuel 17:45' }
  ];
  function classicPick() { heroPicker('Classic Journey', 'מַסָּע', (hero, diff) => { state.classic = { hero, round: 0, diff, continues: 0 }; classicRound(); }, true); }
  function heroPicker(title, he, onPick, withDiff) {
    state.scene = 'menu';
    let diff = store.get('diff', 0);
    const n = el(`<div class="screen">
      <div class="hdr"><button class="btn small" data-nav data-back>← Back</button><h2>${title} <span class="he">${he}</span></h2>
      ${withDiff ? `<select data-nav id="diff" style="font:inherit;background:#2b1d55;color:#fff;border-radius:8px;padding:6px"><option value="-2">Easy</option><option value="0">Normal</option><option value="2">Hard</option><option value="3">Gibor (very hard)</option></select>` : ''}</div>
      <div class="grid" id="grid"></div></div>`);
    if (withDiff) { const s = n.querySelector('#diff'); s.value = String(diff); s.addEventListener('change', () => { diff = +s.value; store.set('diff', diff); }); }
    HEROES.forEach(h => {
      const c = el(`<div class="card" tabindex="0" data-nav data-hero="${h.id}">${cleared[h.id] ? '<span class="done" title="Journey cleared">⭐</span>' : h.guest ? '<span class="guest">GUEST</span>' : ''}<div class="nm">${esc(h.name)}<span class="he">${h.he}</span></div></div>`);
      c.insertBefore(heroCanvas(h, 100, 92), c.querySelector('.nm'));
      c.addEventListener('click', () => { Audio.init(); Audio.play('select'); onPick(h, diff); });
      n.querySelector('#grid').appendChild(c);
    });
    click(n, '[data-back]', titleScreen);
    show(n, titleScreen);
  }
  function classicRound() {
    const C = state.classic, R = JOURNEY[C.round];
    state.scene = 'menu'; touchEl.classList.add('hidden');
    const n = el(`<div class="screen dim">
      <div class="journey">${JOURNEY.map((r, i) => `<div class="stp ${i < C.round ? 'done' : ''} ${i === C.round ? 'cur' : ''}">${r.boss ? '👑' : i + 1}</div>`).join('')}</div>
      <h2 style="margin:6px 0">Battle ${C.round + 1}: ${esc(R.title)}</h2>
      <div class="verse"><span class="he">${R.he}</span>${esc(R.en)} <i style="color:var(--muted)">(${R.ref})</i></div>
      <p style="color:var(--muted)">${R.boss ? 'Golyat has stamina instead of percent. Bring his HP to zero!' : R.ally ? 'A CPU ally fights at your side.' : `Defeat ${R.foes} ${R.foes > 1 ? 'opponents' : 'opponent'}.`}</p>
      <button class="btn gold center default" data-nav data-go style="min-width:220px">Fight! ⚔️</button>
    </div>`);
    n.insertBefore(heroCanvas(C.hero, 160, 150), n.children[1]);
    click(n, '[data-go]', () => {
      const lvl = Math.max(1, Math.min(9, R.lvl + C.diff));
      const pool = HEROES.filter(h => h.id !== C.hero.id).sort(() => Math.random() - 0.5);
      const players = [{ hero: C.hero, cpu: 0, device: 'any', team: 0 }];
      if (R.boss) players.push({ hero: BOSS, cpu: lvl, team: 1 });
      else {
        if (R.ally) players.push({ hero: pool.pop(), cpu: Math.max(3, lvl), team: 0 });
        for (let i = 0; i < R.foes; i++) players.push({ hero: pool.pop(), cpu: lvl, team: 1 });
      }
      startMatch({ stage: STAGE_BY_ID[R.stage], players, stocks: R.boss ? 3 : 2, time: 0, items: 'medium', teams: true, hazards: true, finals: !R.boss || C.diff < 2, mode: 'classic' }, classicEnd);
    });
    show(n, () => { state.classic = null; titleScreen(); });
  }
  function classicEnd(W) {
    const C = state.classic;
    const me = W.fighters[0];
    const won = me.stocks > 0 && W.winner && (W.winner.team === 0 || W.winner === me);
    if (won) {
      C.round++;
      if (C.round >= JOURNEY.length) {
        cleared[C.hero.id] = true; store.set('cleared', cleared);
        state.scene = 'menu'; touchEl.classList.add('hidden');
        const n = el(`<div class="screen">
          <div class="winner">Journey Complete!<span class="he">וַיִּפֹּל עַל פָּנָיו אָרְצָה</span></div>
          <div class="verse" style="margin-top:12px"><span class="he">כִּי לַה׳ הַמִּלְחָמָה</span>"For the battle is Hashem's." (I Shmuel 17:47)<br><br>${esc(C.hero.name)} has beaten Golyat! A ⭐ now marks this hero on the select screen.</div>
          <button class="btn gold center default" data-nav data-x style="margin-top:16px">Main Menu</button></div>`);
        n.insertBefore(heroCanvas(C.hero, 200, 200), n.children[1]);
        click(n, '[data-x]', () => { state.classic = null; titleScreen(); });
        show(n, titleScreen); Audio.play('win');
        return;
      }
      return classicRound();
    }
    state.scene = 'menu'; touchEl.classList.add('hidden');
    const n = el(`<div class="screen dim"><div class="panel" style="text-align:center">
      <h2>Defeat… <span class="he" style="color:var(--gold2)">שֶׁבַע יִפּוֹל צַדִּיק וָקָם</span></h2>
      <p style="color:var(--muted)">"A righteous man falls seven times and gets up" (Mishlei 24:16). Continue?</p>
      <div class="menu" style="margin:10px auto"><button class="btn gold center default" data-nav data-c="y">Continue (retry battle ${C.round + 1})</button><button class="btn center" data-nav data-c="n">Give up</button></div></div></div>`);
    click(n, '[data-c]', (b) => { if (b.dataset.c === 'y') { C.continues++; classicRound(); } else { state.classic = null; titleScreen(); } });
    show(n, titleScreen);
  }

  /* ---------- Training ---------- */
  function trainingPick() {
    heroPicker('Training: pick your hero', 'אִמּוּן', (hero) => {
      const dummy = HEROES.find(h => h.id !== hero.id && h.id === (state.training && state.training.dummy)) || HEROES[(HEROES.indexOf(hero) + 1) % HEROES.length];
      state.training = { dummy: dummy.id };
      startMatch({ stage: STAGE_BY_ID.midbar, players: [{ hero, cpu: 0, device: 'any', team: 0 }, { hero: dummy, cpu: 5, team: 1 }], stocks: 99, time: 0, items: 'off', teams: false, hazards: false, finals: false, mode: 'training', cpuMode: 'stand', noCountdown: true, itemList: [] }, () => {});
    });
  }
  function trainingBar() {
    const W = state.W;
    const n = el(`<div class="trainbar" style="pointer-events:auto">
      <span class="combo" id="combo">Combo: 0</span>
      <select id="tcpu" title="Dummy behaviour"><option value="stand">Dummy: stand</option><option value="walk">Dummy: walk</option><option value="jump">Dummy: jump</option><option value="shield">Dummy: shield</option><option value="cpu">Dummy: fight (CPU)</option></select>
      <select id="thero" title="Dummy hero">${HEROES.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select>
      <select id="titem"><option value="">Spawn item…</option>${Object.keys(ITEMS).map(k => `<option value="${k}">${esc(ITEMS[k].name)}</option>`).join('')}</select>
      <select id="tstage">${STAGES.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <button id="treset">Reset %</button>
      <button id="thb">Hitboxes: ${W.cfg.hitboxes ? 'on' : 'off'}</button>
    </div>`);
    n.querySelector('#tcpu').value = W.cfg.cpuMode || 'stand';
    n.querySelector('#thero').value = W.fighters[1].hero.id;
    n.querySelector('#tstage').value = W.stage.id;
    n.querySelector('#tcpu').addEventListener('change', (e) => { W.cfg.cpuMode = e.target.value; e.target.blur(); });
    n.querySelector('#thero').addEventListener('change', (e) => { const m = state.match; m.cfg.players[1].hero = HERO_BY_ID[e.target.value]; state.training.dummy = e.target.value; m.cfg.cpuMode = W.cfg.cpuMode; startMatch(m.cfg, m.onEnd); });
    n.querySelector('#tstage').addEventListener('change', (e) => { const m = state.match; m.cfg.stage = STAGE_BY_ID[e.target.value]; m.cfg.cpuMode = W.cfg.cpuMode; startMatch(m.cfg, m.onEnd); });
    n.querySelector('#titem').addEventListener('change', (e) => { if (e.target.value) { const f = W.fighters[0]; const it = ENG.spawnItem(W, e.target.value, f.x + f.facing * 60, f.y - 160); if (e.target.value === 'ruach') { it.vx = 0; it.vy = 0; } } e.target.value = ''; e.target.blur(); });
    n.querySelector('#treset').addEventListener('click', (e) => { W.fighters.forEach(f => { f.damage = 0; }); e.target.blur(); });
    n.querySelector('#thb').addEventListener('click', (e) => { W.cfg.hitboxes = !W.cfg.hitboxes; settings.hitboxes = W.cfg.hitboxes; store.set('settings', settings); e.target.textContent = 'Hitboxes: ' + (W.cfg.hitboxes ? 'on' : 'off'); e.target.blur(); });
    return n;
  }
  function trainingTick(W) {
    const d = W.fighters[1], c = state.combo;
    if (d.hitstun > 0 || d.stun) { if (d.damage > c.last + 0.01) { c.n++; c.dmg += d.damage - c.last; c.show = 120; } }
    else if (c.n && d.hitstun <= 0) { c.lastN = c.n; c.lastDmg = c.dmg; c.n = 0; c.dmg = 0; }
    c.last = d.damage;
    const e = document.getElementById('combo');
    if (e && W.t % 6 === 0) e.textContent = c.n > 1 ? `Combo: ${c.n} hits, ${Math.round(c.dmg)}%` : c.lastN > 1 ? `Last combo: ${c.lastN} hits, ${Math.round(c.lastDmg)}%` : `Dummy: ${Math.round(d.damage)}%`;
  }

  /* ---------- The Sefer (library) ---------- */
  const textCache = {};
  async function fetchSefaria(ref) {
    if (textCache[ref]) return textCache[ref];
    const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=english&version=hebrew`;
    const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const flat = (x) => Array.isArray(x) ? x.map(flat).join(' ') : String(x || '');
    const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    const out = { he: '', en: '', ref: d.ref || ref, heRef: d.heRef || '' };
    for (const v of d.versions || []) { if (v.language === 'he' && !out.he) out.he = strip(flat(v.text)); if (v.language === 'en' && !out.en) { out.en = strip(flat(v.text)); out.enVersion = v.versionTitle; } }
    textCache[ref] = out; return out;
  }
  function srcLink(ref) { return `${SEFARIA}${encodeURIComponent(ref)}`; }
  function prettyRef(ref) { return ref.replace(/_/g, ' ').replace(/\.(\d+[ab]?)\.(\d+)/, ' $1:$2').replace(/\.(\d+[ab]?)$/, ' $1'); }
  function seferScreen(tab = 'heroes', selId) {
    state.scene = 'menu'; touchEl.classList.add('hidden');
    const n = el(`<div class="screen">
      <div class="hdr"><button class="btn small" data-nav data-back>← Back</button><h2>The Sefer <span class="he">סֵפֶר הַגִּבּוֹרִים</span></h2>
      <div class="tabs"><button class="btn small ${tab === 'heroes' ? 'on' : ''}" data-nav data-tab="heroes">Heroes</button><button class="btn small ${tab === 'items' ? 'on' : ''}" data-nav data-tab="items">Items</button><button class="btn small ${tab === 'stages' ? 'on' : ''}" data-nav data-tab="stages">Stages</button></div></div>
      <div class="lib"><div class="list" id="list"></div><div class="det" id="det"></div></div></div>`);
    const list = n.querySelector('#list'), det = n.querySelector('#det');
    const entries = tab === 'heroes' ? [...HEROES, BOSS] : tab === 'items' ? Object.entries(ITEMS).map(([k, v]) => ({ ...v, id: k })) : STAGES;
    function quoteBlock(ref) {
      const q = el(`<div><a class="src" data-nav tabindex="0">📖 Read ${esc(prettyRef(ref))} from Sefaria</a> · <a class="src" href="${srcLink(ref)}" target="_blank" rel="noopener">open ↗</a><div class="quote hidden"></div></div>`);
      const a = q.querySelector('a.src'), box = q.querySelector('.quote');
      a.addEventListener('click', async () => {
        box.classList.remove('hidden'); box.textContent = 'Loading from Sefaria…';
        try { const t = await fetchSefaria(ref); box.innerHTML = `<span class="he">${esc(t.he.slice(0, 700))}</span>${esc(t.en.slice(0, 900))}<br><small style="color:var(--muted)">${esc(t.ref)}${t.enVersion ? ' · ' + esc(t.enVersion) : ''} · via Sefaria</small>`; }
        catch (e) { box.textContent = 'Could not reach Sefaria (offline?). Tap "open ↗" to read it on sefaria.org.'; }
      });
      return q;
    }
    function detail(e) {
      det.innerHTML = '';
      if (tab === 'heroes') {
        const top = el(`<div class="top"><div><h3>${esc(e.name)}<span class="he">${e.he}</span></h3><div class="ttl">${esc(e.title)}${e.guest ? ' · Special guest (not from Tanach)' : ''}${e.boss ? ' · Classic Journey boss' : ''}</div><p>${esc(e.bio)}</p>
          ${e.boss ? '' : `<div style="font-size:12px;color:var(--muted)">Weight ${e.weight} · Speed ${e.run} · Jumps ${e.jumps + 1} · Height ${e.h}px${e.id === 'moshe' ? ' (ten amos!)' : ''}</div>`}</div></div>`);
        top.insertBefore(heroCanvas(e, 140, 170), top.firstChild); det.appendChild(top);
        if (e.boss) { det.appendChild(quoteBlock(e.src)); return; }
        const labels = { neutral: 'Special (B)', side: 'Side + Special', up: 'Up + Special (recovery)', down: 'Down + Special' };
        for (const k of ['neutral', 'side', 'up', 'down']) {
          const s = e.specials[k];
          const m = el(`<div class="move"><div class="k">${labels[k]}</div><b>${esc(s.name)}</b><span class="he">${s.he}</span><p>${esc(s.note)}</p></div>`);
          m.appendChild(quoteBlock(s.src)); det.appendChild(m);
        }
        const f = e.final; const m = el(`<div class="move" style="border:1px solid var(--gold)"><div class="k">Final Strike (break the Ruach Orb, then B)</div><b>${esc(f.name)}</b><span class="he">${f.he}</span><p>${esc(f.note)}</p></div>`);
        m.appendChild(quoteBlock(f.src)); det.appendChild(m);
      } else if (tab === 'items') {
        const c = document.createElement('canvas'); c.width = 240; c.height = 160; c.style.width = '120px'; c.style.height = '80px'; const x = c.getContext('2d'); x.scale(2, 2); Art.itemIcon(x, e.id, 60, 40, 1.4, 0);
        const top = el(`<div class="top"><div><h3>${esc(e.name)}<span class="he">${e.he}</span></h3><div class="ttl">${({ melee: 'Melee weapon', shooter: 'Shooter (' + (e.ammo || 0) + ' shots)', throw: 'Throwing item', food: 'Food', orb: 'Final Strike orb' })[e.type]}</div><p>${esc(e.note)}</p></div></div>`);
        top.insertBefore(c, top.firstChild); det.appendChild(top); det.appendChild(quoteBlock(e.src));
      } else {
        const top = el(`<div><h3>${esc(e.name)}<span class="he">${e.he}</span></h3><p>${esc(e.note)}</p>${e.hazard ? `<p><b>Hazard:</b> ${({ lightning: 'Lightning strikes the mountain. Watch for the glowing column.', walls: 'The shofar sounds and the side walls collapse for a while.', fire: 'Fire falls on the altar. Stay off it when it glows.' })[e.hazard]}</p>` : ''}</div>`);
        top.insertBefore(stageCanvas(e, 420, 190), top.firstChild); det.appendChild(top); det.appendChild(quoteBlock(e.src));
      }
    }
    entries.forEach((e, i) => {
      const it = el(`<div class="it" tabindex="0" data-nav><span>${esc(e.name)}<br><small class="he" style="color:var(--gold2)">${e.he}</small></span></div>`);
      if (tab === 'heroes') it.insertBefore(heroCanvas(e, 44, 44, false), it.firstChild);
      else if (tab === 'items') { const c = document.createElement('canvas'); c.width = 88; c.height = 88; const x = c.getContext('2d'); x.scale(2, 2); Art.itemIcon(x, e.id, 22, 24, 0.7, 0); it.insertBefore(c, it.firstChild); }
      it.addEventListener('click', () => { list.querySelectorAll('.it').forEach(z => z.classList.remove('sel')); it.classList.add('sel'); detail(e); Audio.play('menu'); });
      list.appendChild(it);
      if ((selId && e.id === selId) || (!selId && i === 0)) { it.classList.add('sel'); detail(e); }
    });
    click(n, '[data-tab]', (b) => seferScreen(b.dataset.tab));
    click(n, '[data-back]', titleScreen);
    show(n, titleScreen);
  }

  /* ---------- Controls & settings ---------- */
  function controlsHTML() {
    return `<h2>How to Play <span class="he" style="color:var(--gold2)">הוֹרָאוֹת</span></h2>
    <p style="color:var(--muted);font-size:14px">Knock opponents off the stage. The higher their <b>%</b>, the farther they fly. Break the glowing <b>Ruach Orb</b> and press Special to use your <b>Final Strike</b>.</p>
    <table class="keys"><tr><th>Action</th><th>Keyboard (1 player)</th><th>Gamepad</th><th>Touch</th></tr>
    <tr><td>Move</td><td><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></td><td>Left stick / D-pad</td><td>Joystick</td></tr>
    <tr><td>Jump</td><td><kbd>W</kbd> / <kbd>↑</kbd> / <kbd>Space</kbd></td><td>X / Y</td><td>⤒ or flick up</td></tr>
    <tr><td>Attack</td><td><kbd>J</kbd> / <kbd>Z</kbd></td><td>A</td><td>A</td></tr>
    <tr><td>Special</td><td><kbd>K</kbd> / <kbd>X</kbd></td><td>B</td><td>B</td></tr>
    <tr><td>Smash attack</td><td><kbd>L</kbd> / <kbd>C</kbd> + direction (hold to charge)</td><td>Right stick, or flick + A</td><td>S + direction</td></tr>
    <tr><td>Shield / dodge</td><td><kbd>;</kbd> / <kbd>V</kbd> / <kbd>Shift</kbd></td><td>LB / LT / RT</td><td>🛡</td></tr>
    <tr><td>Grab</td><td>Shield + Attack</td><td>RB or Shield + A</td><td>🛡 + A</td></tr>
    <tr><td>Pause</td><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>Start</td><td>❚❚</td></tr></table>
    <p style="font-size:13px;color:var(--muted)"><b>Two players on one keyboard:</b> P1 uses <kbd>WASD</kbd> with <kbd>F</kbd> attack, <kbd>G</kbd> special, <kbd>H</kbd> smash, <kbd>Left Shift</kbd> shield. P2 uses the arrows with <kbd>,</kbd> attack, <kbd>.</kbd> special, <kbd>/</kbd> smash, <kbd>Right Shift</kbd> shield (or Numpad 1/2/3/0).<br>
    <b>Tips:</b> Up + Special is your recovery, so use it to get back to the ledge. Hold down in the air to fast-fall. Press down on a platform to drop through it. Pick up items with Attack; Smash or Shield + Attack throws them.</p>`;
  }
  function controlsScreen() {
    const n = el(`<div class="screen dim"><div class="panel" style="width:min(820px,96vw)">${controlsHTML()}<button class="btn center default" data-nav data-b>Back</button></div></div>`);
    click(n, '[data-b]', titleScreen); show(n, titleScreen);
  }
  function settingsScreen() {
    const n = el(`<div class="screen dim"><div class="panel">
      <h2>Settings <span class="he" style="color:var(--gold2)">הַגְדָּרוֹת</span></h2>
      <div class="row">Music<select data-nav data-s="music"><option value="true">On</option><option value="false">Off</option></select></div>
      <div class="row">Sound effects<select data-nav data-s="sfx"><option value="true">On</option><option value="false">Off</option></select></div>
      <div class="row">Touch controls<select data-nav data-s="touch"><option value="auto">Automatic</option><option value="always">Always show</option><option value="never">Never</option></select></div>
      <div class="row">Tap stick up to jump (gamepad/touch)<select data-nav data-s="tapJump"><option value="true">On</option><option value="false">Off</option></select></div>
      <div class="row">Screen shake<select data-nav data-s="shake"><option value="true">On</option><option value="false">Off</option></select></div>
      <div class="row">Show hitboxes<select data-nav data-s="hitboxes"><option value="false">Off</option><option value="true">On</option></select></div>
      <div class="row">Classic Journey stars<button class="btn small" data-nav data-clear>Reset progress</button></div>
      <button class="btn center default" data-nav data-b style="margin-top:12px;width:100%">Done</button></div></div>`);
    n.querySelectorAll('[data-s]').forEach(s => {
      s.value = String(settings[s.dataset.s]);
      s.addEventListener('change', () => { let v = s.value; if (v === 'true' || v === 'false') v = v === 'true'; settings[s.dataset.s] = v; store.set('settings', settings); Audio.setMusic(settings.music); Audio.setSfx(settings.sfx); if (settings.music) Audio.startMusic(0); });
    });
    click(n, '[data-clear]', () => { for (const k in cleared) delete cleared[k]; store.set('cleared', cleared); });
    click(n, '[data-b]', titleScreen); show(n, titleScreen);
  }

  /* ---------- main loop ---------- */
  Input.setupTouch(touchEl);
  document.getElementById('tPause').addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); });
  document.getElementById('tPause').addEventListener('click', () => togglePause());
  const unlock = () => { Audio.init(); if (state.scene !== 'match') Audio.startMusic(0); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  resize();
  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    let n = 0;
    while (acc >= STEP && n < 4) { tick(); acc -= STEP; n++; }
    if (state.skipMenu) state.skipMenu = false; else if (state.scene !== 'match' || (state.W && state.W.paused)) menuTick();
    Input.endFrame();
    render();
    requestAnimationFrame(frame);
  }
  // test hooks (used by tests/smoke.js)
  window.TF = { state, startMatch, titleScreen, versusScreen, seferScreen, classicPick, trainingPick, ENG, HEROES, STAGES };
  titleScreen();
  requestAnimationFrame(frame);
})();
