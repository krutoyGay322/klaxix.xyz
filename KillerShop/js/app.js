/* Killer Shop - vanilla JS port of the original DC component (_legacy/Killer Shop.dc.html).
   Data (perks, items, rosters) comes from js/data.js - see tools/generate_data.py. */
(function () {
"use strict";

const D = window.SHOP_DATA;
const CONFIG = { startCells: 200, unlockNeed: 3 };

const ORDER = ["S", "A", "B", "C", "D"];
// one canonical reel strip - every column is this exact sequence, only the stop position differs
const STRIP = ["S","D","C","B","D","C","A","B","C","D","B","C","A","D","C","B","D","C"];
// how many strip steps a spin travels: iOS Safari drops composited layers that
// grow past its texture limit (blank reels), so touch devices get a short run
const STOP = window.matchMedia("(pointer: coarse)").matches ? 20 : 68;
const BTNS = [
  { name: "Ржавое колесо", cost: 100, hit: .3, odds: { S: 1, A: 5, B: 14, C: 35, D: 45 } },
  { name: "Кровавое колесо", cost: 250, hit: .4, odds: { S: 5, A: 13, B: 26, C: 36, D: 20 } },
  { name: "Проклятое колесо", cost: 500, hit: .5, odds: { S: 10, A: 20, B: 38, C: 26, D: 6 } }
];
const REWARD = { 1: 250, 2: 300, 3: 550 };
const CHOICE_REWARD = 5000;
const ST_LABEL = { 0: "0", 1: "I", 2: "II", 3: "III" };
const ST_COLOR = { 0: "#aeb6c0", 1: "#ffd75e", 2: "#55d44a", 3: "#c650ff" };
const TIER_COLOR = { S: "#ff6b74", A: "#c650ff", B: "#3d7bff", C: "#55d44a", D: "#a87f54" };
const RARITY_CLS = { "Обычный": "rar0", "Необычный": "rar1", "Редкий": "rar2", "Очень редкий": "rar3", "Ультраредкий": "rar4", "Событие": "rarE" };
const KADDONS = [
  { name: "Ржавые шестерни" },
  { name: "Чёрное перо" }
];
const KAQ = [
  { l: "Обычный", cost: 75, cls: "rar0" },
  { l: "Необычный", cost: 150, cls: "rar1" },
  { l: "Редкий", cost: 300, cls: "rar2" },
  { l: "Оч. редкий", cost: 600, cls: "rar3" },
  { l: "Ультраредкий", cost: 1200, cls: "rar4" }
];
const PICKER_CHOICES = 4;

// default lineup: first 4 survivors / first killer of the roster
function initialState() {
  return {
    cells: CONFIG.startCells, soldTotal: 0, choiceSold: false,
    killerSel: 0, survSel: [0, 1, 2, 3], rosterPick: null,
    hoverDelta: null, kaLvl: [0, 0], kdrag: null, drag: null,
    survItems: [null, null, null, null], itemPick: null, mergeAsk: null,
    survivors: [[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null]],
    killerPerks: [],
    reel: null, spinning: false, resultTier: null, missed: false,
    pickerTier: null, pickerChoices: null, confirmDel: null, debugOpen: false, perkListOpen: false,
    sel: null, ksel: null
  };
}
let S = initialState();

/* touchscreens have no HTML5 drag & drop - perks move by tap-select + tap-place */
const TOUCH = window.matchMedia("(pointer: coarse)").matches;
if (TOUCH) document.body.classList.add("touch"); // css disables the costly effects

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const sample = (arr, n) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
const surv = i => D.survivors[S.survSel[i]];
const killer = () => D.killers[S.killerSel];

/* ---------- stage scaling ---------- */
const stage = $("stage");
let winW = innerWidth, winH = innerHeight, scaleF = 1;
function fit() {
  winW = innerWidth; winH = innerHeight;
  scaleF = Math.min(winW / 1920, winH / 1080);
  stage.style.transform = "scale(" + scaleF + ")";
  stage.style.left = Math.max(0, (winW - 1920 * scaleF) / 2) + "px";
  stage.style.top = Math.max(0, (winH - 1080 * scaleF) / 2) + "px";
}
addEventListener("resize", fit);
fit();
function stagePt(e) {
  return {
    x: (e.clientX - Math.max(0, (winW - 1920 * scaleF) / 2)) / scaleF,
    y: (e.clientY - Math.max(0, (winH - 1080 * scaleF) / 2)) / scaleF
  };
}

/* ---------- fx helpers ---------- */
function floater(t, c) {
  const el = document.createElement("div");
  el.className = "floater"; el.style.color = c; el.textContent = t;
  $("floaters").appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
let toastT = null;
function toast(t) {
  const el = $("toast");
  el.textContent = t; el.classList.remove("on");
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), 2200);
}
function flash(color) {
  const el = $("flash");
  el.style.background = color;
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
}
function shake() {
  const el = $("shake");
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 850);
}
function burst(color, at) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:" + (at ? at.x : 960) + "px;top:" + (at ? at.y : 454) + "px;";
  const N = TOUCH ? 12 : 26; // fewer shards on weaker mobile GPUs
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, d = 160 + Math.random() * 320;
    const sh = document.createElement("div");
    sh.className = "shard";
    sh.style.cssText = "width:" + (14 + Math.random() * 14) + "px;height:" + (14 + Math.random() * 14) +
      "px;background:" + color + ";box-shadow:0 0 14px " + color +
      ";--dx:" + (Math.cos(a) * d) + "px;--dy:" + (Math.sin(a) * d) + "px;animation-duration:" + (0.7 + Math.random() * 0.8) + "s;";
    host.appendChild(sh);
  }
  $("particles").appendChild(host);
  setTimeout(() => host.remove(), 1600);
}
function fx(color, big, at) {
  flash(color); shake();
  if (big) burst(color, at);
}
const tierFlash = t => t === "S" ? "rgba(255,60,70,.55)" : t === "A" ? "rgba(190,80,255,.45)" : "rgba(255,255,255,.25)";

