// ----- config -----
// 15 вопросов: 1-5 easy, 6-10 medium, 11-15 hard. Классическая денежная лестница.
const LADDER = [
  "$100","$200","$300","$500","$1,000",
  "$2,000","$4,000","$8,000","$16,000","$32,000",
  "$64,000","$125,000","$250,000","$500,000","$1,000,000"
];
const GAME_SIZE = 15;
const DIFF_QUOTA = { easy: 5, medium: 5, hard: 5 };
const LETTERS = ["A","B","C","D"];
const SUSPENSE_MS = 5500;  // pause before the answer is revealed
const RESULT_MS = 3000;    // how long the green/red flash stays before advancing
const POLL_BIAS = 55;      // how strongly the audience leans to the correct answer, %
// autoplay pacing — игра идёт сама, без клавиши N
const REVEAL_QUESTION_MS = 2000; // пауза перед показом вопроса
const REVEAL_ANSWER_MS = 900;    // пауза между появлением ответов
const CELEBRATION_MS = 16000;    // сколько висит финальный экран миллиона до новой игры

// Вопросы лежат в questions.js (подключается перед этим скриптом).
// Порядок в игре определяется сложностью: easy -> medium -> hard.
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let usedQuestions = [];
try {
  usedQuestions = JSON.parse(localStorage.getItem('millionaireUsedQuestions')) || [];
} catch (e) {
  usedQuestions = [];
}

function getGameQuestions() {
  const allQs = window.QUESTIONS_DATA || [];
  let available = allQs.filter(q => !usedQuestions.includes(q.q));
  
  if (available.length < GAME_SIZE) {
    console.warn("Not enough new questions. Resetting used questions history.");
    usedQuestions = [];
    localStorage.removeItem('millionaireUsedQuestions');
    available = allQs;
  }

  const byDiff = { easy: [], medium: [], hard: [] };
  available.forEach(q => {
    if (byDiff[q.difficulty]) byDiff[q.difficulty].push(q);
  });

  Object.keys(byDiff).forEach(k => byDiff[k] = shuffleArray(byDiff[k]));

  let selected = [
    ...byDiff.easy.slice(0, DIFF_QUOTA.easy),
    ...byDiff.medium.slice(0, DIFF_QUOTA.medium),
    ...byDiff.hard.slice(0, DIFF_QUOTA.hard)
  ];

  if (selected.length < GAME_SIZE) {
      const left = shuffleArray(available.filter(q => !selected.includes(q)));
      selected.push(...left.slice(0, GAME_SIZE - selected.length));
  }

  return selected.sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 1) - (DIFFICULTY_ORDER[b.difficulty] ?? 1))
    .map(q => {
      let options = q.a.map((text, i) => ({ text, isCorrect: i === q.c }));
      options = shuffleArray(options);
      let newC = options.findIndex(o => o.isCorrect);
      return { ...q, a: options.map(o => o.text), c: newC };
    });
}

let QUESTIONS = getGameQuestions();

function markQuestionAsUsed(qText) {
  if (!usedQuestions.includes(qText)) {
    usedQuestions.push(qText);
    localStorage.setItem('millionaireUsedQuestions', JSON.stringify(usedQuestions));
  }
}

// ----- state -----
// phase: hidden -> revealing -> ready -> suspense -> correct | wrong
//        plus overlay states: celebration, gameover
const sfx = {
  play: new Audio("sfx/play_EWmkW31.mp3"),
  wrong: new Audio("sfx/wrong_JbK803k.mp3"),
  fail: new Audio("sfx/millionaire-fail.mp3"),
  phone: new Audio("sfx/phone_2.mp3"),
  poll: new Audio("sfx/milionerzy-glosowanie-publicznosci.mp3"),
  jackpot: new Audio("sfx/jackpot_TBfYnna.mp3")
};

const audioCache = {};
let currentCorrectTrack = null;

function getAudio(path, loop = false, isCorrectTrack = false) {
  if (!audioCache[path]) {
    const a = new Audio(path);
    a.loop = loop;
    a.volume = globalVolume;
    if (isCorrectTrack) {
      a.addEventListener('timeupdate', () => {
        if (a.duration) {
          const timeLeft = a.duration - a.currentTime;
          if (timeLeft <= 2.5 && timeLeft > 0 && !a.isFading) {
            a.isFading = true;
            fadeOut(a, timeLeft * 1000);
          }
        }
      });
    }
    audioCache[path] = a;
  }
  return audioCache[path];
}

