'use strict';

/* ── Константы ── */
const KEY = 'teamRandomizerV1';
const TIER3_CHANCE = 0.15; // шанс легендарного (Tier 3 из магазина капитана)
const TIER2_CHANCE = 0.30; // шанс редкого (Tier 2)
const TIER = {
  1: { roman: 'I', c1: '#d9b545' },
  2: { roman: 'II', c1: '#57c47a' },
  3: { roman: 'III', c1: '#a86ae8' }
};
// Редкости предметов как в DBD; fx — какой «тир» эффектов (звук/частицы/тряска) играть.
const RARITY = {
  1: { roman: 'I', fx: 1 },   // обычный (коричневый)
  2: { roman: 'II', fx: 1 },  // необычный (жёлтый)
  3: { roman: 'III', fx: 2 }, // редкий (зелёный)
  4: { roman: 'IV', fx: 3 }   // очень редкий (фиолетовый)
};

/* ── Состояние ── */
const state = {
  data: null,
  muted: false,
  running: false,
  randKiller: false,   // рандомить убийцу вместе с перками
  randPool: [],        // src убийц, участвующих в рандоме; пусто = все
  killer: null,        // {src, name}
  killerPerks: [],     // [{name, src, tier}] до 4
  survivors: fresh(),  // [{icon:{src,name}|null, item:{name,src,rarity}|null, perks:[perk|null x4]}]
  picker: null,        // null | {type:'killer'} | {type:'surv', s}
  lastFx: null,        // {id, tier} — слот, раскрытый последним шагом (для анимации)
  popPortrait: null    // 'killer' | 'surv0'.. — портрет, который только что выбрали (одноразовая анимация)
};

let queue = [], qi = 0, stepTimer = null, fxClearTimer = null, dragFrom = null;

const stageEl = document.getElementById('stage');
const heroEl = document.getElementById('killer-hero');
const kPerksEl = document.getElementById('killer-perks');
const rowsEl = document.getElementById('surv-rows');
const pickerEl = document.getElementById('picker');
const btnMain = document.getElementById('btn-main');
const btnSound = document.getElementById('btn-sound');
const btnReset = document.getElementById('btn-reset');
const chkRandKiller = document.getElementById('chk-rand-killer');
const btnPool = document.getElementById('btn-pool');

function fresh() {
  return [0, 1, 2, 3].map(() => ({ icon: null, item: null, perks: [null, null, null, null] }));
}

/* ── Утилиты ── */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

function initials(name) {
  const w = String(name || '?').split(/[\s-]+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : String(name || '?').slice(0, 2)).toUpperCase();
}

function imgHTML(src, fb) {
  return `<img src="${esc(src)}" alt="" data-fb="${esc(fb)}" onerror="__imgFail(this)">`;
}
window.__imgFail = img => {
  const d = document.createElement('div');
  d.className = 'imgfb';
  d.textContent = img.dataset.fb || '?';
  img.replaceWith(d);
};

function save() {
  const { killer, killerPerks, survivors, muted, randKiller, randPool } = state;
  localStorage.setItem(KEY, JSON.stringify({ killer, killerPerks, survivors, muted, randKiller, randPool }));
}

function rollTier() {
  const r = Math.random();
  return r < TIER3_CHANCE ? 3 : r < TIER3_CHANCE + TIER2_CHANCE ? 2 : 1;
}

// Редкость предмета: 10% фиолетовый, 25% зелёный, 30% жёлтый, 35% коричневый.
function rollItemRarity() {
  const r = Math.random();
  return r < .10 ? 4 : r < .35 ? 3 : r < .65 ? 2 : 1;
}

// Кидает тир, затем берёт случайный неиспользованный перк этого тира из магазина капитана.
function pickPerk(pool, used) {
  const tier = rollTier();
  for (const t of [tier, 2, 1, 3]) {
    const c = pool.filter(p => p.tier === t && !used.has(p.src));
    if (c.length) { const p = rnd(c); used.add(p.src); return p; }
  }
  return null;
}