/* ---------- sound (assets shared with the roulette / team randomiser) ---------- */
const SND = {
  reelStart: "../Roulette/sounds/slots/Reel Start.wav",
  reelLoop: "../Roulette/sounds/slots/Reel Spin (Loopable).wav",
  reelStop: "../Roulette/sounds/slots/Reel Stop.wav",
  jackpot: "../Roulette/sounds/slots/Jackpot 1.wav",
  bigWin: "../Roulette/sounds/slots/Jackpot 2.wav",
  win: "../Roulette/sounds/slots/Win 1.wav"
};
/* sound settings - persisted, same behaviour as the team randomiser */
const SND_KEY = "killer-shop-sound";
let sndCfg = { muted: false, volume: .3 };
try {
  const s = JSON.parse(localStorage.getItem(SND_KEY));
  if (s) sndCfg = { muted: !!s.muted, volume: isFinite(+s.volume) ? Math.max(0, Math.min(1, +s.volume)) : .3 };
} catch (e) { /* битый localStorage - начинаем с настроек по умолчанию */ }
function sndSave() { try { localStorage.setItem(SND_KEY, JSON.stringify(sndCfg)); } catch (e) {} }

/* Every sound goes through Web Audio: on iOS an <audio> element may only
   start inside a user gesture, so sounds fired from timers (reel stops,
   wins) never played there - decoded buffers have no such limit. */
const bufCache = new Map();
function getBuf(url) {
  const c = audioCtx();
  if (!c) return Promise.resolve(null);
  if (!bufCache.has(url)) {
    bufCache.set(url, fetch(encodeURI(url))
      .then(r => r.arrayBuffer())
      .then(ab => c.decodeAudioData(ab))
      .catch(() => null));
  }
  return bufCache.get(url);
}
function play(url, vol) {
  if (sndCfg.muted) return;
  const c = audioCtx();
  if (!c) return;
  getBuf(url).then(buf => {
    if (!buf || sndCfg.muted) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol * sndCfg.volume;
    src.connect(g); g.connect(c.destination);
    src.start();
  });
}
/* The reel loop uses the Web Audio API: an <audio loop> element leaves an
   audible gap at the loop point and can't stop precisely - a buffer source
   loops sample-accurately and fades out on a ramp. */
let actx = null;
function audioCtx() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  } catch (e) { return null; }
}
let loop = null; // { src, gain, vol }
function startLoop(vol) {
  stopLoop(0);
  if (sndCfg.muted) return;
  const c = audioCtx();
  if (!c) return;
  const token = loop = { src: null, gain: null, vol };
  getBuf(SND.reelLoop).then(buf => {
    if (!buf || loop !== token) return;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const gain = c.createGain();
    gain.gain.value = vol * sndCfg.volume;
    src.connect(gain); gain.connect(c.destination);
    src.start();
    token.src = src; token.gain = gain;
  });
}
function stopLoop(fadeMs) {
  const l = loop;
  loop = null;
  if (!l || !l.src) return;
  if (fadeMs > 0 && actx) {
    const t = actx.currentTime;
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    l.src.stop(t + fadeMs / 1000 + .05);
  } else {
    try { l.src.stop(); } catch (e) {}
  }
}
function setLoopVolume() {
  if (loop && loop.gain) loop.gain.gain.value = sndCfg.muted ? 0 : loop.vol * sndCfg.volume;
}
const TIER_SFX = { 0: "../sfx/Tier0.mp3", 1: "../sfx/Tier1.wav", 2: "../sfx/Tier2.wav", 3: "../sfx/Tier3.wav" };
function sndTier(t) {
  if (TIER_SFX[t]) play(TIER_SFX[t], .7);
}
/* iOS unlocks audio only inside a user gesture: resume the context and
   pre-decode every sound on the first tap/click */
const sndUnlock = () => {
  removeEventListener("pointerdown", sndUnlock);
  if (!audioCtx()) return;
  Object.values(SND).forEach(getBuf);
  Object.values(TIER_SFX).forEach(getBuf);
};
addEventListener("pointerdown", sndUnlock);
function renderSound() {
  $("btn-sound").textContent = sndCfg.muted ? "Звук: выкл" : "Звук: вкл";
  const pct = sndCfg.muted ? 0 : Math.round(sndCfg.volume * 100); // при «выкл» показываем 0%
  $("vol-range").value = pct;
  $("vol-val").textContent = pct + "%";
}

/* ---------- header / cells ---------- */
function renderCells() {
  const w = document.querySelector(".wallet");
  const hd = S.hoverDelta;
  $("cells").textContent = hd != null ? S.cells + hd : S.cells;
  $("cells-delta").textContent = hd != null ? (hd > 0 ? "+" + hd : String(hd)) : "";
  w.classList.toggle("minus", hd != null && hd < 0);
  w.classList.toggle("plus", hd != null && hd > 0);
}
function hover(delta) {
  if (TOUCH) return; // на тачскринах "hover" залипает после нажатия - превью только для ПК
  S.hoverDelta = delta;
  renderCells();
}

/* ---------- perk markup ---------- */
function pkHTML(cls, img) {
  return '<div class="pk"><div class="pk-d ' + cls + '"></div><img class="pk-i" src="' + esc(img) + '" alt=""></div>';
}