function getDynamicBgm() {
  const lvl = state.level;
  let path;
  if (lvl <= 4) path = "sfx/$100-$1000 Questions - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 5) path = "sfx/$2,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 6) path = "sfx/$4,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 7) path = "sfx/$8,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl <= 9) path = "sfx/$32,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 10) path = "sfx/$64,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 11) path = "sfx/$125,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 12) path = "sfx/$250,000 Question - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 13) path = "sfx/$500,000 Question - Who Wants to Be a Millionaire.mp3";
  else path = "sfx/1,000,000 Question - Who Wants to Be a Millionaire.mp3";
  return getAudio(path, true, false);
}

function getDynamicSuspense() {
  const lvl = state.level;
  let path = "sfx/final_2_41YMqQj.mp3";
  if (lvl === 5) path = "sfx/$2,000 Final Answer - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 6) path = "sfx/$4,000 Final Answer - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 7) path = "sfx/$8,000 Final Answer - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 8) path = "sfx/$16,000 Final Answer - Who Wants to Be a Millionaire.mp3";
  else if (lvl >= 9) path = "sfx/$32,000 Final Answer - Who Wants to Be a Millionaire.mp3";
  return getAudio(path, true, false);
}

function getDynamicCorrect() {
  const lvl = state.level;
  let path = "sfx/correct_VsVqwRb.mp3";
  if (lvl === 4) path = "sfx/$1,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 5) path = "sfx/$2,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 6) path = "sfx/$4,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 7) path = "sfx/$8,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 8) path = "sfx/$16,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 9) path = "sfx/$32,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 10) path = "sfx/$64,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl === 11) path = "sfx/$125,000 Win - Who Wants to Be a Millionaire.mp3";
  else if (lvl >= 12) path = "sfx/$250,000 Win - Who Wants to Be a Millionaire.mp3";

  currentCorrectTrack = getAudio(path, false, true);
  return currentCorrectTrack;
}

let globalVolume = 0.25;

function setVolume(vol) {
  globalVolume = vol;
  Object.values(sfx).forEach(audio => { audio.volume = globalVolume; });
  Object.values(audioCache).forEach(audio => { audio.volume = globalVolume; });
  if (phoneAudio) phoneAudio.volume = globalVolume;
  const slider = document.getElementById("volume-slider");
  if (slider && parseFloat(slider.value) !== vol) slider.value = vol;
}

let currentBgm = null;
function playBgm(track) {
  if (currentBgm === track) return;
  if (currentBgm) {
    fadeOut(currentBgm, 1500);
  }
  currentBgm = track;
  if (currentBgm) {
    if (currentBgm.fadeInterval) clearInterval(currentBgm.fadeInterval);
    currentBgm.volume = globalVolume;
    currentBgm.currentTime = 0;
    currentBgm.play().catch(()=>{});
  }
}

function fadeOut(audio, durationMs) {
  if (!audio || audio.paused) return;
  if (audio.fadeInterval) clearInterval(audio.fadeInterval);
  
  const steps = 20;
  const stepTime = durationMs / steps;
  let currentVol = audio.volume;
  const volStep = currentVol / steps;

  audio.fadeInterval = setInterval(() => {
    if (audio.paused) {
      clearInterval(audio.fadeInterval);
      return;
    }
    currentVol -= volStep;
    if (currentVol <= 0) {
      currentVol = 0;
      clearInterval(audio.fadeInterval);
      audio.pause();
      audio.currentTime = 0;
    }
    audio.volume = Math.max(0, currentVol);
  }, stepTime);
}

function playSfx(track) {
  if (track.fadeInterval) clearInterval(track.fadeInterval);
  track.isFading = false;
  track.volume = globalVolume;
  track.currentTime = 0;
  track.play().catch(()=>{});
}

const state = {
  level: 0,
  phase: "hidden",
  revealedCount: 0,
  picked: -1,
  killed: [false, false, false, false],
  used5050: false,
  usedPhone: false,
  usedPoll: false,
};

let phoneTimer = null;
let resultTimer = null;
let phoneAudio = null;