/* ── Масштаб сцены ── */
function rescale() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const w = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
  const s = Math.min(w / 2560, h / 1440);
  stageEl.style.setProperty('--stage-scale', s);
  stageEl.style.transform = `scale(${s})`;
}
window.addEventListener('resize', rescale);
if (window.visualViewport) window.visualViewport.addEventListener('resize', rescale);
rescale();

/* ── Звуки (WebAudio) ── */
let audioCtx = null;
function ctx() {
  if (state.muted) return null;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}
function tone(c, { type = 'triangle', f0 = 440, f1, t0 = 0, dur = .15, gain = .15 }) {
  const o = c.createOscillator(), g = c.createGain(), now = c.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f0, now);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(.0001, now + dur);
  o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + dur + .02);
}
function noiseBurst(c, { t0 = 0, dur = .3, gain = .25, freq = 1200 }) {
  const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = freq;
  const g = c.createGain(); g.gain.value = gain;
  s.connect(fl); fl.connect(g); g.connect(c.destination); s.start(c.currentTime + t0);
}
function sndFor(tier) {
  const c = ctx(); if (!c) return;
  if (tier === 3) {
    tone(c, { type: 'sine', f0: 150, f1: 38, dur: .6, gain: .55 });
    noiseBurst(c, { dur: .35, gain: .3, freq: 900 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, { type: 'square', f0: f, t0: .16 + i * .07, dur: .12, gain: .07 }));
    tone(c, { f0: 2093, t0: .55, dur: .5, gain: .06 });
  } else if (tier === 2) {
    tone(c, { f0: 660, dur: .18, gain: .14 });
    tone(c, { f0: 880, t0: .09, dur: .2, gain: .13 });
    tone(c, { f0: 1320, t0: .18, dur: .24, gain: .09 });
    noiseBurst(c, { dur: .12, gain: .05, freq: 4000 });
  } else {
    tone(c, { f0: 520, f1: 760, dur: .12, gain: .14 });
  }
}
function sndPick() { const c = ctx(); if (!c) return; tone(c, { f0: 380, f1: 540, dur: .14, gain: .12 }); }

