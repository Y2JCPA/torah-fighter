/* Torah Fighter — synthesized sound effects and music (WebAudio, no files). */
'use strict';

const Audio = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, musicTimer = null, musicStep = 0, currentSong = -1;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.8 : 0; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.22 : 0; musicGain.connect(master);
  }

  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0, dest = sfxGain) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, vol = 0.3, freq = 1200, delay = 0, q = 1) {
    if (!ctx) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.02);
  }

  function shofar(delay = 0, long = false) {
    if (!ctx) return;
    // tekiah: rising sawtooth with vibrato
    const t = ctx.currentTime + delay, dur = long ? 1.3 : 0.6;
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(260, t + 0.12);
    o.frequency.setValueAtTime(260, t + dur * 0.7); o.frequency.linearRampToValueAtTime(350, t + dur);
    lfo.frequency.value = 6; lg.gain.value = 5; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.06); g.gain.setValueAtTime(0.28, t + dur - 0.08); g.gain.linearRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  const SFX = {
    jump: () => tone(300, 0.12, 'square', 0.12, 300),
    djump: () => tone(420, 0.12, 'square', 0.12, 400),
    land: () => noise(0.06, 0.12, 400),
    swing: () => noise(0.09, 0.15, 2600, 0, 0.8),
    hit: (s = 1) => { noise(0.12, 0.25 * s, 900); tone(160, 0.1, 'square', 0.15 * s, -80); },
    heavy: () => { noise(0.25, 0.4, 600); tone(110, 0.25, 'sawtooth', 0.3, -60); },
    shield: () => tone(900, 0.08, 'triangle', 0.15, -300),
    shieldbreak: () => { tone(600, 0.5, 'square', 0.25, -500); noise(0.4, 0.3, 3000); },
    shoot: () => tone(700, 0.1, 'triangle', 0.15, -400),
    sling: () => { noise(0.12, 0.2, 1800); tone(500, 0.08, 'sine', 0.1, 300); },
    arrow: () => { noise(0.08, 0.2, 4000); tone(1200, 0.06, 'sine', 0.08, -600); },
    fire: () => noise(0.4, 0.3, 500, 0, 0.5),
    water: () => { noise(0.5, 0.3, 700, 0, 0.4); noise(0.3, 0.2, 1500, 0.1); },
    ko: () => { tone(880, 0.6, 'sawtooth', 0.2, -800); noise(0.7, 0.35, 300); },
    pickup: () => { tone(660, 0.07, 'square', 0.12); tone(990, 0.09, 'square', 0.12, 0, 0.06); },
    heal: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, 'sine', 0.12, 0, i * 0.07)); },
    menu: () => tone(520, 0.05, 'square', 0.1),
    select: () => { tone(660, 0.07, 'square', 0.12); tone(880, 0.1, 'square', 0.12, 0, 0.07); },
    back: () => tone(330, 0.08, 'square', 0.1, -100),
    countdown: () => tone(440, 0.2, 'square', 0.2),
    go: () => { tone(880, 0.4, 'square', 0.22); tone(1320, 0.4, 'square', 0.12); },
    final: () => { shofar(0, true); [392, 466, 587, 784].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.08, 0, 0.2 + i * 0.12)); },
    orb: () => { [700, 900, 1100].forEach((f, i) => tone(f, 0.1, 'sine', 0.1, 0, i * 0.04)); },
    shofar: () => shofar(),
    harp: () => { [587, 698, 880, 1046, 880].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, 0, i * 0.06)); },
    golem: () => { tone(70, 0.35, 'sawtooth', 0.35, -20); noise(0.3, 0.3, 200); },
    star: () => tone(1500, 0.1, 'sine', 0.08, 800),
    sleep: () => { tone(400, 0.3, 'sine', 0.1, -200); },
    win: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, 'square', 0.14, 0, i * 0.13)); }
  };

  function play(name, arg) { if (!ctx || !sfxOn) return; const f = SFX[name]; if (f) f(arg); }

  /* Music: a simple loop in Ahava Rabbah (freygish) mode: D Eb F# G A Bb C D */
  const SCALE = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19];
  const SONGS = [
    { root: 146.8, tempo: 150, mel: [0, 2, 3, 4, 3, 2, 1, 0, 4, 4, 5, 4, 3, 2, 3, -1, 0, 1, 2, 3, 4, 6, 5, 4, 3, 2, 1, 2, 0, -1, 0, -1], bass: [0, 0, 4, 4, 3, 3, 0, 0] },
    { root: 130.8, tempo: 132, mel: [4, -1, 4, 5, 6, 5, 4, -1, 3, 4, 3, 2, 1, -1, 0, -1, 7, 6, 5, 4, 5, 6, 4, -1, 3, 2, 1, 2, 0, -1, -1, -1], bass: [0, 0, 3, 3, 1, 1, 0, 4] },
    { root: 164.8, tempo: 168, mel: [0, 0, 2, 4, 4, 2, 4, 5, 7, 5, 4, 2, 4, 2, 1, 0, 0, 1, 2, 1, 2, 4, 2, 1, 0, -1, 1, 0, -1, 0, -1, -1], bass: [0, 4, 0, 4, 3, 1, 0, 4] },
    { root: 123.5, tempo: 120, mel: [0, -1, 1, 2, 4, -1, 3, 2, 1, -1, 2, 1, 0, -1, -1, -1, 4, -1, 5, 6, 7, -1, 6, 5, 4, -1, 3, 2, 1, -1, 0, -1], bass: [0, 0, 1, 1, 3, 3, 0, 0] }
  ];
  const freq = (root, deg) => root * Math.pow(2, SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] / 12);

  function startMusic(i) {
    if (!ctx) return;
    if (currentSong === i && musicTimer) return;
    stopMusic(); currentSong = i; musicStep = 0;
    const song = SONGS[i % SONGS.length];
    const stepDur = 60 / song.tempo / 2;
    let next = ctx.currentTime + 0.05;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      while (next < ctx.currentTime + 0.25) {
        const d = next - ctx.currentTime;
        const m = song.mel[musicStep % song.mel.length];
        if (m >= 0) tone(freq(song.root * 2, m), stepDur * 1.6, 'triangle', 0.25, 0, d, musicGain);
        if (musicStep % 4 === 0) {
          const b = song.bass[(musicStep / 4 | 0) % song.bass.length];
          tone(freq(song.root / 2, b), stepDur * 3.5, 'square', 0.18, 0, d, musicGain);
        }
        if (musicStep % 2 === 0) { // darbuka-ish: doum on 0, tek on 3,6
          const p = musicStep % 8;
          if (p === 0 || p === 4) tone(90, 0.12, 'sine', 0.45, -40, d, musicGain);
          if (p === 2 || p === 6) tone(400, 0.04, 'square', 0.08, 0, d, musicGain);
        }
        musicStep++; next += stepDur;
      }
    }, 60);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; currentSong = -1; }

  function setMusic(on) { musicOn = on; if (musicGain) musicGain.gain.value = on ? 0.22 : 0; }
  function setSfx(on) { sfxOn = on; if (sfxGain) sfxGain.gain.value = on ? 0.8 : 0; }

  return { init, play, startMusic, stopMusic, setMusic, setSfx, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; } };
})();