// ----- elements -----
const el = {
  qNumber: document.getElementById("q-number"),
  qPrize: document.getElementById("q-prize"),
  question: document.getElementById("question"),
  answers: document.getElementById("answers"),
  ladder: document.getElementById("ladder"),
  lifelines: document.querySelector(".lifelines"),
  ll5050: document.getElementById("ll-5050"),
  llPhone: document.getElementById("ll-phone"),
  llPoll: document.getElementById("ll-poll"),
  lifelineView: document.getElementById("lifeline-view"),
  pollView: document.getElementById("poll-view"),
  pollBars: document.getElementById("poll-bars"),
  phoneView: document.getElementById("phone-view"),
  phoneSeconds: document.getElementById("phone-seconds"),
  celebration: document.getElementById("celebration"),
  confetti: document.getElementById("confetti"),
  celTitle: document.getElementById("cel-title"),
  celSum: document.getElementById("cel-sum"),
  celSub: document.getElementById("cel-sub"),
  celBtn: document.getElementById("cel-btn"),
  gameover: document.getElementById("gameover"),
  goTitle: document.getElementById("go-title"),
  goCorrectText: document.getElementById("go-correct-text"),
  goCorrect: document.getElementById("go-correct-answer"),
  goSum: document.getElementById("go-sum"),
  goSub: document.getElementById("go-sub"),
  goBtn: document.getElementById("go-btn"),
  volumeSlider: document.getElementById("volume-slider"),
  btnRestartGame: document.getElementById("btn-restart-game"),
  btnStats: document.getElementById("btn-stats"),
  statsPanel: document.getElementById("stats-panel"),
  statsBody: document.getElementById("stats-body"),
  gameControls: document.querySelector(".game-controls"),
  btnToggleControls: document.getElementById("btn-toggle-controls"),
  restartConfirm: document.getElementById("restart-confirm"),
  btnRestartYes: document.getElementById("btn-restart-yes"),
  btnRestartNo: document.getElementById("btn-restart-no"),
  btnResetHistory: document.getElementById("btn-reset-history"),
  resetConfirm: document.getElementById("reset-confirm"),
  btnResetYes: document.getElementById("btn-reset-yes"),
  btnResetNo: document.getElementById("btn-reset-no"),
  startScreen: document.getElementById("start-screen"),
  startBtn: document.getElementById("start-btn"),
};

const answerEls = [];

function cur() { return QUESTIONS[state.level]; }

// ----- build static DOM -----
function buildAnswers() {
  el.answers.innerHTML = "";
  LETTERS.forEach((letter, i) => {
    const div = document.createElement("div");
    div.className = "answer";
    div.innerHTML = `<span class="letter">${letter}:</span><span class="text"></span>`;
    div.addEventListener("click", () => pick(i));
    el.answers.appendChild(div);
    answerEls.push(div);
  });
}

function buildLadder() {
  el.ladder.innerHTML = "";
  LADDER.forEach((amount, i) => {
    const row = document.createElement("div");
    row.className = "ladder-row";
    row.innerHTML =
      `<span class="num">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="amount">${amount}</span>`;
    el.ladder.appendChild(row);
  });
}

// ----- stats: сколько вопросов осталось и какой сложности -----
const DIFF_LABELS = { easy: "Лёгкие", medium: "Средние", hard: "Сложные" };

function answeredCount() {
  return state.level + (state.phase === "correct" ? 1 : 0);
}

function updateStatsPanel() {
  const allQs = window.QUESTIONS_DATA || [];
  const availableQs = allQs.filter(q => !usedQuestions.includes(q.q));
  
  const counts = { easy: 0, medium: 0, hard: 0 };
  availableQs.forEach(q => { if (counts[q.difficulty] !== undefined) counts[q.difficulty]++; });

  const answered = answeredCount();
  const dlcLine = answered >= 15 ? "Миллион взят!" : `До $1,000,000: ${15 - answered}`;

  el.btnStats.textContent = `ВОПРОСОВ: ${availableQs.length}`;
  el.statsBody.innerHTML =
    `<div class="stats-row"><span>Осталось в базе:</span><b>${availableQs.length}</b></div>` +
    ["easy", "medium", "hard"].map(d =>
      `<div class="stats-row diff-${d}"><span>${DIFF_LABELS[d]}:</span><b>${counts[d]}</b></div>`
    ).join("") +
    `<div class="stats-dlc">${dlcLine}</div>`;
}

