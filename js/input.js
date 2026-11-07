/* Torah Fighter — input: keyboard (1 or 2 players), gamepads (up to 4), touch controls. */
'use strict';

const Input = (() => {
  const keys = new Set();
  const pressedThisFrame = new Set();
  window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressedThisFrame.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const any = (list) => list.some(k => keys.has(k) || pressedThisFrame.has(k));

  // Key maps
  const MAPS = {
    kbAll: { l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], u: ['KeyW', 'ArrowUp'], d: ['KeyS', 'ArrowDown'],
      jump: ['Space', 'KeyW', 'ArrowUp'], attack: ['KeyJ', 'KeyZ'], special: ['KeyK', 'KeyX'], smash: ['KeyL', 'KeyC'],
      shield: ['Semicolon', 'KeyV', 'ShiftLeft', 'ShiftRight'], pause: ['Escape', 'KeyP', 'Enter'] },
    kb1: { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], jump: ['KeyW', 'Space'], attack: ['KeyF'], special: ['KeyG'], smash: ['KeyH'],
      shield: ['ShiftLeft', 'KeyT'], pause: ['Escape'] },
    kb2: { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], jump: ['ArrowUp'],
      attack: ['Numpad1', 'Comma'], special: ['Numpad2', 'Period'], smash: ['Numpad3', 'Slash'], shield: ['Numpad0', 'ShiftRight'], pause: ['Enter', 'NumpadEnter'] }
  };

  // ---- touch ----
  const touch = { x: 0, y: 0, jump: false, attack: false, special: false, smash: false, shield: false, pause: false, active: false };

  function merge(list) {
    const rs = list.filter(Boolean);
    if (!rs.length) return null;
    const o = { x: 0, y: 0, cx: 0, cy: 0, digital: true };
    for (const r of rs) {
      for (const k of ['x', 'y', 'cx', 'cy']) if (Math.abs(r[k] || 0) > Math.abs(o[k])) o[k] = r[k];
      for (const k of ['jump', 'attack', 'special', 'smash', 'shield', 'pause', 'grabBtn']) o[k] = o[k] || !!r[k];
      if (!r.digital && (Math.abs(r.x) > 0.1 || Math.abs(r.y) > 0.1)) o.digital = false;
    }
    return o;
  }
  function readRaw(dev) {
    if (dev === 'any') {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pi = -1; for (let i = 0; i < pads.length; i++) if (pads[i]) { pi = i; break; }
      return merge([readRaw('kbAll'), pi >= 0 ? readRaw('pad' + pi) : null, touch.active ? readRaw('touch') : null]);
    }
    if (dev.startsWith('kb')) {
      const m = MAPS[dev];
      return {
        x: (any(m.r) ? 1 : 0) - (any(m.l) ? 1 : 0), y: (any(m.d) ? 1 : 0) - (any(m.u) ? 1 : 0),
        jump: any(m.jump), attack: any(m.attack), special: any(m.special), smash: any(m.smash), shield: any(m.shield), pause: any(m.pause),
        cx: 0, cy: 0, digital: true
      };
    }
    if (dev.startsWith('pad')) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads[+dev.slice(3)];
      if (!p) return null;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      let x = p.axes[0] || 0, y = p.axes[1] || 0;
      if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
      const dz = (v) => Math.abs(v) < 0.25 ? 0 : v;
      return {
        x: dz(x), y: dz(y), jump: b(2) || b(3), attack: b(0), special: b(1), shield: b(4) || b(6) || b(7), smash: false, grabBtn: b(5),
        pause: b(9), cx: dz(p.axes[2] || 0), cy: dz(p.axes[3] || 0)
      };
    }
    if (dev === 'touch') return { digital: false, x: touch.x, y: touch.y, jump: touch.jump, attack: touch.attack, special: touch.special, smash: touch.smash, shield: touch.shield, pause: touch.pause, cx: 0, cy: 0 };
    return null;
  }

  // Per-device previous state to produce edges, plus stick flick detection for smash attacks.
  const prev = {};
  function read(dev, tapJump = true) {
    const r = readRaw(dev);
    if (!r) return blank();
    const p = prev[dev] || (prev[dev] = { r: blank(), mag: [], flickT: 99 });
    const mag = Math.max(Math.abs(r.x), Math.abs(r.y));
    p.mag.push(mag); if (p.mag.length > 6) p.mag.shift();
    if (mag > 0.85 && Math.min(...p.mag) < 0.3) p.flickT = 0; else p.flickT++;
    const upTap = tapJump && r.y < -0.6 && !(p.r.y < -0.6);
    const out = {
      x: r.x, y: r.y,
      jump: (r.jump && !p.r.jump) || (upTap && !r.digital),
      jumpHeld: r.jump || (tapJump && !r.digital && r.y < -0.6),
      attack: r.attack && !p.r.attack, attackHeld: r.attack,
      special: r.special && !p.r.special, specialHeld: r.special,
      smash: (r.smash && !p.r.smash), smashHeld: r.smash || (r.attack && p.flickT < 8),
      shield: r.shield && !p.r.shield, shieldHeld: r.shield,
      grab: !!(r.grabBtn && !p.r.grabBtn),
      pause: r.pause && !p.r.pause,
      cstick: 0, cx: 0, cy: 0
    };
    // flick + attack = smash (analog sticks / touch)
    if (out.attack && !r.digital && p.flickT < 6) { out.smash = true; out.attack = false; }
    // right stick = smash in that direction
    const cmag = Math.max(Math.abs(r.cx), Math.abs(r.cy));
    const pcmag = Math.max(Math.abs(p.r.cx || 0), Math.abs(p.r.cy || 0));
    if (cmag > 0.6 && pcmag <= 0.6) { out.smash = true; out.cx = r.cx; out.cy = r.cy; }
    p.r = { ...r };
    return out;
  }
  function blank() { return { x: 0, y: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, special: false, specialHeld: false, smash: false, smashHeld: false, shield: false, shieldHeld: false, grab: false, pause: false, cx: 0, cy: 0 }; }

  // ---- Menu navigation from any device ----
  const menuPrev = {};
  let repeatT = 0;
  function menu() {
    const out = { up: false, down: false, left: false, right: false, ok: false, back: false };
    const k = (c) => pressedThisFrame.has(c);
    if (k('ArrowUp') || k('KeyW')) out.up = true;
    if (k('ArrowDown') || k('KeyS')) out.down = true;
    if (k('ArrowLeft') || k('KeyA')) out.left = true;
    if (k('ArrowRight') || k('KeyD')) out.right = true;
    if (k('Enter') || k('Space') || k('NumpadEnter')) { out.ok = true; out.nativeKey = true; }
    if (k('KeyJ') || k('KeyZ') || k('KeyF')) out.ok = true;
    if (k('Escape') || k('Backspace') || k('KeyK') || k('KeyX') || k('KeyG')) out.back = true;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]; if (!p) continue;
      const st = { u: p.axes[1] < -0.5 || (p.buttons[12] && p.buttons[12].pressed), d: p.axes[1] > 0.5 || (p.buttons[13] && p.buttons[13].pressed),
        l: p.axes[0] < -0.5 || (p.buttons[14] && p.buttons[14].pressed), r: p.axes[0] > 0.5 || (p.buttons[15] && p.buttons[15].pressed),
        a: p.buttons[0] && p.buttons[0].pressed, b: p.buttons[1] && p.buttons[1].pressed, s: p.buttons[9] && p.buttons[9].pressed };
      const pv = menuPrev[i] || {};
      if (st.u && !pv.u) out.up = true; if (st.d && !pv.d) out.down = true;
      if (st.l && !pv.l) out.left = true; if (st.r && !pv.r) out.right = true;
      if ((st.a || st.s) && !(pv.a || pv.s)) { out.ok = true; out.nativeKey = false; } if (st.b && !pv.b) out.back = true;
      menuPrev[i] = st;
    }
    return out;
  }

  function endFrame() { pressedThisFrame.clear(); }
  function padCount() { const p = navigator.getGamepads ? navigator.getGamepads() : []; let n = 0; for (const x of p) if (x) n++; return n; }
  function padIndexes() { const p = navigator.getGamepads ? navigator.getGamepads() : []; const o = []; for (let i = 0; i < p.length; i++) if (p[i]) o.push(i); return o; }

  // ---- Touch controls (DOM) ----
  function setupTouch(root) {
    const stick = root.querySelector('#tStick'), knob = root.querySelector('#tKnob');
    let stickId = null, cx = 0, cy = 0;
    const R = () => stick.getBoundingClientRect().width / 2;
    function setStick(px, py) {
      let dx = px - cx, dy = py - cy;
      const r = R(), d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      touch.x = Math.abs(dx / r) < 0.2 ? 0 : dx / r; touch.y = Math.abs(dy / r) < 0.2 ? 0 : dy / r;
    }
    stick.addEventListener('touchstart', e => {
      e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier;
      const b = stick.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; setStick(t.clientX, t.clientY); touch.active = true;
    }, { passive: false });
    stick.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t.clientX, t.clientY);
    }, { passive: false });
    const endStick = e => {
      for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; touch.x = 0; touch.y = 0; knob.style.transform = ''; }
    };
    stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);

    root.querySelectorAll('[data-btn]').forEach(b => {
      const name = b.dataset.btn;
      const on = e => { e.preventDefault(); touch[name] = true; b.classList.add('on'); touch.active = true; };
      const off = e => { e.preventDefault(); touch[name] = false; b.classList.remove('on'); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off); b.addEventListener('touchcancel', off);
      b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
    });
  }

  return { read, menu, endFrame, padCount, padIndexes, setupTouch, touch, keys, MAPS };
})();