/* ── FX: вспышки частиц на общем канвасе ── */
const fxCanvas = document.getElementById('fx');
const fxCtx = fxCanvas.getContext('2d');
let bursts = [], fxRaf = null;

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, a).toFixed(3)})`;
}

function spawnBurst(x, y, tier, c1Override) {
  if (tier < 2) return;
  const c1 = c1Override || TIER[tier].c1, big = tier === 3;
  const parts = [];
  const N = big ? 44 : 16;
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, sp = big ? 240 + Math.random() * 480 : 150 + Math.random() * 220;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: big ? 1.8 + Math.random() * 4.2 : 1.5 + Math.random() * 2.6, col: Math.random() < .35 ? '#ffffff' : c1, die: .5 + Math.random() * .5 });
  }
  const streaks = big ? Array.from({ length: 16 }, () => ({ a: Math.random() * Math.PI * 2, sp: 550 + Math.random() * 550, w: 1 + Math.random() * 2.2 })) : [];
  bursts.push({ x, y, c1, big, parts, streaks, waves: big ? [0, .13, .3] : [0], t0: performance.now(), last: performance.now(), dur: big ? 1250 : 750 });
  if (!fxRaf) fxRaf = requestAnimationFrame(fxFrame);
}

function fxFrame(now) {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  fxCtx.globalCompositeOperation = 'lighter';
  const ease = x => 1 - Math.pow(1 - x, 3);
  bursts = bursts.filter(b => {
    const t = (now - b.t0) / b.dur, dt = Math.min(.05, (now - b.last) / 1000);
    b.last = now;
    if (t >= 1) return false;
    if (t < .2) {
      const a = Math.pow(1 - t / .2, 1.5);
      const g = fxCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.big ? 110 : 60);
      g.addColorStop(0, `rgba(255,255,255,${(a * .95).toFixed(3)})`);
      g.addColorStop(.45, hexA(b.c1, a * .55));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      fxCtx.fillStyle = g;
      fxCtx.fillRect(b.x - 130, b.y - 130, 260, 260);
    }
    b.waves.forEach((d, wi) => {
      const tt = (t - d) / .5;
      if (tt <= 0 || tt >= 1) return;
      fxCtx.beginPath(); fxCtx.arc(b.x, b.y, ease(tt) * (b.big ? 205 : 120), 0, Math.PI * 2);
      fxCtx.strokeStyle = hexA(wi === 1 ? '#ffffff' : b.c1, (1 - tt) * .85);
      fxCtx.lineWidth = (1 - tt) * (b.big ? 9 : 6) + 1.5;
      fxCtx.stroke();
    });
    if (t < .32) b.streaks.forEach(sk => {
      const r0 = sk.sp * t * .9, len = sk.sp * .1 * (1 - t / .32);
      fxCtx.beginPath();
      fxCtx.moveTo(b.x + Math.cos(sk.a) * r0, b.y + Math.sin(sk.a) * r0);
      fxCtx.lineTo(b.x + Math.cos(sk.a) * (r0 + len), b.y + Math.sin(sk.a) * (r0 + len));
      fxCtx.strokeStyle = hexA(b.c1, (1 - t / .32) * .8);
      fxCtx.lineWidth = sk.w; fxCtx.stroke();
    });
    b.parts.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = Math.pow(.9, dt * 60); p.vx *= drag; p.vy = p.vy * drag - 26 * dt;
      const a = Math.max(0, p.die - t) / p.die;
      if (a <= 0) return;
      fxCtx.shadowBlur = 12; fxCtx.shadowColor = p.col;
      fxCtx.fillStyle = hexA(p.col, a * (.7 + .3 * Math.sin(now * .04 + p.r * 9)));
      fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.r * (.4 + .6 * a), 0, Math.PI * 2); fxCtx.fill();
      fxCtx.shadowBlur = 0;
    });
    return true;
  });
  fxCtx.globalCompositeOperation = 'source-over';
  if (bursts.length) fxRaf = requestAnimationFrame(fxFrame);
  else { fxRaf = null; fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); }
}

function burstAt(fxId, tier, c1Override) {
  const el = stageEl.querySelector(`[data-fxid="${fxId}"]`);
  if (!el) return;
  const sr = stageEl.getBoundingClientRect(), r = el.getBoundingClientRect();
  const scale = sr.width / 2560;
  spawnBurst((r.left + r.width / 2 - sr.left) / scale, (r.top + r.height / 2 - sr.top) / scale, tier, c1Override);
}

function shake() {
  stageEl.classList.remove('shake');
  void stageEl.offsetWidth;
  stageEl.classList.add('shake');
  setTimeout(() => stageEl.classList.remove('shake'), 550);
}

/* ── Рендер ── */
function popClass(id, tier) {
  return state.lastFx && state.lastFx.id === id ? ` pop${tier}` : '';
}

function perkSlotHTML(kind, id, perk, dndAttrs = '') {
  const cls = kind === 'k' ? 'pslot pslot--k' : 'pslot pslot--s';
  if (!perk) {
    return `<div class="${cls}" data-fxid="${id}" ${dndAttrs}>
      <div class="pslot__box"><div class="diamond diamond--empty"><div>?</div></div></div>
      <div class="pslot__name pslot__name--empty">${kind === 'k' ? 'Пустой слот' : ''}</div>
    </div>`;
  }
  const t = TIER[perk.tier];
  return `<div class="${cls}" data-fxid="${id}" ${dndAttrs}>
    <div class="pslot__box"><div class="popwrap${popClass(id, perk.tier)}"><div class="diamond t${perk.tier}">${imgHTML(perk.src, initials(perk.name))}</div></div></div>
    <div class="pslot__name">${esc(perk.name)}${kind === 's' ? ' · ' + t.roman : ''}</div>
  </div>`;
}

function renderKiller() {
  if (state.killer) {
    const pop = state.popPortrait === 'killer' ? ' pop-in' : '';
    heroEl.innerHTML = `
      <div class="portrait portrait--killer${pop}" id="killer-portrait" data-fxid="killer" title="Сменить убийцу">${imgHTML(state.killer.src, initials(state.killer.name))}</div>
      <div class="killer-name">${esc(state.killer.name)}</div>`;
  } else {
    heroEl.innerHTML = `
      <div class="portrait-empty portrait-empty--killer" id="killer-portrait" data-fxid="killer">?</div>
      <div class="killer-hint">нажми, чтобы выбрать</div>`;
  }
  heroEl.querySelector('#killer-portrait').addEventListener('click', () => {
    if (!state.running) { state.picker = { type: 'killer' }; renderPicker(); }
  });
  kPerksEl.innerHTML = [0, 1, 2, 3].map(i => perkSlotHTML('k', 'kp' + i, state.killerPerks[i] || null)).join('');
}

function renderSurvivors() {
  rowsEl.innerHTML = state.survivors.map((sv, si) => {
    const idCol = sv.icon ? `
      <div class="portrait portrait--surv${state.popPortrait === 'surv' + si ? ' pop-in' : ''}" data-pick="${si}" title="Сменить выжившего">${imgHTML(sv.icon.src, initials(sv.icon.name))}</div>
      <div class="surv-name">${esc(sv.icon.name)}</div>` : `
      <div class="portrait-empty portrait-empty--surv" data-pick="${si}">?</div>
      <div class="surv-pick-hint">ВЫБРАТЬ</div>`;

    const itemId = 'it' + si;
    const item = sv.item;
    const itemBox = item
      ? `<div class="item r${item.rarity}${popClass(itemId, RARITY[item.rarity].fx)}">${imgHTML(item.src, '❖')}</div>`
      : `<div class="item--empty">?</div>`;
    const addonPop = state.lastFx && state.lastFx.id === itemId;
    const addons = [0, 1].map(k => item
      ? `<div class="addon r${item.rarity}${addonPop ? ' pop' + (k ? ' pop--late' : '') : ''}" title="Аддон предмета"></div>`
      : `<div class="addon addon--empty" title="Аддон"></div>`).join('');
    const label = item
      ? `<div class="gear__label gear__label--r${item.rarity}">${esc(item.name)} · ${RARITY[item.rarity].roman}</div>`
      : `<div class="gear__label gear__label--empty">ПРЕДМЕТ</div>`;

    const perks = sv.perks.map((p, i) => {
      const dnd = `data-s="${si}" data-i="${i}" draggable="${!!p && !state.running}"`;
      return perkSlotHTML('s', `sp${si}-${i}`, p, dnd);
    }).join('');

    return `<div class="srow">
      <div class="srow__id">${idCol}</div>
      <div class="gear">
        <div class="gear__row">
          <div class="gear__itembox" data-fxid="${itemId}" data-s="${si}" draggable="${!!item && !state.running}">${itemBox}</div>
          <div class="addons">${addons}</div>
        </div>
        ${label}
      </div>
      <div class="srow__div"></div>
      <div class="srow__perks">${perks}</div>
    </div>`;
  }).join('');

  rowsEl.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', () => {
    if (!state.running) { state.picker = { type: 'surv', s: +el.dataset.pick }; renderPicker(); }
  }));
}

function renderPicker() {
  const p = state.picker;
  if (!p || !state.data) { pickerEl.innerHTML = ''; return; }
  if (p.type === 'pool') { renderPoolPicker(); return; }
  const isKiller = p.type === 'killer';
  const options = isKiller ? state.data.killers : state.data.icons;
  const current = isKiller
    ? (state.killer && state.killer.src)
    : (state.survivors[p.s].icon && state.survivors[p.s].icon.src);

  pickerEl.innerHTML = `
    <div class="picker-overlay">
      <div class="picker${isKiller ? ' picker--killer' : ''}">
        <div class="picker__head">
          <div class="picker__title">${isKiller ? 'Выбор убийцы' : 'Выбор выжившего ' + (p.s + 1)}</div>
          <div style="flex:1"></div>
          <button class="picker__close" type="button">ЗАКРЫТЬ ✕</button>
        </div>
        <div class="picker__grid">
          ${options.map((o, oi) => `
            <div class="popt" data-oi="${oi}">
              <div class="popt__img${o.src === current ? ' active' : ''}">${imgHTML(o.src, initials(o.name))}</div>
              <div class="popt__name">${esc(o.name)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  const overlay = pickerEl.querySelector('.picker-overlay');
  overlay.addEventListener('click', closePicker);
  pickerEl.querySelector('.picker').addEventListener('click', e => e.stopPropagation());
  pickerEl.querySelector('.picker__close').addEventListener('click', closePicker);
  pickerEl.querySelectorAll('.popt').forEach(el => el.addEventListener('click', () => {
    const o = options[+el.dataset.oi];
    if (isKiller) state.killer = { src: o.src, name: o.name };
    else state.survivors[p.s].icon = { src: o.src, name: o.name };
    state.popPortrait = isKiller ? 'killer' : 'surv' + p.s;
    state.picker = null;
    sndPick(); save(); render();
  }));
}

function closePicker() { state.picker = null; renderPicker(); }

/* ── Пул убийц для рандома ── */
function poolSelectedCount() {
  if (!state.data) return 0;
  const sel = new Set(state.randPool);
  return state.data.killers.filter(k => sel.has(k.src)).length;
}

function updatePoolBtn() {
  if (!state.data) { btnPool.hidden = true; return; }
  btnPool.hidden = !state.randKiller;
  const n = poolSelectedCount(), total = state.data.killers.length;
  btnPool.textContent = (n === 0 || n === total) ? 'ПУЛ: ВСЕ' : `ПУЛ: ${n}/${total}`;
}

function poolCountText() {
  const n = poolSelectedCount();
  return n ? `выбрано: ${n} из ${state.data.killers.length}` : 'никто не выбран — рандом по всем';
}

function renderPoolPicker() {
  const killers = state.data.killers;
  const sel = new Set(state.randPool);
  pickerEl.innerHTML = `
    <div class="picker-overlay">
      <div class="picker picker--killer">
        <div class="picker__head">
          <div class="picker__title">Пул рандома</div>
          <div class="pool-count" id="pool-count">${esc(poolCountText())}</div>
          <div style="flex:1"></div>
          <button class="picker__close" type="button" data-act="all">ВСЕ</button>
          <button class="picker__close" type="button" data-act="none">НИКТО</button>
          <button class="picker__close" type="button" data-act="close">ГОТОВО ✓</button>
        </div>
        <div class="picker__grid">
          ${killers.map((o, oi) => `
            <div class="popt popt--pool${sel.has(o.src) ? ' sel' : ''}" data-oi="${oi}">
              <div class="popt__img${sel.has(o.src) ? ' active' : ''}">${imgHTML(o.src, initials(o.name))}</div>
              <div class="popt__check">✓</div>
              <div class="popt__name">${esc(o.name)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  const countEl = pickerEl.querySelector('#pool-count');
  const syncOne = el => {
    const on = new Set(state.randPool).has(killers[+el.dataset.oi].src);
    el.classList.toggle('sel', on);
    el.querySelector('.popt__img').classList.toggle('active', on);
  };
  const syncAll = () => {
    pickerEl.querySelectorAll('.popt--pool').forEach(syncOne);
    countEl.textContent = poolCountText();
    updatePoolBtn();
    save();
  };

  pickerEl.querySelector('.picker-overlay').addEventListener('click', closePicker);
  pickerEl.querySelector('.picker').addEventListener('click', e => e.stopPropagation());
  pickerEl.querySelectorAll('.picker__close').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'close') { closePicker(); return; }
    state.randPool = act === 'all' ? killers.map(k => k.src) : [];
    sndPick(); syncAll();
  }));
  pickerEl.querySelectorAll('.popt--pool').forEach(el => el.addEventListener('click', () => {
    const src = killers[+el.dataset.oi].src;
    const i = state.randPool.indexOf(src);
    if (i >= 0) state.randPool.splice(i, 1); else state.randPool.push(src);
    sndPick(); syncOne(el);
    countEl.textContent = poolCountText();
    updatePoolBtn();
    save();
  }));
}

function render() {
  btnSound.textContent = state.muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ';
  btnMain.textContent = state.running ? 'ПРОПУСТИТЬ ▸▸' : (state.data ? 'РАНДОМИЗИРОВАТЬ' : 'ЗАГРУЗКА…');
  chkRandKiller.checked = state.randKiller;
  updatePoolBtn();
  renderKiller();
  renderSurvivors();
  renderPicker();
  state.popPortrait = null; // анимация портрета одноразовая — следующие рендеры её не повторяют
}

/* ── Drag & drop: перки и предметы выживших ── */
function dragTarget(e, kind) {
  const sel = kind === 'perk' ? '.pslot--s' : '.gear__itembox';
  return e.target.closest(sel);
}
rowsEl.addEventListener('dragstart', e => {
  const perk = e.target.closest('.pslot--s[draggable="true"]');
  const item = e.target.closest('.gear__itembox[draggable="true"]');
  if (state.running || (!perk && !item)) { e.preventDefault(); return; }
  dragFrom = perk
    ? { kind: 'perk', s: +perk.dataset.s, i: +perk.dataset.i }
    : { kind: 'item', s: +item.dataset.s };
});
rowsEl.addEventListener('dragover', e => {
  if (!dragFrom) return;
  const slot = dragTarget(e, dragFrom.kind);
  if (slot) { e.preventDefault(); slot.classList.add('dragover'); }
});
rowsEl.addEventListener('dragleave', e => {
  const slot = e.target.closest('.pslot--s, .gear__itembox');
  if (slot) slot.classList.remove('dragover');
});
rowsEl.addEventListener('drop', e => {
  if (!dragFrom || state.running) { dragFrom = null; return; }
  const slot = dragTarget(e, dragFrom.kind);
  if (!slot) { dragFrom = null; return; }
  e.preventDefault();
  let changed = false;
  if (dragFrom.kind === 'perk') {
    const to = { s: +slot.dataset.s, i: +slot.dataset.i };
    if (to.s !== dragFrom.s || to.i !== dragFrom.i) {
      const a = state.survivors[dragFrom.s].perks, b = state.survivors[to.s].perks;
      const tmp = a[dragFrom.i]; a[dragFrom.i] = b[to.i]; b[to.i] = tmp;
      changed = true;
    }
  } else {
    const toS = +slot.dataset.s;
    if (toS !== dragFrom.s) {
      const a = state.survivors[dragFrom.s], b = state.survivors[toS];
      const tmp = a.item; a.item = b.item; b.item = tmp;
      changed = true;
    }
  }
  if (changed) {
    sndPick(); save();
    state.lastFx = null;
    render();
  }
  dragFrom = null;
});
rowsEl.addEventListener('dragend', () => {
  dragFrom = null;
  rowsEl.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));
});

/* ── Последовательность раскрытия ── */
function randomize() {
  if (!state.data) return;
  if (state.running) { skipAll(); return; }

  const d = state.data;
  const kUsed = new Set();
  const kPerks = [0, 1, 2, 3].map(() => pickPerk(d.killerPerks, kUsed));
  const sUsed = new Set(), itemsUsed = new Set();
  const svGear = state.survivors.map(() => {
    const rarity = rollItemRarity();
    let pool = d.items.filter(it => it.rarity === rarity && !itemsUsed.has(it.src));
    if (!pool.length) pool = d.items.filter(it => !itemsUsed.has(it.src));
    const item = rnd(pool);
    itemsUsed.add(item.src);
    return { item, perks: [0, 1, 2, 3].map(() => pickPerk(d.survivorPerks, sUsed)) };
  });

  queue = [];
  if (state.randKiller && d.killers.length) {
    const sel = new Set(state.randPool);
    let kPool = d.killers.filter(k => sel.has(k.src));
    if (!kPool.length) kPool = d.killers; // пустой пул = рандом по всем
    if (state.killer && kPool.length > 1) kPool = kPool.filter(k => k.src !== state.killer.src);
    queue.push({ kind: 'killer', killer: rnd(kPool), id: 'killer', tier: 3, c1: '#e06a5a' });
  }
  kPerks.forEach((p, i) => queue.push({ kind: 'kperk', i, p, id: 'kp' + i, tier: p.tier }));
  svGear.forEach((g, s) => {
    queue.push({ kind: 'item', s, item: g.item, id: 'it' + s, tier: RARITY[g.item.rarity].fx });
    g.perks.forEach((p, i) => queue.push({ kind: 'sperk', s, i, p, id: `sp${s}-${i}`, tier: p.tier }));
  });
  qi = 0;

  state.running = true;
  state.killerPerks = [];
  if (state.randKiller) state.killer = null;
  state.survivors = state.survivors.map(x => ({ ...x, item: null, perks: [null, null, null, null] }));
  state.lastFx = null;
  render();
  clearTimeout(stepTimer);
  clearTimeout(fxClearTimer);
  stepTimer = setTimeout(runStep, 350);
}

function commit(st) {
  if (st.kind === 'killer') { state.killer = st.killer; state.popPortrait = 'killer'; }
  else if (st.kind === 'kperk') state.killerPerks[st.i] = st.p;
  else if (st.kind === 'item') state.survivors[st.s].item = st.item;
  else state.survivors[st.s].perks[st.i] = st.p;
}

function runStep() {
  const st = queue[qi];
  if (!st) {
    state.running = false;
    save();
    render();
    fxClearTimer = setTimeout(() => { state.lastFx = null; render(); }, 1200);
    return;
  }
  commit(st);
  state.lastFx = { id: st.id, tier: st.tier };
  render();
  burstAt(st.id, st.tier, st.c1);
  sndFor(st.tier);
  if (st.tier === 3) shake();
  save();
  qi++;
  const dur = st.tier === 3 ? 1500 : st.tier === 2 ? 950 : 620;
  clearTimeout(stepTimer);
  stepTimer = setTimeout(runStep, Math.max(220, dur));
}

function skipAll() {
  clearTimeout(stepTimer);
  for (; qi < queue.length; qi++) commit(queue[qi]);
  state.running = false;
  state.lastFx = null;
  save();
  render();
}

/* ── Кнопки ── */
btnMain.addEventListener('click', randomize);
btnSound.addEventListener('click', () => { state.muted = !state.muted; save(); render(); });
chkRandKiller.addEventListener('change', () => {
  state.randKiller = chkRandKiller.checked;
  if (state.randKiller && state.data) {
    if (!state.randPool.length) state.randPool = state.data.killers.map(k => k.src);
    if (!state.running) state.picker = { type: 'pool' };
  }
  save(); render();
});
btnPool.addEventListener('click', () => {
  if (!state.running && state.data) { state.picker = { type: 'pool' }; renderPicker(); }
});
btnReset.addEventListener('click', () => {
  if (state.running) return;
  if (!confirm('Сбросить всё: персонажей, перки, предметы?')) return;
  localStorage.removeItem(KEY);
  state.killer = null;
  state.killerPerks = [];
  state.survivors = fresh();
  state.picker = null;
  state.lastFx = null;
  render();
});

/* ── Загрузка ── */
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && (s.killer || s.survivors)) {
    state.killer = s.killer || null;
    state.killerPerks = Array.isArray(s.killerPerks) ? s.killerPerks : [];
    if (Array.isArray(s.survivors) && s.survivors.length === 4) {
      state.survivors = s.survivors.map(x => ({
        icon: x.icon || null,
        item: x.item && x.item.rarity ? x.item : null, // старые сохранения без rarity сбрасываем
        perks: Array.isArray(x.perks) && x.perks.length === 4 ? x.perks : [null, null, null, null]
      }));
    }
    state.muted = !!s.muted;
    state.randKiller = !!s.randKiller;
    state.randPool = Array.isArray(s.randPool) ? s.randPool.filter(x => typeof x === 'string') : [];
  }
} catch (e) { /* битый localStorage — начинаем с чистого */ }

render();

fetch('data.json')
  .then(r => r.json())
  .then(d => { state.data = d; render(); })
  .catch(() => { btnMain.textContent = 'ОШИБКА ДАННЫХ'; });