/* ---------- reel ---------- */
const reelEl = $("reel");
const stripEls = [...reelEl.querySelectorAll(".reel-strip")];
const cellHTML = t => '<div class="reel-cell"><div class="reel-gem t' + t + '"><span>' + t + "</span></div></div>";
function setCol(i, items, y, trans) {
  if (items) stripEls[i].innerHTML = items.map(cellHTML).join("");
  stripEls[i].style.transition = trans || "none";
  stripEls[i].style.transform = "translateY(" + y + "px)";
}
function reelH() { return reelEl.clientHeight || 450; }
function idleReel() {
  const H = reelH();
  const k = Math.max(0, Math.round((H / 2 - 75) / 150));
  const y = H / 2 - (k * 150 + 75);
  for (let i = 0; i < 4; i++) {
    setCol(i, Array.from({ length: 10 }, (_, j) => STRIP[(j + i * 7) % STRIP.length]), y, "none");
  }
}
// shrink the strips back to the visible window once a spin ends - otherwise a
// multi-thousand-pixel composited layer stays resident (blank reels + memory
// pressure on iOS Safari)
function compactReel() {
  if (!S.reel) return;
  const H = reelH();
  const vis = Math.ceil(H / 300) + 2;
  S.reel.cols.forEach((c, i) => {
    const fi = c.items.length - 8;
    const from = Math.max(0, fi - vis);
    c.items = c.items.slice(from);
    c.y = c.fy = H / 2 - ((fi - from) * 150 + 75 + 2);
    setCol(i, c.items, c.y, "none");
  });
}
function pickWeighted(odds) {
  let r = Math.random() * 100;
  for (const t of ORDER) { r -= odds[t]; if (r <= 0) return t; }
  return "D";
}
function spin(btn) {
  if (S.spinning || S.pickerTier) return;
  if (S.soldTotal < CONFIG.unlockNeed) { toast("Рулетка запечатана - продайте перки"); return; }
  if (S.killerPerks.length >= 4) { toast("Все слоты убийцы заняты"); return; }
  if (S.cells < btn.cost) { toast("Недостаточно клеток"); return; }
  const win = Math.random() < btn.hit;
  const tier = win ? pickWeighted(btn.odds) : null;
  let finals;
  if (win) finals = [tier, tier, tier, tier];
  else {
    do { finals = [0,1,2,3].map(() => pickWeighted(btn.odds)); } while (finals.every(t => t === finals[0]));
  }
  const H = reelH();
  const vis = Math.ceil(H / 300) + 2;
  // seed each new strip with the currently visible items so nothing changes on screen before motion starts
  const cur = i => {
    if (S.reel) {
      const c = S.reel.cols[i];
      const fi = c.items.length - 8;
      const from = Math.max(0, fi - vis);
      const items = c.items.slice(from, fi + 3);
      return { items, y: H / 2 - ((fi - from) * 150 + 75 + 2) };
    }
    const kk = Math.max(0, Math.round((H / 2 - 75) / 150));
    return { items: Array.from({ length: 10 }, (_, k) => STRIP[(k + i * 7) % STRIP.length]), y: H / 2 - (kk * 150 + 75) };
  };
  const L = STRIP.length;
  // on a win all reels stop at the SAME strip position, so neighbors match perfectly
  const rotFor = t => { const o = []; for (let r = 0; r < L; r++) if (STRIP[(r + STOP) % L] === t) o.push(r); return rnd(o); };
  const winRot = win ? rotFor(tier) : null;
  const cols = [0,1,2,3].map(i => {
    const c = cur(i);
    const rot = win ? winRot : rotFor(finals[i]);
    const tail = Array.from({ length: STOP + 8 }, (_, k) => STRIP[(rot + k) % L]);
    const fy = H / 2 - ((c.items.length + STOP) * 150 + 75 + 2);
    return { items: c.items.concat(tail), y: c.y, fy, dur: 3.0 + i * 0.85 };
  });
  S.cells -= btn.cost; S.spinning = true; S.resultTier = null; S.missed = false; S.reel = { cols };
  floater("−" + btn.cost, "#d3222a");
  renderCells(); renderControls(); renderResult();
  play(SND.reelStart, .55);
  startLoop(.35);
  cols.forEach((c, i) => setCol(i, c.items, c.y, "none"));
  // phase 1: each column overshoots slightly past its stop, staggered durations
  setTimeout(() => cols.forEach((c, i) =>
    setCol(i, null, c.fy - 48, "transform " + c.dur + "s cubic-bezier(.08,.82,.1,1)")), 60);
  // phase 2: each column settles back with a clunk, one by one
  cols.forEach((c, i) => setTimeout(() => {
    if (!S.spinning) return;
    c.y = c.fy;
    setCol(i, null, c.fy, "transform .22s cubic-bezier(.5,1.35,.6,1)");
    play(SND.reelStop, .5);
  }, 60 + c.dur * 1000 + 320));
  setTimeout(() => {
    cols.forEach(c => { c.y = c.fy; });
    compactReel();
    stopLoop(800);
    if (!win) {
      S.spinning = false; S.missed = true;
      renderControls(); renderResult();
      toast("Мимо - линии не совпали");
      return;
    }
    S.resultTier = tier; S.spinning = false;
    renderControls(); renderResult();
    play(tier === "S" ? SND.bigWin : tier === "A" ? SND.jackpot : SND.win, .45);
    fx(tierFlash(tier), tier === "S" || tier === "A");
    setTimeout(() => openPicker(tier), 900);
  }, 6600);
}
function availablePerks(tier) {
  const owned = new Set(S.killerPerks.map(p => p.name));
  const free = D.killerPerks[tier].filter(p => !owned.has(p.name));
  return free.length ? free : D.killerPerks[tier];
}
function openPicker(tier) {
  S.pickerTier = tier;
  S.pickerChoices = sample(availablePerks(tier), PICKER_CHOICES);
  renderOverlay();
}
function choosePerk(tier, perk) {
  S.killerPerks.push({ tier, name: perk.name, img: perk.img, anim: "anim-pop" });
  S.pickerTier = null; S.pickerChoices = null; S.resultTier = null;
  fx("rgba(255,255,255,.2)", false);
  renderOverlay(); renderKiller(); renderControls(); renderResult();
}

