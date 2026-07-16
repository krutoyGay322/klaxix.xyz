// Procedural sound effects (Web Audio) — ported 1:1. Exposed as App.sfx.
window.App = window.App || {};
(function (App) {

  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const on = () => App.PROPS.sounds !== false;

  const sfx = {
    unlockAudio() { try { ac(); } catch (e) {} },

    tick() {
      if (!on()) return;
      try {
        const c = ac(), t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = 1500 + Math.random() * 500;
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + 0.06);
      } catch (e) {}
    },

    land() {
      if (!on()) return;
      try {
        const c = ac(), t = c.currentTime;
        const o1 = c.createOscillator(), g1 = c.createGain();
        o1.type = 'sawtooth'; o1.frequency.setValueAtTime(130, t); o1.frequency.exponentialRampToValueAtTime(55, t + 0.22);
        g1.gain.setValueAtTime(0.22, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        o1.connect(g1); g1.connect(c.destination); o1.start(t); o1.stop(t + 0.3);
        [880, 1174, 1568].forEach((f, i) => {
          const o = c.createOscillator(), g = c.createGain();
          const st = t + 0.08 + i * 0.07;
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.001, st);
          g.gain.exponentialRampToValueAtTime(0.12, st + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
          o.connect(g); g.connect(c.destination); o.start(st); o.stop(st + 0.45);
        });
      } catch (e) {}
    },

    boom() {
      if (!on()) return;
      try {
        const c = ac(), t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
        g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.7);
        const o2 = c.createOscillator(), g2 = c.createGain();
        o2.type = 'square'; o2.frequency.setValueAtTime(66, t); o2.frequency.exponentialRampToValueAtTime(33, t + 0.3);
        g2.gain.setValueAtTime(0.22, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o2.connect(g2); g2.connect(c.destination); o2.start(t); o2.stop(t + 0.45);
      } catch (e) {}
    },

    whoosh() {
      if (!on()) return;
      try {
        const c = ac(), t = c.currentTime;
        const len = Math.floor(c.sampleRate * 0.6);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
        f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
        const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
      } catch (e) {}
    },

    coin() {
      if (!on()) return;
      try {
        const c = ac(), t = c.currentTime;
        [1318, 1760, 2093].forEach((f, i) => {
          const o = c.createOscillator(), g = c.createGain();
          const st = t + i * 0.06;
          o.type = 'triangle'; o.frequency.value = f;
          g.gain.setValueAtTime(0.001, st); g.gain.exponentialRampToValueAtTime(0.13, st + 0.015); g.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
          o.connect(g); g.connect(c.destination); o.start(st); o.stop(st + 0.3);
        });
      } catch (e) {}
    }
  };

  App.sfx = sfx;

})(window.App);
