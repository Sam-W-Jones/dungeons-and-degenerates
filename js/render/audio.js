/* Dungeons and Degenerates — js/render/audio.js
 * Procedural WebAudio sound effects (docs/ARCHITECTURE.md §7.6) — no audio files. Every sound is a tiny recipe of
 * oscillator "tones" and filtered "noise" bursts with short envelopes, played through a compressor.
 *
 *   DD.Audio.play(name, opts)   opts: { vol 0..2, pitch (rate multiplier), delay (s) } → true if it played
 *   DD.Audio.setVolume(0..1) · DD.Audio.mute(bool) · DD.Audio.isMuted() · DD.Audio.names
 *
 * The AudioContext is created lazily on the first user gesture (browser autoplay rules); before that, in headless
 * tests or without WebAudio, play() is a silent no-op that never throws. Respects DD.Meta settings sfx/volume.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const A = {
    ctx: null, master: null, comp: null, noiseBuf: null,
    failed: false, unlocked: false, muted: false, volume: null,
    last: {}, voices: 0,
  };
  const MAX_VOICES = 14;
  const THROTTLE_S = 0.04;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }

  function settings() { return DD.Meta && DD.Meta.data && DD.Meta.data.settings ? DD.Meta.data.settings : null; }
  function effectiveVolume() {
    if (A.volume !== null) return A.volume;
    const s = settings();
    return s && typeof s.volume === 'number' ? clamp(s.volume, 0, 1) : 0.6;
  }
  function isMuted() {
    if (A.muted) return true;
    // debug=1 pages (agents, screenshots, test views) stay silent unless the URL also has sound=1.
    if (DD.debug && DD.params.sound !== '1') return true;
    const s = settings();
    return !!(s && s.sfx === false);
  }

  function ensureContext() {
    if (A.ctx || A.failed) return A.ctx;
    if (DD.headless || window.DD_TEST) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { A.failed = true; return null; }
    try {
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
      const master = ctx.createGain();
      master.gain.value = effectiveVolume();
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.0);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      A.ctx = ctx; A.master = master; A.comp = comp; A.noiseBuf = buf;
    } catch (e) {
      A.failed = true;
      A.ctx = null;
    }
    return A.ctx;
  }

  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume().then(function () { A.unlocked = true; }, function () { /* stays locked until the next gesture */ }); } catch (e) { /* ignore */ }
    } else {
      A.unlocked = true;
    }
  }

  // ---- synthesis helpers ------------------------------------------------------------------------------------
  /** One voice = a recipe call; tone()/noise() schedule nodes relative to its start time. */
  function Voice(ctx, out, t0, pitch) { this.ctx = ctx; this.out = out; this.t0 = t0; this.pitch = pitch; this.end = t0; }

  /**
   * tone(type, f0, f1, dur, vol, o): oscillator gliding f0 → f1 (exponential) with a fast attack and decay.
   * o: { delay, attack, filter (lowpass Hz), q, vibrato: [rateHz, depthHz] }
   */
  Voice.prototype.tone = function (type, f0, f1, dur, vol, o) {
    o = o || {};
    const c = this.ctx, t = this.t0 + (o.delay || 0), p = this.pitch;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0 * p), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * p), t + dur);
    const g = c.createGain();
    const atk = Math.min(o.attack || 0.006, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.filter; f.Q.value = o.q || 0.8;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(this.out);
    if (o.vibrato) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = o.vibrato[0]; lg.gain.value = o.vibrato[1] * p;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.02);
    }
    osc.start(t); osc.stop(t + dur + 0.02);
    this.end = Math.max(this.end, t + dur + 0.05);
    return this;
  };
  /** noise(dur, vol, filterType, f0, f1, q, delay): filtered white noise burst with a swept filter. */
  Voice.prototype.noise = function (dur, vol, type, f0, f1, q, delay) {
    const c = this.ctx, t = this.t0 + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = A.noiseBuf;
    src.playbackRate.value = clamp(this.pitch, 0.5, 2);
    const f = c.createBiquadFilter();
    f.type = type || 'lowpass'; f.Q.value = q || 0.9;
    f.frequency.setValueAtTime(Math.max(30, f0), t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.008, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    this.end = Math.max(this.end, t + dur + 0.05);
    return this;
  };

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---- recipes (short, punchy, not annoying) ------------------------------------------------------------------
  const SOUNDS = {
    click: function (s) { s.tone('square', 880, 1320, 0.045, 0.1, { filter: 3500 }); },
    hover: function (s) { s.tone('sine', 1500, 1650, 0.03, 0.035); },
    hit: function (s) { s.tone('sine', 170, 55, 0.13, 0.5); s.noise(0.08, 0.32, 'lowpass', 2200, 400); },
    crit: function (s) {
      s.tone('sine', 200, 48, 0.2, 0.6); s.noise(0.12, 0.42, 'lowpass', 3200, 500);
      s.tone('triangle', 1500, 1250, 0.18, 0.1, { delay: 0.015 });
    },
    fire: function (s) { s.noise(0.38, 0.34, 'bandpass', 380, 2400, 1.1); s.noise(0.22, 0.12, 'highpass', 3000, 3600, 0.7, 0.06); },
    frost: function (s) {
      s.tone('sine', 2400, 2650, 0.26, 0.09); s.tone('sine', 3300, 3050, 0.22, 0.06, { delay: 0.04 });
      s.noise(0.25, 0.14, 'highpass', 5000, 7500, 0.8);
    },
    zap: function (s) { s.tone('sawtooth', 240, 110, 0.18, 0.15, { filter: 2600, vibrato: [55, 70] }); s.noise(0.15, 0.2, 'bandpass', 3200, 1400, 2); },
    poison: function (s) { for (let i = 0; i < 3; i++) s.tone('sine', 300 + i * 90, 560 + i * 90, 0.07, 0.16, { delay: i * 0.07 }); },
    heal: function (s) {
      [523, 659, 784].forEach(function (f, i) { s.tone('sine', f, f, 0.18, 0.14, { delay: i * 0.06 }); });
      s.tone('triangle', 1046, 1046, 0.26, 0.05, { delay: 0.18 });
    },
    buff: function (s) { s.tone('triangle', 440, 460, 0.1, 0.15); s.tone('triangle', 660, 680, 0.15, 0.15, { delay: 0.08 }); },
    debuff: function (s) { s.tone('triangle', 392, 380, 0.1, 0.15); s.tone('triangle', 277, 255, 0.17, 0.15, { delay: 0.08 }); },
    push: function (s) { s.noise(0.22, 0.28, 'bandpass', 300, 1300, 1); },
    bump: function (s) { s.tone('sine', 115, 45, 0.13, 0.5); s.noise(0.05, 0.24, 'lowpass', 900, 300); },
    fall: function (s) {
      s.tone('sine', 900, 160, 0.42, 0.13);
      s.tone('sine', 120, 40, 0.16, 0.5, { delay: 0.42 }); s.noise(0.12, 0.28, 'lowpass', 800, 200, 1, 0.42);
    },
    explosion: function (s) { s.noise(0.85, 0.7, 'lowpass', 2600, 110); s.tone('sine', 95, 30, 0.6, 0.6); },
    death: function (s) { s.tone('square', 520, 85, 0.36, 0.1, { filter: 1500 }); s.noise(0.26, 0.18, 'lowpass', 1300, 300, 1, 0.1); },
    downed: function (s) { // sad trombone
      [392, 370, 349].forEach(function (f, i) { s.tone('sawtooth', f, f * 0.985, 0.22, 0.09, { delay: i * 0.24, filter: 950 }); });
      s.tone('sawtooth', 330, 300, 0.55, 0.09, { delay: 0.72, filter: 950, vibrato: [6, 8] });
    },
    levelup: function (s) {
      [523, 659, 784, 1046].forEach(function (f, i) { s.tone('square', f, f, 0.12, 0.07, { delay: i * 0.08, filter: 3200 }); });
      s.tone('triangle', 1046, 1046, 0.42, 0.11, { delay: 0.32 });
    },
    coin: function (s) { s.tone('square', 988, 988, 0.06, 0.07, { filter: 4200 }); s.tone('square', 1319, 1319, 0.22, 0.07, { delay: 0.06, filter: 4200 }); },
    buy: function (s) {
      s.noise(0.05, 0.22, 'highpass', 3000, 3200);
      s.tone('square', 1319, 1319, 0.08, 0.07, { delay: 0.05, filter: 4200 }); s.tone('square', 1760, 1760, 0.26, 0.07, { delay: 0.12, filter: 4200 });
    },
    error: function (s) { s.tone('square', 145, 135, 0.09, 0.11, { filter: 900 }); s.tone('square', 112, 100, 0.15, 0.11, { delay: 0.11, filter: 900 }); },
    turn: function (s) { s.tone('sine', 330, 330, 0.6, 0.16); s.tone('sine', 660, 660, 0.45, 0.05); s.tone('sine', 495, 495, 0.5, 0.045); },
    victory: function (s) {
      [523, 659, 784].forEach(function (f, i) { s.tone('triangle', f, f, 0.16, 0.18, { delay: i * 0.12 }); });
      [523, 659, 784, 1046].forEach(function (f) { s.tone('triangle', f, f, 0.85, 0.1, { delay: 0.4 }); });
    },
    defeat: function (s) { [392, 349, 311, 262].forEach(function (f, i) { s.tone('triangle', f, f * 0.99, 0.32, 0.16, { delay: i * 0.28 }); }); },
    bark: function (s) { // mumbly speech blips
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) { const f = rnd(230, 420); s.tone('square', f, f * rnd(0.9, 1.15), 0.055, 0.045, { delay: i * 0.065, filter: 1300 }); }
    },
    corgi: function (s) { // two yips
      for (let i = 0; i < 2; i++) {
        s.tone('triangle', 720, 1250, 0.06, 0.17, { delay: i * 0.17, filter: 2600 });
        s.tone('triangle', 1150, 780, 0.08, 0.15, { delay: i * 0.17 + 0.06, filter: 2600 });
      }
    },
    caw: function (s) { s.tone('sawtooth', 590, 410, 0.24, 0.12, { filter: 1700, q: 3, vibrato: [32, 30] }); s.noise(0.2, 0.07, 'bandpass', 1500, 1100, 2); },
    roar: function (s) { s.tone('sawtooth', 115, 68, 0.72, 0.22, { filter: 650, vibrato: [18, 12] }); s.noise(0.7, 0.22, 'lowpass', 950, 280); },
    magic: function (s) {
      for (let i = 0; i < 5; i++) { const f = rnd(1200, 2800); s.tone('sine', f, f * 1.05, 0.16, 0.05, { delay: i * 0.04 }); }
      s.noise(0.3, 0.07, 'highpass', 4200, 6400);
    },
    summon: function (s) { s.tone('triangle', 220, 880, 0.34, 0.13); s.tone('sine', 1320, 1760, 0.25, 0.05, { delay: 0.18 }); s.noise(0.3, 0.06, 'highpass', 4000, 6000, 1, 0.1); },
    step: function (s) { s.noise(0.035, 0.07, 'lowpass', 650, 300); },
    slash: function (s) { s.noise(0.13, 0.26, 'bandpass', 4200, 900, 1.5); },
    arrow: function (s) { s.noise(0.11, 0.16, 'bandpass', 2600, 1400, 3); s.tone('sine', 1800, 1300, 0.09, 0.035); },
    splash: function (s) {
      s.noise(0.3, 0.26, 'bandpass', 1300, 450, 1);
      for (let i = 0; i < 3; i++) s.tone('sine', rnd(300, 600), rnd(700, 1000), 0.06, 0.06, { delay: 0.04 + i * 0.05 });
    },
  };

  // ---- public API ---------------------------------------------------------------------------------------------
  DD.Audio = {
    names: Object.keys(SOUNDS),
    /** Play a named effect. Never throws; returns true when a sound was actually scheduled. */
    play: function (name, opts) {
      try {
        const fn = SOUNDS[name];
        if (!fn || isMuted()) return false;
        const ctx = A.ctx;
        if (!ctx || ctx.state !== 'running') return false;
        const now = ctx.currentTime;
        if (A.last[name] !== undefined && now - A.last[name] < THROTTLE_S) return false;
        if (A.voices >= MAX_VOICES) return false;
        A.last[name] = now;
        if (A.volume === null) A.master.gain.value = effectiveVolume(); // follow the settings screen live
        opts = opts || {};
        const vol = clamp(num(opts.vol, 1), 0, 2);
        if (vol <= 0) return false;
        const out = ctx.createGain();
        out.gain.value = vol;
        out.connect(A.master);
        const pitch = clamp(num(opts.pitch, 1), 0.25, 4) * (opts.exact ? 1 : rnd(0.96, 1.04));
        const v = new Voice(ctx, out, now + clamp(num(opts.delay, 0), 0, 5) + 0.005, pitch);
        fn(v);
        A.voices++;
        const ms = Math.max(50, (v.end - now) * 1000 + 60);
        setTimeout(function () { A.voices = Math.max(0, A.voices - 1); try { out.disconnect(); } catch (e) { /* already gone */ } }, ms);
        return true;
      } catch (e) {
        return false;
      }
    },
    setVolume: function (v) {
      A.volume = clamp(num(v, 0.6), 0, 1);
      if (A.master && A.ctx) { try { A.master.gain.setTargetAtTime(A.volume, A.ctx.currentTime, 0.02); } catch (e) { A.master.gain.value = A.volume; } }
      return A.volume;
    },
    mute: function (on) { A.muted = on !== false; return A.muted; },
    isMuted: isMuted,
    getVolume: effectiveVolume,
    /** True once the AudioContext exists and is running (after a user gesture). */
    ready: function () { return !!(A.ctx && A.ctx.state === 'running'); },
    /** Create/resume the context (call from a user gesture handler; listeners below do this automatically). */
    unlock: unlock,
  };

  DD.afterLoad(function () {
    if (DD.headless || window.DD_TEST) return;
    const onGesture = function () {
      unlock();
      if (A.ctx && A.ctx.state === 'running') {
        window.removeEventListener('pointerdown', onGesture, true);
        window.removeEventListener('keydown', onGesture, true);
        window.removeEventListener('touchstart', onGesture, true);
      }
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    window.addEventListener('touchstart', onGesture, true);
  });
})();
