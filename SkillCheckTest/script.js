(() => {
  'use strict';

  const CFG = {
    rot: 1250,     // ms per full needle rotation
    zone: 25,      // success zone width in degrees
    madness: true  // circles drift to random positions and may spin backwards
  };

  // DOM
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const timerEl = document.getElementById('timer');
  const bestEl = document.getElementById('best');
  const hitsEl = document.getElementById('hits');
  const idleOverlay = document.getElementById('idleOverlay');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const deadOverlay = document.getElementById('deadOverlay');
  const countEl = document.getElementById('count');
  const lastTimeEl = document.getElementById('lastTime');
  const deadHitsEl = document.getElementById('deadHits');
  const newBestEl = document.getElementById('newBest');
  const historyListEl = document.getElementById('historyList');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const sizeRange = document.getElementById('sizeRange');
  const sizeValue = document.getElementById('sizeValue');
  const keyBtn = document.getElementById('keyBtn');
  const hintKey = document.getElementById('hintKey');

  // Settings (persisted)
  const settings = {
    size: Number(localStorage.getItem('scg-size') || 100),
    keyCode: localStorage.getItem('scg-key-code') || 'Space',
    keyLabel: localStorage.getItem('scg-key-label') || 'ПРОБЕЛ'
  };
  let rebinding = false;
  // на тачскринах клавиатуры нет — подпись в круге и подсказка меняются на «ТАП»
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const hitLabel = () => (isTouch ? 'ТАП' : settings.keyLabel);

  // State
  let phase = 'idle'; // idle | countdown | running | dead
  let hits = 0;
  let best = Number(localStorage.getItem('scg-best') || 0);
  let history = JSON.parse(localStorage.getItem('scg-history') || '[]');

  let check = null;
  let nextAt = 0;
  let runStart = 0;
  let lastT = 0;
  let flash = 0;
  let lastX = null, lastY = null;
  let w = 0, h = 0;
  let cdTimeout = null;

  // ---- audio ----
  let ac = null;
  function audioCtx() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function beep(freq, dur, type, gainV) {
    try {
      const a = audioCtx(), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gainV || 0.12, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    } catch (e) {}
  }

  function playGood() {
    beep(660, 0.07, 'triangle', 0.12);
    setTimeout(() => beep(880, 0.1, 'triangle', 0.1), 50);
  }

  function playFail() {
    beep(140, 0.5, 'sawtooth', 0.16);
    beep(110, 0.55, 'sawtooth', 0.12);
  }

  // ---- layout ----
  function fit() {
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    w = parent.clientWidth;
    h = parent.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- helpers ----
  function fmt(ms) {
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 'с';
    const m = Math.floor(s / 60), r = (s - m * 60).toFixed(1);
    return m + ':' + (Number(r) < 10 ? '0' : '') + r;
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function renderHud() {
    hitsEl.textContent = hits;
    bestEl.textContent = best > 0 ? fmt(best) : '—';
  }

  function renderHistory() {
    historyListEl.textContent = '';
    history.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'history-row';

      const n = document.createElement('span');
      n.className = 'history-n';
      n.textContent = '#' + (history.length - i);

      const time = document.createElement('span');
      time.className = 'history-time' + (entry.ms === Math.round(best) ? ' history-time--best' : '');
      time.textContent = fmt(entry.ms);

      const hitsSpan = document.createElement('span');
      hitsSpan.className = 'history-hits';
      hitsSpan.textContent = entry.hits + ' поп.';

      row.append(n, time, hitsSpan);
      historyListEl.appendChild(row);
    });
  }

  // ---- game flow ----
  function start() {
    audioCtx();
    clearTimeout(cdTimeout);
    rebinding = false;
    renderSettings();
    check = null;
    flash = 0;
    lastX = null;
    lastY = null;
    hits = 0;
    timerEl.textContent = '0.0с';
    renderHud();
    hide(idleOverlay);
    hide(deadOverlay);
    show(countdownOverlay);
    phase = 'countdown';
    const step = (n) => {
      countEl.textContent = n;
      if (n > 0) {
        beep(440, 0.1, 'sine', 0.1);
        cdTimeout = setTimeout(() => step(n - 1), 800);
      } else {
        beep(880, 0.15, 'sine', 0.12);
        hide(countdownOverlay);
        nextAt = performance.now() + 400;
        runStart = performance.now();
        phase = 'running';
      }
    };
    step(3);
  }

  function clamp(v, lo, hi) {
    // на узких экранах границы могут пересечься — тогда просто центр
    return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  }

  function spawn(now) {
    // круг не должен вылезать за маленький экран телефона
    const R = Math.min(84 * settings.size / 100, Math.min(w, h) / 2 - 30);
    const m = R + 40;
    let x = w / 2, y = h / 2;
    if (CFG.madness) {
      const px = lastX ?? w / 2, py = lastY ?? h / 2;
      const drift = 220;
      x = clamp(px + (Math.random() * 2 - 1) * drift, m, w - m);
      y = clamp(py + (Math.random() * 2 - 1) * drift, m, h - m);
    }
    lastX = x;
    lastY = y;
    check = {
      x, y, R,
      dir: CFG.madness && Math.random() < 0.3 ? -1 : 1,
      base: Math.random() * 360,
      progress: 0,
      zoneStart: 110 + Math.random() * 90,
      zoneW: Math.max(6, CFG.zone),
      born: now
    };
  }

  function press() {
    if (!check) return;
    const p = check.progress, zs = check.zoneStart;
    if (p >= zs && p <= zs + check.zoneW) {
      playGood();
      hits++;
      hitsEl.textContent = hits;
      succeed();
    } else {
      fail();
    }
  }

  function succeed() {
    check = null;
    nextAt = 0;
  }

  function fail() {
    playFail();
    flash = 1;
    check = null;
    phase = 'dead';
    const ms = performance.now() - runStart;
    let isNewBest = false;
    if (ms > best) {
      best = ms;
      isNewBest = true;
      localStorage.setItem('scg-best', String(Math.round(ms)));
    }
    history = [{ ms: Math.round(ms), hits }, ...history].slice(0, 30);
    localStorage.setItem('scg-history', JSON.stringify(history));

    renderHud();
    renderHistory();
    lastTimeEl.textContent = fmt(ms);
    deadHitsEl.textContent = hits;
    isNewBest ? show(newBestEl) : hide(newBestEl);
    show(deadOverlay);
  }

  function action() {
    if (phase === 'running') press();
  }

  // ---- main loop ----
  function tick(t) {
    const dt = lastT ? Math.min(50, t - lastT) : 16;
    lastT = t;
    if (phase === 'running') {
      timerEl.textContent = fmt(t - runStart);
      if (!check && t >= nextAt) spawn(t);
      if (check) {
        check.progress += dt * 360 / CFG.rot;
        if (check.progress > check.zoneStart + check.zoneW + 2) fail();
      }
    }
    if (flash > 0) flash = Math.max(0, flash - dt / 400);
    draw();
    requestAnimationFrame(tick);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    if (flash > 0) {
      ctx.fillStyle = 'rgba(160,20,28,' + (flash * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    }
    const ch = check;
    if (!ch) return;
    const rad = (a) => ((ch.dir * a) + ch.base - 90) * Math.PI / 180;
    const acw = ch.dir < 0;
    ctx.save();
    ctx.translate(ch.x, ch.y);
    // dark disc + thin pale ring
    ctx.beginPath();
    ctx.arc(0, 0, ch.R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,215,230,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // success zone — hollow outlined band
    const a0 = rad(ch.zoneStart), a1 = rad(ch.zoneStart + ch.zoneW);
    const rO = ch.R + 7, rI = ch.R - 7;
    ctx.beginPath();
    ctx.arc(0, 0, rO, a0, a1, acw);
    ctx.arc(0, 0, rI, a1, a0, !acw);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // hit key label, box sized to the key name
    const label = hitLabel();
    ctx.font = '700 15px "Chakra Petch", monospace';
    const bw = Math.max(64, ctx.measureText(label).width + 28);
    ctx.fillStyle = 'rgba(10,10,10,0.85)';
    ctx.fillRect(-bw / 2, -14, bw, 28);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-bw / 2, -14, bw, 28);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.textBaseline = 'alphabetic';
    // needle
    const na = rad(ch.progress);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(na) * (ch.R + 12), Math.sin(na) * (ch.R + 12));
    ctx.strokeStyle = '#c22b33';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  // ---- settings ----
  function keyLabelFrom(e) {
    if (e.code === 'Space') return 'ПРОБЕЛ';
    if (e.key.length === 1 && e.key !== ' ') return e.key.toUpperCase();
    if (e.code.startsWith('Key')) return e.code.slice(3);
    if (e.code.startsWith('Digit')) return e.code.slice(5);
    return e.key.toUpperCase();
  }

  function renderSettings() {
    sizeRange.value = settings.size;
    sizeValue.textContent = settings.size + '%';
    keyBtn.textContent = settings.keyLabel;
    keyBtn.classList.toggle('listening', rebinding);
    if (isTouch) {
      hintKey.parentElement.textContent = 'ТАП ПО ЭКРАНУ — ПОПАДАНИЕ';
    } else {
      hintKey.textContent = settings.keyLabel;
    }
  }

  sizeRange.addEventListener('input', () => {
    settings.size = Number(sizeRange.value);
    localStorage.setItem('scg-size', String(settings.size));
    sizeValue.textContent = settings.size + '%';
  });

  keyBtn.addEventListener('click', () => {
    if (phase === 'running') return;
    rebinding = !rebinding;
    keyBtn.textContent = rebinding ? 'НАЖМИТЕ...' : settings.keyLabel;
    keyBtn.classList.toggle('listening', rebinding);
  });

  // ---- wiring ----
  window.addEventListener('keydown', (e) => {
    if (rebinding) {
      e.preventDefault();
      if (e.code !== 'Escape') {
        settings.keyCode = e.code;
        settings.keyLabel = keyLabelFrom(e);
        localStorage.setItem('scg-key-code', settings.keyCode);
        localStorage.setItem('scg-key-label', settings.keyLabel);
      }
      rebinding = false;
      renderSettings();
      keyBtn.blur();
      return;
    }
    if (e.code === settings.keyCode) {
      e.preventDefault();
      action();
    }
  });
  canvas.addEventListener('pointerdown', action);
  startBtn.addEventListener('click', start);
  retryBtn.addEventListener('click', start);
  new ResizeObserver(fit).observe(canvas.parentElement);

  // реальная высота видимой области: vh/dvh во встроенных браузерах (Telegram и т.п.)
  // включают зону за панелями, из-за чего низ сцены обрезался
  function setAppHeight() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', vh + 'px');
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);

  fit();
  renderHud();
  renderSettings();
  requestAnimationFrame(tick);
})();