/* ---------- result line / controls ---------- */
function renderResult() {
  const el = $("result");
  const full = S.killerPerks.length >= 4;
  el.classList.toggle("jackpot", !!S.resultTier);
  if (S.spinning) { el.textContent = "Вращение…"; el.style.color = "#8d95a1"; }
  else if (S.resultTier) { el.textContent = "Выпал тир " + S.resultTier + "!"; el.style.color = TIER_COLOR[S.resultTier]; }
  else if (S.missed) { el.textContent = "Мимо - линии не совпали"; el.style.color = "#d3222a"; }
  else if (full) { el.textContent = "Слоты заполнены"; el.style.color = "#8d95a1"; }
  else { el.textContent = "Крути барабан"; el.style.color = "#8d95a1"; }
}
function renderControls() {
  const locked = S.soldTotal < CONFIG.unlockNeed;
  const full = S.killerPerks.length >= 4;
  const lock = $("reel-lock");
  lock.classList.toggle("on", locked);
  $("lock-count").textContent = S.soldTotal + " / " + CONFIG.unlockNeed;
  $("lock-fill").style.width = Math.min(100, S.soldTotal / CONFIG.unlockNeed * 100) + "%";
  document.querySelectorAll(".roll-btn").forEach((b, i) => {
    const dis = locked || S.spinning || full || S.cells < BTNS[i].cost;
    b.classList.toggle("dis", dis);
  });
  const sc = $("sell-choice");
  sc.classList.toggle("dis", S.choiceSold);
  $("sc-label").textContent = S.choiceSold ? "Право продано" : "Продать право на выбор карты";
  $("sc-reward").textContent = S.choiceSold ? "-" : "+" + CHOICE_REWARD + " ⬧";
}
function buildStaticControls() {
  $("roll-btns").innerHTML = BTNS.map((b, i) =>
    '<button class="roll-btn" type="button" data-i="' + i + '">' +
      '<div class="rb-top"><span class="rb-name">' + b.name + '</span>' +
      '<span class="rb-cost"><img src="assets/Auric_Cell.png" alt=""><span>' + b.cost + "</span></span></div>" +
      '<div class="rb-rows">' +
        ORDER.map(t => '<div class="rb-tier t' + t + '"><b>' + t + "</b><i>" + b.odds[t] + "%</i></div>").join("") +
        '<div class="rb-tier"><b style="color:#f0d8da;text-shadow:none">Хит</b><i>' + Math.round(b.hit * 100) + "%</i></div>" +
      "</div>" +
      '<div class="rb-go">Крутить</div>' +
    "</button>").join("");
  document.querySelectorAll(".roll-btn").forEach(b => {
    const i = +b.dataset.i;
    b.addEventListener("click", () => spin(BTNS[i]));
    b.addEventListener("mouseenter", () => hover(b.classList.contains("dis") ? null : -BTNS[i].cost));
    b.addEventListener("mouseleave", () => hover(null));
  });
  $("sell-btns").innerHTML = [1, 2, 3].map(t =>
    '<button class="sell-btn st' + t + '" type="button" data-t="' + t + '"><b>Тир ' + ST_LABEL[t] + "</b><i>+" + REWARD[t] + " ⬧</i></button>").join("");
  document.querySelectorAll(".sell-btn").forEach(b => {
    const t = +b.dataset.t;
    b.addEventListener("click", () => sellPerk(t));
    b.addEventListener("mouseenter", () => hover(REWARD[t]));
    b.addEventListener("mouseleave", () => hover(null));
  });
  const sc = $("sell-choice");
  sc.addEventListener("click", sellChoice);
  sc.addEventListener("mouseenter", () => hover(S.choiceSold ? null : CHOICE_REWARD));
  sc.addEventListener("mouseleave", () => hover(null));
  $("btn-debug").addEventListener("click", () => { S.debugOpen = !S.debugOpen; renderOverlay(); });
  $("btn-sound").addEventListener("click", () => {
    sndCfg.muted = !sndCfg.muted;
    setLoopVolume();
    sndSave(); renderSound();
  });
  $("vol-range").addEventListener("input", () => {
    sndCfg.muted = false; // движение ползунка снимает выкл
    sndCfg.volume = $("vol-range").value / 100;
    setLoopVolume();
    sndSave(); renderSound();
  });
  $("vol-range").addEventListener("change", () => play(SND.reelStop, .5)); // превью новой громкости
  const lampsEl = $("lamps");
  lampsEl.innerHTML = Array.from({ length: 40 }, (_, i) =>
    '<div class="lamp ' + (i % 2 === 0 ? "red" : "yel") + '"></div>').join("");
}

/* lamp beat: fast while spinning */
let lampPhase = 0, lampLast = performance.now();
(function beat() {
  const step = S.spinning ? (TOUCH ? 220 : 110) : 650;
  const now = performance.now();
  if (now - lampLast >= step) {
    lampLast = now; lampPhase = lampPhase ? 0 : 1;
    $("lamps").classList.toggle("p0", lampPhase === 0);
    $("lamps").classList.toggle("p1", lampPhase === 1);
  }
  setTimeout(beat, 40);
})();

/* ---------- selling perks to survivors ---------- */
/* один выживший не может носить два одинаковых перка */
function survHas(si, name, skipIdx) {
  return S.survivors[si].some((p, i) => p && p.name === name && !(skipIdx && skipIdx.includes(i)));
}
/* перки с «Усталостью» не стакаются - максимум один на выжившего (и значит max 4 на доске) */
const EXHAUST = ["Balanced Landing", "Dead Hard", "Dramaturgy", "Lithe", "Overcome", "Smash Hit", "Sprint Burst", "Head On", "Background Player"];
const isExhaust = p => EXHAUST.some(n => p.img.indexOf("/" + n + ".png") !== -1);
function survHasExhaust(si, skipIdx) {
  return S.survivors[si].some((p, i) => p && isExhaust(p) && !(skipIdx && skipIdx.includes(i)));
}
function rollSurvPerk(t, si, skipIdx) {
  let pool = D.survivorPerks[t].filter(p => !survHas(si, p.name, skipIdx));
  if (survHasExhaust(si, skipIdx)) {
    const noEx = pool.filter(p => !isExhaust(p));
    if (noEx.length) pool = noEx;
  }
  if (!pool.length) return rnd(D.survivorPerks[t]);
  // раздаем тир по всей доске без повторов: дубликаты появляются только когда
  // весь пул уже в игре (тир III - всего 16 перков), и тогда идет второй круг
  const count = {};
  S.survivors.forEach(row => row.forEach(p => {
    if (p && p.t === t) count[p.name] = (count[p.name] || 0) + 1;
  }));
  const min = Math.min(...pool.map(p => count[p.name] || 0));
  return rnd(pool.filter(p => (count[p.name] || 0) === min));
}
function sellPerk(t) {
  if (S.spinning) return;
  const empties = [];
  S.survivors.forEach((row, si) => row.forEach((p, idx) => { if (!p) empties.push([si, idx]); }));
  if (!empties.length) { toast("У выживших нет места"); return; }
  const [si, idx] = rnd(empties);
  const perk = rollSurvPerk(t, si);
  S.survivors[si][idx] = { t, name: perk.name, img: perk.img, desc: perk.desc, anim: "anim-pop" };
  S.soldTotal += 1; S.cells += REWARD[t];
  sndTier(t);
  floater("+" + REWARD[t], "#ffd75e");
  renderCells(); renderControls(); renderSurvivors();
  toast(perk.name + " → " + surv(si).name);
}
function sellChoice() {
  if (S.choiceSold) { toast("Право уже продано"); return; }
  S.choiceSold = true; S.cells += CHOICE_REWARD;
  play(SND.bigWin, .45);
  floater("+" + CHOICE_REWARD, "#ffd75e");
  fx("rgba(255,215,94,.45)", true);
  renderCells(); renderControls();
  toast("Право на выбор карты продано");
}