// ----- rendering -----
function render() {
  const q = cur();
  el.qNumber.textContent = "ВОПРОС " + (state.level + 1);
  el.qPrize.textContent = LADDER[state.level];

  if (state.phase === "hidden") {
    el.question.innerHTML = '<span class="dots">···</span>';
  } else if (!el.question.querySelector(".q-text")) {
    el.question.innerHTML = `<span class="q-text">${q.q}</span>`;
    markQuestionAsUsed(q.q);
  }

  answerEls.forEach((div, i) => {
    div.querySelector(".text").textContent = q.a[i];
    div.className = "answer";
    if (i < state.revealedCount) div.classList.add("revealed");
    if (state.killed[i]) div.classList.add("killed");
    const isPicked = state.picked === i;
    if (isPicked && (state.phase === "ready" || state.phase === "revealing")) div.classList.add("picked");
    if (isPicked && state.phase === "suspense") div.classList.add("picked", "suspense");
    if ((state.phase === "correct" || state.phase === "wrong") && i === q.c) div.classList.add("correct");
    if (state.phase === "wrong" && isPicked && i !== q.c) div.classList.add("wrong");
  });

  [...el.ladder.children].forEach((row, i) => {
    row.classList.toggle("current", i === state.level);
    row.classList.toggle("passed", i < state.level);
  });

  document.body.classList.toggle("show-ladder", state.phase === "correct");
  document.body.classList.toggle("show-lifelines", state.phase === "ready");
  el.ll5050.classList.toggle("used", state.used5050);
  el.llPhone.classList.toggle("used", state.usedPhone);
  el.llPoll.classList.toggle("used", state.usedPoll);

  updateStatsPanel();
}

// ----- flow: autoplay — вопрос и ответы открываются сами, по таймерам -----
let autoTimer = null;

function scheduleAuto(fn, ms) {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(fn, ms);
}

function autoReveal() {
  if (state.phase === "hidden") {
    state.phase = "revealing";
    if (!currentBgm || currentBgm.paused) playBgm(getDynamicBgm());
    render();
    scheduleAuto(autoReveal, REVEAL_ANSWER_MS);
  } else if (state.phase === "revealing") {
    state.revealedCount++;
    if (state.revealedCount >= 4) state.phase = "ready";
    render();
    if (state.phase === "revealing") scheduleAuto(autoReveal, REVEAL_ANSWER_MS);
  }
}

function beginQuestion() {
  scheduleAuto(autoReveal, REVEAL_QUESTION_MS);
}

function revealResult() {
  hideLifelineView();
  const correct = state.picked === -1 || state.picked === cur().c;

  const showResult = () => {
    state.phase = correct ? "correct" : "wrong";
    playBgm(null);
    playSfx(correct ? getDynamicCorrect() : sfx.wrong);
    render();
    resultTimer = setTimeout(() => {
      resultTimer = null;
      if (!correct) return showGameOver();
      if (state.level === QUESTIONS.length - 1) showCelebration();
      else nextQuestion();
    }, RESULT_MS);
  };

  if (state.picked === -1) {
    // host just reveals the correct answer — no drama needed
    showResult();
  } else {
    state.phase = "suspense";
    playBgm(getDynamicSuspense());
    render();
    resultTimer = setTimeout(showResult, SUSPENSE_MS);
  }
}

function nextQuestion() {
  if (state.level >= QUESTIONS.length - 1) return restart();
  state.level++;
  if (currentCorrectTrack) fadeOut(currentCorrectTrack, 2000);
  resetQuestionState();
  playBgm(getDynamicBgm());
  render();
  beginQuestion();
}

function resetQuestionState() {
  clearTimeout(autoTimer);
  autoTimer = null;
  state.phase = "hidden";
  state.revealedCount = 0;
  state.picked = -1;
  state.killed = [false, false, false, false];
  hideLifelineView();
}

function restart() {
  clearTimeout(resultTimer);
  resultTimer = null;
  clearInterval(phoneTimer);
  if (phoneAudio) { phoneAudio.pause(); phoneAudio.currentTime = 0; }
  playBgm(null);

  QUESTIONS = getGameQuestions();

  state.level = 0;
  state.used5050 = false;
  state.usedPhone = false;
  state.usedPoll = false;
  resetQuestionState();

  el.gameover.classList.add("hidden");
  el.celebration.classList.add("hidden");
  el.restartConfirm.classList.add("hidden");
  el.confetti.innerHTML = "";

  playSfx(sfx.play);
  render();
  beginQuestion();
}

// ----- picking -----
// клик по ответу сразу принимает его как финальный — дальше саспенс и результат
function pick(i) {
  if (state.phase !== "ready") return;
  if (state.killed[i]) return;
  state.picked = i;
  revealResult();
}

// ----- overlays -----
// финальный экран победы — единственная «остановка»: несгораемых сумм нет
function showCelebration() {
  playBgm(null);
  playSfx(sfx.jackpot);
  el.celTitle.textContent = "ГЛАВНЫЙ ПРИЗ!";
  el.celSub.textContent = "Все 15 вопросов пройдены — миллион долларов!";
  el.celBtn.textContent = "НОВАЯ ИГРА";
  el.celSum.textContent = LADDER[state.level];
  spawnConfetti();
  el.celebration.classList.remove("hidden");
  scheduleAuto(continueGame, CELEBRATION_MS);
}

function continueGame() {
  clearTimeout(autoTimer);
  autoTimer = null;
  el.celebration.classList.add("hidden");
  el.confetti.innerHTML = "";
  restart();
}


function showGameOver() {
  playBgm(null);
  playSfx(sfx.fail);
  const q = cur();
  
  // выигрыш = сумма последнего взятого вопроса
  const prize = state.level > 0 ? LADDER[state.level - 1] : "$0";

  el.goTitle.textContent = "ИГРА ОКОНЧЕНА";
  el.goTitle.style.color = "";
  el.goCorrectText.innerHTML = `Правильный ответ: <b id="go-correct-answer">${LETTERS[q.c] + ": " + q.a[q.c]}</b>`;
  el.goSum.textContent = prize;
  el.goSub.textContent = "ваш выигрыш";
  
  el.gameover.classList.remove("hidden");
}

function spawnConfetti() {
  el.confetti.innerHTML = "";
  const colors = ["#ffd166", "#8a97ff", "#7ee08a", "#ff8ad0"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = (i * 1.66) + "%";
    p.style.width = (8 + (i % 3) * 4) + "px";
    p.style.height = (12 + (i % 4) * 4) + "px";
    p.style.background = colors[i % 4];
    p.style.animationDuration = (2.6 + (i % 5) * 0.7) + "s";
    p.style.animationDelay = ((i % 10) * 0.28) + "s";
    el.confetti.appendChild(p);
  }
}

// ----- lifelines (mouse only) -----
function lifelinesAvailable() {
  return state.phase === "ready";
}

function hideLifelineView() {
  clearInterval(phoneTimer);
  if (phoneAudio) {
    phoneAudio.pause();
    phoneAudio.currentTime = 0;
  }
  if (currentBgm === sfx.phone || currentBgm === sfx.poll) {
    playBgm(getDynamicBgm());
  }
  el.lifelineView.classList.add("hidden");
  setTimeout(() => {
    if (el.lifelineView.classList.contains("hidden")) {
      el.pollView.classList.add("hidden");
      el.phoneView.classList.add("hidden");
    }
  }, 500);
}

function use5050() {
  if (state.used5050 || !lifelinesAvailable()) return;
  const wrong = shuffleArray([0, 1, 2, 3].filter(i => i !== cur().c));
  state.killed[wrong[0]] = true;
  state.killed[wrong[1]] = true;
  if (state.killed[state.picked]) state.picked = -1;
  state.used5050 = true;
  render();
}

function usePhone() {
  if (state.usedPhone || !lifelinesAvailable()) return;
  state.usedPhone = true;
  hideLifelineView();
  el.lifelineView.classList.remove("hidden");
  el.phoneView.classList.remove("hidden");
  
  playBgm(sfx.phone);

  const r = Math.random();
  let audioFile = "";
  if (r < 0.6) {
    audioFile = "answer" + LETTERS[cur().c] + ".mp3";
  } else if (r < 0.9) {
    const wrongIndices = [0, 1, 2, 3].filter(i => i !== cur().c && !state.killed[i]);
    const randomWrongIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
    audioFile = "answer" + LETTERS[randomWrongIndex] + ".mp3";
  } else {
    audioFile = "noAnswer.mp3";
  }
  
  const avatarMap = {
    "noAnswer.mp3": "BubbaTalking.png",
    "answerA.mp3": "SableTalking.png",
    "answerB.mp3": "SenobiteTalking.png",
    "answerC.mp3": "WeskerTalking.png",
    "answerD.mp3": "ChuckyTalking.png"
  };
  
  el.phoneSeconds.innerHTML = `
    <div style="width: min(280px, 55vw); aspect-ratio: 1; border-radius: 32px; overflow: hidden; margin: 0 auto; box-shadow: 0 8px 30px rgba(0,0,0,0.6); background: rgba(0,0,0,0.3); border: 3px solid #4d5bd4;">
      <img src="avatars/${avatarMap[audioFile]}" style="width: 100%; height: 100%; object-fit: cover; object-position: center 15%; transform: scale(1.8); transform-origin: center 15%; display: block;">
    </div>`;
  el.phoneSeconds.classList.remove("low");
  
  if (phoneAudio) { phoneAudio.pause(); phoneAudio.currentTime = 0; }
  phoneAudio = new Audio("callAFriend/" + audioFile);
  phoneAudio.volume = globalVolume;
  phoneAudio.play().catch(()=>{});
  
  phoneAudio.addEventListener('ended', () => {
    hideLifelineView();
  });
  
  render();
}