/* ---------- survivors panel ---------- */
function renderSurvivors() {
  S.sel = null; // re-render wipes the tap-selection highlight
  $("surv-rows").innerHTML = S.survivors.map((row, si) => {
    const sv = surv(si);
    const ii = S.survItems[si];
    const it = ii != null ? D.items[ii] : null;
    const rarCls = it ? RARITY_CLS[it.rarity] : "";
    return '<div class="srow">' +
      '<div class="avatar" data-si="' + si + '" title="' + esc(sv.name) + ' - сменить выжившего"><img src="' + esc(sv.img) + '" alt=""></div>' +
      '<div class="srow-slots">' +
      row.map((p, idx) => {
        const dnd = ' data-si="' + si + '" data-idx="' + idx + '"';
        if (!p) return '<div class="slot"' + dnd + '><div class="slot-empty"></div></div>';
        const title = "Тир " + ST_LABEL[p.t] + " · " + p.name + (p.desc ? "\n\n" + p.desc : "");
        return '<div class="slot"' + dnd + '>' +
          '<div class="sperk st' + p.t + " " + (p.anim || "") + '" draggable="true" title="' + esc(title) + '"' + dnd + ">" +
            pkHTML("st" + p.t, p.img) +
            '<div class="sperk-name">' + esc(p.name) + "</div>" +
          "</div></div>";
      }).join("") +
      "</div>" +
      '<div class="srow-gear">' +
        '<div class="item-cell ' + (it ? "has " + rarCls : "") + '" data-si="' + si + '" title="' +
          (it ? esc(it.name + " (" + it.rarity + ") - нажмите, чтобы сменить") : "Купить предмет") + '">' +
          (it ? '<img src="' + esc(it.img) + '" alt="">' : "＋") + "</div>" +
        '<div class="addon-col">' +
          '<div class="addon ' + (it ? "has " + rarCls : "") + '" title="' + (it ? "Аддон" : "Пусто") + '"></div>' +
          '<div class="addon ' + (it ? "has " + rarCls : "") + '" title="' + (it ? "Аддон" : "Пусто") + '"></div>' +
        "</div>" +
      "</div>" +
    "</div>";
  }).join("");
  // spawn animations should play once, not on every re-render
  S.survivors.forEach(row => row.forEach(p => { if (p) p.anim = null; }));

  document.querySelectorAll(".srow .avatar").forEach(el =>
    el.addEventListener("click", () => { S.rosterPick = { type: "surv", row: +el.dataset.si }; renderOverlay(); }));
  document.querySelectorAll(".item-cell[data-si]").forEach(el =>
    el.addEventListener("click", () => { S.itemPick = +el.dataset.si; renderOverlay(); }));
  document.querySelectorAll(".sperk").forEach(el => {
    const si = +el.dataset.si, idx = +el.dataset.idx;
    el.addEventListener("dragstart", () => { S.drag = { si, idx }; });
    if (TOUCH) el.addEventListener("click", e => {
      e.stopPropagation();
      if (S.sel && S.sel.si === si && S.sel.idx === idx) { S.sel = null; el.classList.remove("selected"); return; }
      const clear = () => document.querySelectorAll(".sperk.selected").forEach(x => x.classList.remove("selected"));
      if (S.sel) { const s = S.sel; S.sel = null; clear(); moveSurv(s.si, s.idx, si, idx, e); return; }
      S.sel = { si, idx }; clear(); el.classList.add("selected");
    });
  });
  document.querySelectorAll(".slot").forEach(el => {
    el.addEventListener("dragover", e => {
      if (!S.drag) return;
      e.preventDefault();
      el.classList.add("dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", e => { el.classList.remove("dragover"); drop(+el.dataset.si, +el.dataset.idx, e); });
    if (TOUCH) el.addEventListener("click", () => {
      if (!S.sel) return;
      const s = S.sel; S.sel = null;
      moveSurv(s.si, s.idx, +el.dataset.si, +el.dataset.idx, null);
    });
  });
}
function drop(si, idx, e) {
  const d = S.drag;
  S.drag = null;
  if (!d) return;
  moveSurv(d.si, d.idx, si, idx, e);
}
function moveSurv(fsi, fidx, si, idx, e) {
  if (fsi === si && fidx === idx) return;
  const src = S.survivors[fsi][fidx];
  if (!src) return;
  const tgt = S.survivors[si][idx];
  if (!tgt) {
    if (fsi !== si && survHas(si, src.name)) { toast("У выжившего уже есть этот перк"); renderSurvivors(); return; }
    if (fsi !== si && isExhaust(src) && survHasExhaust(si)) { toast("«Усталость» не стакается - максимум один такой перк"); renderSurvivors(); return; }
    S.survivors[si][idx] = Object.assign({}, src, { anim: "anim-pop-fast" });
    S.survivors[fsi][fidx] = null;
    renderSurvivors();
  } else if (tgt.t === src.t && src.t < 3) {
    S.mergeAsk = { from: [fsi, fidx], to: [si, idx], t: src.t, at: e ? stagePt(e) : null };
    renderOverlay();
  } else {
    if (fsi !== si && (survHas(si, src.name, [idx]) || survHas(fsi, tgt.name, [fidx]))) {
      toast("У выжившего уже есть этот перк"); renderSurvivors(); return;
    }
    if (fsi !== si && ((isExhaust(src) && survHasExhaust(si, [idx])) || (isExhaust(tgt) && survHasExhaust(fsi, [fidx])))) {
      toast("«Усталость» не стакается - максимум один такой перк"); renderSurvivors(); return;
    }
    S.survivors[si][idx] = Object.assign({}, src, { anim: "anim-pop-fast" });
    S.survivors[fsi][fidx] = Object.assign({}, tgt, { anim: "anim-pop-fast" });
    renderSurvivors();
    if (tgt.t === src.t) toast("Тир III - только перемещение");
  }
}
function mergeDo(upgrade) {
  const m = S.mergeAsk;
  S.mergeAsk = null;
  renderOverlay();
  if (!m) return;
  const src = S.survivors[m.from[0]][m.from[1]], tgt = S.survivors[m.to[0]][m.to[1]];
  if (!src || !tgt || src.t !== tgt.t) return;
  if (upgrade) {
    const nt = src.t + 1;
    // both consumed slots don't count against the duplicate check
    const skip = m.from[0] === m.to[0] ? [m.from[1], m.to[1]] : [m.to[1]];
    const perk = rollSurvPerk(nt, m.to[0], skip);
    S.survivors[m.to[0]][m.to[1]] = { t: nt, name: perk.name, img: perk.img, desc: perk.desc, anim: "anim-merge" };
    S.survivors[m.from[0]][m.from[1]] = null;
    sndTier(nt);
    burst(ST_COLOR[nt], m.at);
    fx(nt === 3 ? "rgba(190,80,255,.45)" : "rgba(80,220,90,.35)", false);
    toast("Объединение! Тир " + ST_LABEL[nt]);
  } else {
    if (m.from[0] !== m.to[0] && (survHas(m.to[0], src.name, [m.to[1]]) || survHas(m.from[0], tgt.name, [m.from[1]]))) {
      toast("У выжившего уже есть этот перк"); return;
    }
    if (m.from[0] !== m.to[0] && ((isExhaust(src) && survHasExhaust(m.to[0], [m.to[1]])) || (isExhaust(tgt) && survHasExhaust(m.from[0], [m.from[1]])))) {
      toast("«Усталость» не стакается - максимум один такой перк"); return;
    }
    S.survivors[m.to[0]][m.to[1]] = Object.assign({}, src, { anim: "anim-pop-fast" });
    S.survivors[m.from[0]][m.from[1]] = Object.assign({}, tgt, { anim: "anim-pop-fast" });
  }
  renderSurvivors();
}

/* ---------- items ---------- */
/* каждый купленный предмет категории удваивает цену всей этой категории */
function catCount(row, cat) {
  return S.survItems.filter((v, si) => si !== row && v != null && D.items[v].cat === cat).length;
}
function itemPay(row, gi) {
  return D.items[gi].price * Math.pow(2, catCount(row, D.items[gi].cat));
}
/* не больше двух предметов одной категории на всех выживших */
const ITEM_CAT_MAX = 2;
const RARITY_SND = { "Обычный": 1, "Необычный": 1, "Редкий": 2, "Очень редкий": 3, "Ультраредкий": 3, "Событие": 1 };
function buyItem(row, gi) {
  const it = D.items[gi];
  if (S.survItems[row] === gi) { toast("Этот предмет уже в руках"); return; }
  if (catCount(row, it.cat) >= ITEM_CAT_MAX) { toast("Максимум " + ITEM_CAT_MAX + " предмета одной категории"); return; }
  const pay = itemPay(row, gi);
  S.survItems[row] = gi; S.itemPick = null; S.cells += pay;
  sndTier(RARITY_SND[it.rarity] || 1);
  floater("+" + pay, "#55d44a");
  fx("rgba(85,212,74,.25)", false);
  renderCells(); renderSurvivors(); renderOverlay();
  toast(surv(row).name + " купил(а): " + it.name);
}

/* ---------- killer panel ---------- */
function renderKiller() {
  S.ksel = null; // re-render wipes the tap-selection highlight
  const k = killer();
  $("killer-panel").innerHTML = '<div class="kp-inner">' +
    '<div class="kp-av" id="kp-av" title="' + esc(k.name) + ' - сменить убийцу"><img src="' + esc(k.img) + '" alt=""></div>' +
    '<div class="vsep"></div>' +
    [0, 1, 2, 3].map(i => {
      const p = S.killerPerks[i];
      if (!p) return '<div class="kslot" data-i="' + i + '" title="Пустой слот"><div class="kslot-empty"></div></div>';
      return '<div class="kslot" data-i="' + i + '" title="Тир ' + p.tier + " · " + esc(p.name) + '">' +
        '<div class="kperk t' + p.tier + " " + (p.anim || "") + '" draggable="true" data-i="' + i + '">' +
          pkHTML("t" + p.tier, p.img) +
          '<div class="kperk-name">' + esc(p.name) + "</div>" +
        "</div></div>";
    }).join("") +
    '<div class="vsep"></div>' +
    '<div class="kaddons">' +
    KADDONS.map((a, i) => {
      const lvl = S.kaLvl[i];
      const q = lvl ? KAQ[lvl - 1] : null;
      const next = lvl < KAQ.length ? KAQ[lvl] : null;
      return '<div class="kaddon">' +
        '<div class="kaddon-cell ' + (q ? "has " + q.cls : "") + '" data-i="' + i + '" title="' +
          (q ? esc(a.name + " (" + q.l + ") - нажмите для улучшения") : "Пустой слот аддона - нажмите, чтобы открыть") + '">' +
          "</div>" +
        '<div class="kaddon-label ' + (q ? "has " + q.cls : "") + '">' + (next ? next.cost + " ⬧" : "Макс") + "</div>" +
      "</div>";
    }).join("") +
    "</div></div>";
  // spawn animation plays once - not on every panel re-render (e.g. addon upgrades)
  S.killerPerks.forEach(p => { p.anim = null; });

  $("kp-av").addEventListener("click", () => { S.rosterPick = { type: "killer" }; renderOverlay(); });
  document.querySelectorAll(".kperk").forEach(el => {
    const i = +el.dataset.i;
    el.addEventListener("dragstart", () => { S.kdrag = i; });
    el.addEventListener("click", e => {
      if (!TOUCH) { S.confirmDel = i; renderOverlay(); return; }
      // touch: first tap selects for merging, second tap on the same perk asks to delete
      e.stopPropagation();
      const clear = () => document.querySelectorAll(".kperk.selected").forEach(x => x.classList.remove("selected"));
      if (S.ksel === i) { S.ksel = null; clear(); S.confirmDel = i; renderOverlay(); return; }
      if (S.ksel != null) { const d = S.ksel; S.ksel = null; clear(); killerMerge(d, i, e); return; }
      S.ksel = i; clear(); el.classList.add("selected");
    });
  });
  document.querySelectorAll(".kslot").forEach(el => {
    const i = +el.dataset.i;
    el.addEventListener("dragover", e => {
      if (S.kdrag == null) return;
      e.preventDefault();
      el.classList.add("dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", e => { el.classList.remove("dragover"); killerDrop(i, e); });
  });
  document.querySelectorAll(".kaddon-cell").forEach(el => {
    const i = +el.dataset.i;
    el.addEventListener("click", () => upAddon(i));
    el.addEventListener("mouseenter", () => hover(S.kaLvl[i] >= KAQ.length ? null : -KAQ[S.kaLvl[i]].cost));
    el.addEventListener("mouseleave", () => hover(null));
  });
}
function killerDrop(i, e) {
  const d = S.kdrag;
  S.kdrag = null;
  if (d == null) return;
  killerMerge(d, i, e);
}
function killerMerge(d, i, e) {
  if (d === i) return;
  const src = S.killerPerks[d], tgt = S.killerPerks[i];
  if (!src || !tgt) return;
  if (src.tier !== tgt.tier) { toast("Только два одинаковых тира"); return; }
  const oi = ORDER.indexOf(src.tier);
  if (oi === 0) { toast("Тир S нельзя объединить"); return; }
  const nt = ORDER[oi - 1];
  // consume both perks, then let the player pick the upgraded card - same picker as a roll win
  S.killerPerks.splice(Math.max(d, i), 1);
  S.killerPerks.splice(Math.min(d, i), 1);
  burst(TIER_COLOR[nt], e ? stagePt(e) : null);
  fx(tierFlash(nt), nt === "S" || nt === "A");
  toast("Объединение! Тир " + nt);
  renderKiller(); renderControls();
  openPicker(nt);
}
function removePerk(i) {
  S.killerPerks.splice(i, 1);
  renderKiller(); renderControls(); renderResult();
  toast("Перк выброшен");
}
const KAQ_SND = [1, 1, 2, 3, 3]; // звук по качеству, как у предметов: коричневый/зеленый - I, синий - II, фиолетовый+ - III
function upAddon(i) {
  const lvl = S.kaLvl[i];
  if (lvl >= KAQ.length) { toast("Максимальное качество"); return; }
  const cost = KAQ[lvl].cost;
  if (S.cells < cost) { toast("Недостаточно клеток - нужно " + cost); return; }
  S.kaLvl[i] = lvl + 1; S.cells -= cost;
  sndTier(KAQ_SND[lvl]);
  floater("−" + cost, "#d3222a");
  hover(null);
  renderCells(); renderControls(); renderKiller();
  toast(KADDONS[i].name + " - " + KAQ[lvl].l);
}

/* ---------- overlays ---------- */
function renderOverlay() {
  const ov = $("overlay");
  let html = "";
  if (S.pickerTier) html = pickerHTML();
  else if (S.confirmDel != null) html = confirmHTML();
  else if (S.mergeAsk) html = mergeHTML();
  else if (S.itemPick != null) html = itemPickHTML();
  else if (S.rosterPick) html = rosterHTML();
  else if (S.perkListOpen) html = perkListHTML();
  else if (S.debugOpen) html = debugHTML();
  ov.innerHTML = html;
  ov.classList.toggle("on", !!html);
  if (html) bindOverlay();
}
function pickerHTML() {
  const t = S.pickerTier;
  return '<div class="ov">' +
    '<div><div class="picker-tier t' + t + '">Тир ' + t + '</div><div class="picker-sub">Выберите свой перк</div></div>' +
    '<div class="picker-cards">' +
    S.pickerChoices.map((p, i) =>
      '<div class="picker-card t' + t + '" data-i="' + i + '" style="animation-delay:' + (i * .12) + 's">' +
        pkHTML("t" + t, p.img) +
        '<div class="picker-name">' + esc(p.name) + "</div>" +
        (p.desc ? '<div class="picker-desc">' + esc(p.desc) + "</div>" : "") +
      "</div>").join("") +
    "</div></div>";
}
function confirmHTML() {
  const p = S.killerPerks[S.confirmDel];
  if (!p) return "";
  return '<div class="ov"><div class="dlg red t' + p.tier + '">' +
    '<div class="dlg-title">Выбросить перк?</div>' +
    '<div class="dlg-perk">' + esc(p.name) + "</div>" +
    '<div class="dlg-row">' +
      '<button class="btn red" data-act="del-yes" type="button">Выбросить</button>' +
      '<button class="btn outline" data-act="del-no" type="button">Отмена</button>' +
    "</div></div></div>";
}
function mergeHTML() {
  return '<div class="ov"><div class="dlg">' +
    '<div class="dlg-title">Два перка тира ' + ST_LABEL[S.mergeAsk.t] + "</div>" +
    '<div class="dlg-sub">Что сделать с перками?</div>' +
    '<div class="dlg-row">' +
      '<button class="btn green" data-act="merge-up" type="button">Улучшить</button>' +
      '<button class="btn blue" data-act="merge-swap" type="button">Поменять местами</button>' +
      '<button class="btn gray" data-act="merge-cancel" type="button">Отмена</button>' +
    "</div></div></div>";
}
function itemPickHTML() {
  const cats = [];
  const byCat = {};
  D.items.forEach((it, gi) => {
    if (!byCat[it.cat]) { byCat[it.cat] = []; cats.push(it.cat); }
    byCat[it.cat].push([it, gi]);
  });
  return '<div class="ov" data-close="item">' +
    '<div><div class="ov-title">' + esc(surv(S.itemPick).name) + ' выбирает предмет</div>' +
    '<div class="ov-sub">Оплата поступает в магазин убийцы</div></div>' +
    '<div class="item-groups">' +
    cats.map(cat =>
      '<div class="item-group"><div class="item-group-title">' + esc(cat) + '</div><div class="item-cards">' +
      byCat[cat].map(([it, gi]) => {
        const owned = S.survItems[S.itemPick] === gi; // нельзя перекупить предмет, который уже в руках
        const maxed = !owned && catCount(S.itemPick, it.cat) >= ITEM_CAT_MAX;
        return '<div class="item-card ' + RARITY_CLS[it.rarity] + (maxed || owned ? " maxed" : "") + '" data-gi="' + gi + '"' +
          (owned ? ' title="Этот предмет уже в руках"' : maxed ? ' title="Максимум ' + ITEM_CAT_MAX + ' предмета одной категории"' : "") + ">" +
          '<div class="ic-img"><img src="' + esc(it.img) + '" alt=""></div>' +
          '<div class="ic-name">' + esc(it.name) + "</div>" +
          '<div class="ic-rar">' + it.rarity + "</div>" +
          '<div class="ic-price">' + (owned ? "В руках" : maxed ? "Распродано" : "+" + itemPay(S.itemPick, gi) + " ⬧") + "</div>" +
        "</div>";
      }).join("") +
      "</div></div>").join("") +
    "</div>" +
    '<div class="ov-hint">Нажмите вне карточек, чтобы закрыть</div></div>';
}
function rosterHTML() {
  const rp = S.rosterPick;
  const isK = rp.type === "killer";
  const list = isK ? D.killers : D.survivors;
  return '<div class="ov" data-close="roster">' +
    '<div class="ov-title">' + (isK ? "Выберите убийцу" : "Выберите выжившего") + "</div>" +
    '<input class="roster-search" id="roster-search" type="text" placeholder="Поиск по имени (рус / англ)" autocomplete="off" spellcheck="false">' +
    '<div class="roster-cards">' +
    list.map((c, i) => {
      let cls = "", tag = "", tagCls = "";
      if (isK) {
        if (i === S.killerSel) { cls = "cur killer"; tag = "Выбран"; tagCls = "curk"; }
      } else {
        const at = S.survSel.indexOf(i);
        if (at === rp.row) { cls = "cur"; tag = "Выбран"; tagCls = "cur"; }
        else if (at !== -1) { cls = "taken"; tag = "В игре"; }
      }
      // английское имя живёт в имени файла иконки (Dwight Fairfield.png)
      const eng = decodeURIComponent(c.img).split("/").pop().replace(/\.\w+$/, "");
      return '<div class="roster-card ' + cls + '" data-i="' + i + '" data-search="' + esc((c.name + " " + eng).toLowerCase()) + '">' +
        '<div class="roster-av"><img src="' + esc(c.img) + '" alt="" loading="lazy"></div>' +
        '<div class="roster-name">' + esc(c.name) + "</div>" +
        '<div class="roster-tag ' + tagCls + '">' + tag + "</div>" +
      "</div>";
    }).join("") +
    "</div>" +
    '<div class="ov-hint">Нажмите вне карточек, чтобы закрыть</div></div>';
}
function debugHTML() {
  return '<div class="ov" data-close="debug"><div class="debug-box" data-stop="1">' +
    '<div class="debug-head"><div class="debug-title">⚙ Отладка</div>' +
    '<button class="debug-close" data-act="debug-close" type="button">✕</button></div>' +
    '<div><div class="debug-sec">Установить баланс</div>' +
    '<div class="debug-cash">' +
    [0, 1000, 10000, 99999].map(v => '<button data-cash="' + v + '" type="button">' + v + "</button>").join("") +
    "</div></div>" +
    '<button class="debug-perks" data-act="debug-perks" type="button">Список перков</button>' +
    '<button class="debug-reset" data-act="debug-reset" type="button">Полный сброс</button>' +
  "</div></div>";
}
function perkListHTML() {
  const col = (title, tiers) =>
    '<div class="pl-col"><div class="pl-col-title">' + title + "</div>" +
    tiers.map(([label, color, pool]) =>
      '<div class="pl-tier"><div class="pl-tier-title" style="color:' + color + '">Тир ' + label +
      ' <span class="pl-count">' + pool.length + "</span></div>" +
      '<div class="pl-perks">' +
      pool.map(p => '<div class="pl-perk"><img src="' + esc(p.img) + '" alt="" loading="lazy">' + esc(p.name) + "</div>").join("") +
      "</div></div>").join("") +
    "</div>";
  return '<div class="ov" data-close="perklist">' +
    '<div class="pl-box" data-stop="1">' +
      '<div class="debug-head"><div class="debug-title">Все перки</div>' +
      '<button class="debug-close" data-act="perklist-close" type="button">✕</button></div>' +
      '<div class="pl-cols">' +
        col("Перки убийцы", ORDER.map(t => [t, TIER_COLOR[t], D.killerPerks[t]])) +
        col("Перки выживших", [0, 1, 2, 3].map(t => [ST_LABEL[t], ST_COLOR[t], D.survivorPerks[t]])) +
      "</div>" +
    "</div></div>";
}
function bindOverlay() {
  const ov = $("overlay");
  ov.querySelectorAll(".picker-card").forEach(el =>
    el.addEventListener("click", () => choosePerk(S.pickerTier, S.pickerChoices[+el.dataset.i])));
  ov.querySelectorAll("[data-act]").forEach(el => el.addEventListener("click", e => {
    e.stopPropagation();
    const act = el.dataset.act;
    if (act === "del-yes") { const i = S.confirmDel; S.confirmDel = null; renderOverlay(); if (i != null) removePerk(i); }
    else if (act === "del-no") { S.confirmDel = null; renderOverlay(); }
    else if (act === "merge-up") mergeDo(true);
    else if (act === "merge-swap") mergeDo(false);
    else if (act === "merge-cancel") { S.mergeAsk = null; renderOverlay(); }
    else if (act === "debug-close") { S.debugOpen = false; renderOverlay(); }
    else if (act === "debug-perks") { S.debugOpen = false; S.perkListOpen = true; renderOverlay(); }
    else if (act === "perklist-close") { S.perkListOpen = false; S.debugOpen = true; renderOverlay(); }
    else if (act === "debug-reset") debugReset();
  }));
  ov.querySelectorAll(".item-card").forEach(el =>
    el.addEventListener("click", e => { e.stopPropagation(); buyItem(S.itemPick, +el.dataset.gi); }));
  const rs = ov.querySelector("#roster-search");
  if (rs) {
    // фильтруем готовые карточки в DOM - перерисовка оверлея сбросила бы фокус ввода
    rs.addEventListener("input", () => {
      const q = rs.value.trim().toLowerCase();
      ov.querySelectorAll(".roster-card").forEach(el =>
        el.classList.toggle("hide", !!q && el.dataset.search.indexOf(q) === -1));
    });
    rs.addEventListener("click", e => e.stopPropagation());
    if (!TOUCH) rs.focus(); // на тачах авто-фокус выбрасывает клавиатуру поверх ростера
  }
  ov.querySelectorAll(".roster-card").forEach(el =>
    el.addEventListener("click", e => {
      e.stopPropagation();
      const i = +el.dataset.i;
      const rp = S.rosterPick;
      if (!rp) return;
      if (rp.type === "killer") { S.killerSel = i; S.rosterPick = null; renderOverlay(); renderKiller(); }
      else {
        const at = S.survSel.indexOf(i);
        if (at !== -1 && at !== rp.row) return; // taken by another row
        S.survSel[rp.row] = i; S.rosterPick = null;
        renderOverlay(); renderSurvivors();
      }
    }));
  ov.querySelectorAll("[data-cash]").forEach(el => el.addEventListener("click", e => {
    e.stopPropagation();
    S.cells = +el.dataset.cash;
    renderCells(); renderControls();
    toast("Баланс: " + S.cells);
  }));
  ov.querySelectorAll("[data-stop]").forEach(el => el.addEventListener("click", e => e.stopPropagation()));
  ov.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => {
    const w = el.dataset.close;
    if (w === "item") S.itemPick = null;
    else if (w === "roster") S.rosterPick = null;
    else if (w === "debug") S.debugOpen = false;
    else if (w === "perklist") { S.perkListOpen = false; S.debugOpen = true; }
    renderOverlay();
  }));
}
function debugReset() {
  S = initialState();
  renderCells(); renderControls(); renderResult(); renderSurvivors(); renderKiller(); renderOverlay();
  idleReel();
  toast("Полный сброс");
}

/* clear drag state + highlights however the drag ends */
document.addEventListener("dragend", () => {
  S.drag = null; S.kdrag = null;
  document.querySelectorAll(".dragover").forEach(el => el.classList.remove("dragover"));
});

/* ---------- boot ---------- */
buildStaticControls();
if (TOUCH) $("surv-hint").textContent = "Нажмите перк, затем слот - перемещение и объединение";
renderSound();
renderCells(); renderControls(); renderResult(); renderSurvivors(); renderKiller();
idleReel();
addEventListener("resize", idleReelIfIdle);
function idleReelIfIdle() { if (!S.spinning && !S.reel) idleReel(); }
})();