function usePoll() {
  if (state.usedPoll || !lifelinesAvailable()) return;
  state.usedPoll = true;
  hideLifelineView();
  playBgm(sfx.poll);

  const c = cur().c;
  let rest = 100;
  const base = Math.min(95, Math.max(5, POLL_BIAS - 10 + Math.floor(Math.random() * 20)));
  const vals = [0, 0, 0, 0];
  vals[c] = base;
  rest -= base;
  const others = [0, 1, 2, 3].filter(i => i !== c && !state.killed[i]);
  others.forEach((i, idx) => {
    if (idx === others.length - 1) vals[i] = rest;
    else { const v = Math.floor(Math.random() * rest); vals[i] = v; rest -= v; }
  });

  el.pollBars.innerHTML = "";
  LETTERS.forEach((letter, i) => {
    const col = document.createElement("div");
    col.className = "poll-col";
    col.innerHTML =
      `<div class="poll-pct">${vals[i]}%</div>` +
      `<div class="poll-bar" style="height:8px"></div>` +
      `<div class="poll-letter">${letter}</div>`;
    el.pollBars.appendChild(col);
    // let the transition animate the bars up (2px per percent, panel is 220px tall)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      col.querySelector(".poll-bar").style.height = Math.max(8, vals[i] * 2) + "px";
    }));
  });

  el.lifelineView.classList.remove("hidden");
  el.pollView.classList.remove("hidden");
  render();
}

// ----- input -----
el.ll5050.addEventListener("click", use5050);
el.llPhone.addEventListener("click", usePhone);
el.llPoll.addEventListener("click", usePoll);
el.celBtn.addEventListener("click", continueGame);
el.goBtn.addEventListener("click", restart);

el.btnStats.addEventListener("click", () => {
  el.statsPanel.classList.toggle("hidden");
  updateStatsPanel();
});

el.btnToggleControls.addEventListener("click", () => {
  const collapsed = el.gameControls.classList.toggle("collapsed");
  el.btnToggleControls.title = collapsed ? "Показать панель" : "Скрыть панель";
  if (collapsed) el.statsPanel.classList.add("hidden");
});

el.volumeSlider.addEventListener("input", (e) => {
  setVolume(parseFloat(e.target.value));
});
setVolume(0.25);

el.btnRestartGame.addEventListener("click", () => {
  el.restartConfirm.classList.remove("hidden");
});
el.btnRestartNo.addEventListener("click", () => {
  el.restartConfirm.classList.add("hidden");
});
el.btnRestartYes.addEventListener("click", () => {
  el.restartConfirm.classList.add("hidden");
  restart();
});

el.btnResetHistory.addEventListener("click", () => {
  el.resetConfirm.classList.remove("hidden");
});

el.btnResetNo.addEventListener("click", () => {
  el.resetConfirm.classList.add("hidden");
});

el.btnResetYes.addEventListener("click", () => {
  el.resetConfirm.classList.add("hidden");
  localStorage.removeItem('millionaireUsedQuestions');
  usedQuestions = [];
  restart(); // новая игра на полной базе вопросов
});

// ----- init -----
// реальная высота видимой области: vh/dvh во встроенных браузерах (Telegram и т.п.)
// включают зону за панелями, из-за чего низ сцены обрезался
function setAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-h", h + "px");
}
setAppHeight();
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);
if (window.visualViewport) window.visualViewport.addEventListener("resize", setAppHeight);

buildAnswers();
buildLadder();
// на телефонах панель управления занимает пол-экрана — сворачиваем до шестерёнки
if (window.innerWidth <= 640) {
  el.gameControls.classList.add("collapsed");
  el.btnToggleControls.title = "Показать панель";
}
render();
// игра начинается по кнопке СТАРТ: первый клик разрешает браузеру играть звук
el.startBtn.addEventListener("click", () => {
  el.startScreen.classList.add("hidden");
  playSfx(sfx.play);
  beginQuestion();
});
