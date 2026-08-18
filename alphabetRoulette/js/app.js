// Алфавитная рулетка навыков: каждому игроку выпадают буквы, а с ними — все
// навыки на эту букву. Данные и качество навыков — в perks.js (см. шапку файла).
(function () {
  "use strict";

  var D = window.ALPHABET_DATA;
  var MIN_PERKS = clampInt(new URLSearchParams(location.search).get("min"), 1, 10, 4);
  var MAX_LETTERS = 5;
  var PICK_COUNT = 4; // сколько навыков игрок оставляет себе после рандома
  var PERK_ICON_BASE = "../Roulette/"; // пути иконок в perks.js заданы от Roulette/

  // Префиксы не учитываются при определении буквы навыка
  var RU_PREFIX = /^(ПОРЧА: |СЕКУЩИЙ КРЮК: |Командная работа: |Чары: |Чары «|Дар: )/;
  var EN_PREFIX = /^(Hex: |Scourge Hook: |Boon: |Invocation: |Teamwork: )/;

  var players = [];
  var rolling = false;
  var usedLetters = {}; // общие буквы на языке+роли, чтобы игроки не дублировались

  function clampInt(v, min, max, dflt) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  function firstLetter(name, lang) {
    var stripped = name.replace(lang === "ru" ? RU_PREFIX : EN_PREFIX, "");
    stripped = stripped.replace(/^[«»"'\s]+/, ""); // кавычки не считаются буквой
    return stripped.charAt(0).toUpperCase();
  }

  function poolFor(p) {
    var list = p.role === "k" ? D.killerPerks : D.survivorPerks;
    var letters = {};
    list.forEach(function (perk) {
      var L = firstLetter(p.lang === "ru" ? perk.ru : perk.en, p.lang);
      (letters[L] = letters[L] || []).push(perk);
    });
    return letters;
  }

  /* ---------- звук ---------- */
  // Настройки звука — как в магазине убийцы: кнопка вкл/выкл + громкость,
  // сохраняются в localStorage
  var SND_KEY = "alphabet-roulette-sound";
  var sndCfg = { muted: false, volume: .3 };
  try {
    var saved = JSON.parse(localStorage.getItem(SND_KEY));
    if (saved) sndCfg = { muted: !!saved.muted, volume: isFinite(+saved.volume) ? Math.max(0, Math.min(1, +saved.volume)) : .3 };
  } catch (e) { /* битый localStorage — начинаем с настроек по умолчанию */ }
  function sndSave() { try { localStorage.setItem(SND_KEY, JSON.stringify(sndCfg)); } catch (e) {} }
  function renderSound() {
    document.getElementById("btn-sound").textContent = sndCfg.muted ? "Звук: выкл" : "Звук: вкл";
    var pct = sndCfg.muted ? 0 : Math.round(sndCfg.volume * 100); // при «выкл» показываем 0%
    document.getElementById("vol-range").value = pct;
    document.getElementById("vol-val").textContent = pct + "%";
  }
  function bindSound() {
    document.getElementById("btn-sound").addEventListener("click", function () {
      sndCfg.muted = !sndCfg.muted;
      sndSave(); renderSound();
    });
    document.getElementById("vol-range").addEventListener("input", function () {
      sndCfg.muted = false; // движение ползунка снимает выкл
      sndCfg.volume = this.value / 100;
      sndSave(); renderSound();
    });
    // превью новой громкости
    document.getElementById("vol-range").addEventListener("change", function () { audio("land"); });
    renderSound();
  }

  var ac = null;
  function audio(type) {
    if (sndCfg.muted || sndCfg.volume <= 0) return;
    // базовые уровни подобраны под громкость 30%
    var vol = sndCfg.volume / .3;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      if (type === "tick") {
        o.type = "square";
        o.frequency.value = 700 + Math.random() * 300;
        g.gain.setValueAtTime(.025 * vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .05);
        o.start(); o.stop(ac.currentTime + .05);
      } else {
        o.type = "triangle";
        o.frequency.setValueAtTime(440, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(880, ac.currentTime + .18);
        g.gain.setValueAtTime(.12 * vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .45);
        o.start(); o.stop(ac.currentTime + .45);
      }
    } catch (e) { /* без звука */ }
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  // Ромб перка в стиле магазина убийцы: цветной ромб качества + иконка сверху
  function pkNode(qCls, iconPath) {
    var pk = el("div", "pk");
    var d = el("div", "pk-d " + qCls);
    var img = document.createElement("img");
    img.className = "pk-i";
    img.src = iconPath;
    img.alt = "";
    img.loading = "lazy";
    pk.appendChild(d);
    pk.appendChild(img);
    return pk;
  }

  /* ---------- разметка панелей ---------- */
  function buildPanel(p) {
    var panel = el("div", "panel" + (p.role === "k" ? " killer" : ""));

    var head = el("div", "head");
    p.$avatar = el("div", "avatar");
    p.$avatar.title = "Выбрать персонажа";
    p.$portrait = document.createElement("img");
    p.$portrait.alt = "";
    p.$avatar.appendChild(p.$portrait);
    p.$avatar.addEventListener("click", function () { openRoster(p); });

    var who = el("div", "who");
    p.$charName = el("div", "char-name");
    var role = el("div", "role-label");
    role.textContent = p.label;
    who.appendChild(p.$charName);
    who.appendChild(role);
    head.appendChild(p.$avatar);
    head.appendChild(who);

    var langRow = el("div", "lang-row");
    p.$en = el("button", "lang-btn");
    p.$en.type = "button"; p.$en.textContent = "EN";
    p.$ru = el("button", "lang-btn");
    p.$ru.type = "button"; p.$ru.textContent = "РУ";
    p.$en.addEventListener("click", function () { setLang(p, "en"); });
    p.$ru.addEventListener("click", function () { setLang(p, "ru"); });
    langRow.appendChild(p.$en);
    langRow.appendChild(p.$ru);

    p.$window = el("div", "window");
    p.$status = el("div", "status");
    p.$perks = el("div", "perk-list");

    panel.appendChild(head);
    panel.appendChild(langRow);
    panel.appendChild(p.$window);
    panel.appendChild(p.$status);
    panel.appendChild(p.$perks);
    return panel;
  }

  /* ---------- выбор персонажа (ростер как в магазине убийцы) ---------- */
  function chars(p) { return p.role === "k" ? D.killers : D.survivors; }

  function takenBy(p, idx) {
    return players.some(function (o) {
      return o !== p && o.role === p.role && o.charIdx === idx;
    });
  }

  function openRoster(p) {
    if (rolling || document.querySelector(".ov")) return;
    var list = chars(p);

    var ov = el("div", "ov");
    var title = el("div", "ov-title");
    title.textContent = p.role === "k" ? "Выберите убийцу" : "Выберите выжившего";

    var search = document.createElement("input");
    search.className = "roster-search";
    search.type = "text";
    search.placeholder = "Поиск по имени (рус / англ)";
    search.autocomplete = "off";
    search.spellcheck = false;

    var cardsBox = el("div", "roster-cards");
    list.forEach(function (c, i) {
      var cls = "roster-card";
      var tag = "", tagCls = "";
      if (i === p.charIdx) { cls += p.role === "k" ? " cur killer" : " cur"; tag = "Выбран"; tagCls = p.role === "k" ? "curk" : "cur"; }
      else if (p.role === "s" && takenBy(p, i)) { cls += " taken"; tag = "В игре"; }
      var card = el("div", cls);
      card.dataset.search = (c.ru + " " + c.en).toLowerCase();

      var av = el("div", "roster-av");
      var img = document.createElement("img");
      img.src = c.icon;
      img.alt = "";
      img.loading = "lazy";
      av.appendChild(img);

      var nm = el("div", "roster-name");
      nm.textContent = p.lang === "ru" ? c.ru : c.en;
      var tg = el("div", "roster-tag" + (tagCls ? " " + tagCls : ""));
      tg.textContent = tag;

      card.appendChild(av);
      card.appendChild(nm);
      card.appendChild(tg);
      if (!card.classList.contains("taken")) {
        card.addEventListener("click", function () {
          p.charIdx = i;
          renderHead(p);
          close();
        });
      }
      cardsBox.appendChild(card);
    });

    var hint = el("div", "ov-hint");
    hint.textContent = "Нажмите вне карточек, чтобы закрыть";

    ov.appendChild(title);
    ov.appendChild(search);
    ov.appendChild(cardsBox);
    ov.appendChild(hint);
    document.body.appendChild(ov);
    search.focus();

    function close() {
      ov.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (e) {
      if (!e.target.closest(".roster-card") && !e.target.closest(".roster-search")) close();
    });
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      cardsBox.querySelectorAll(".roster-card").forEach(function (card) {
        card.classList.toggle("hide", q !== "" && card.dataset.search.indexOf(q) < 0);
      });
    });
  }

  /* ---------- список перков по буквам ---------- */
  var plLang = "ru";

  function groupByLetter(list, lang) {
    var map = {};
    list.forEach(function (perk) {
      var L = firstLetter(lang === "ru" ? perk.ru : perk.en, lang);
      (map[L] = map[L] || []).push(perk);
    });
    var letters = Object.keys(map).sort(function (a, b) { return a.localeCompare(b, lang); });
    letters.forEach(function (L) {
      map[L].sort(function (a, b) {
        var na = lang === "ru" ? a.ru : a.en, nb = lang === "ru" ? b.ru : b.en;
        return na.localeCompare(nb, lang);
      });
    });
    return letters.map(function (L) { return [L, map[L]]; });
  }

  function plColumn(title, colCls, list) {
    var col = el("div", "pl-col " + colCls);
    var titleEl = el("div", "pl-col-title");
    titleEl.textContent = title;
    col.appendChild(titleEl);
    groupByLetter(list, plLang).forEach(function (g) {
      var box = el("div", "pl-group");
      var letter = el("div", "pl-letter");
      letter.textContent = g[0] + " ";
      var count = el("span", "pl-count");
      count.textContent = g[1].length;
      letter.appendChild(count);
      box.appendChild(letter);
      var grid = el("div", "pl-perks");
      g[1].forEach(function (perk) {
        var row = el("div", "pl-perk q" + perk.q);
        var img = document.createElement("img");
        img.src = PERK_ICON_BASE + perk.icon;
        img.alt = "";
        img.loading = "lazy";
        row.appendChild(img);
        row.appendChild(document.createTextNode(plLang === "ru" ? perk.ru : perk.en));
        row.title = plLang === "ru" ? perk.en : perk.ru;
        grid.appendChild(row);
      });
      box.appendChild(grid);
      col.appendChild(box);
    });
    return col;
  }

  function openPerkList() {
    if (document.querySelector(".ov")) return;

    var ov = el("div", "ov");
    var box = el("div", "pl-box");
    box.addEventListener("click", function (e) { e.stopPropagation(); });

    var head = el("div", "pl-head");
    var title = el("div", "pl-title");
    title.textContent = "Все перки по буквам";
    var langs = el("div", "pl-langs");
    var bEn = el("button", "lang-btn");
    bEn.type = "button"; bEn.textContent = "EN";
    var bRu = el("button", "lang-btn");
    bRu.type = "button"; bRu.textContent = "РУ";
    langs.appendChild(bEn);
    langs.appendChild(bRu);
    var closeBtn = el("button", "pl-close");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    head.appendChild(title);
    head.appendChild(langs);
    head.appendChild(closeBtn);

    var cols = el("div", "pl-cols");
    function renderCols() {
      bEn.classList.toggle("active", plLang === "en");
      bRu.classList.toggle("active", plLang === "ru");
      cols.innerHTML = "";
      cols.appendChild(plColumn("Перки убийцы", "killer", D.killerPerks));
      cols.appendChild(plColumn("Перки выживших", "surv", D.survivorPerks));
    }
    bEn.addEventListener("click", function () { if (plLang !== "en") { plLang = "en"; renderCols(); } });
    bRu.addEventListener("click", function () { if (plLang !== "ru") { plLang = "ru"; renderCols(); } });
    renderCols();

    box.appendChild(head);
    box.appendChild(cols);
    ov.appendChild(box);
    document.body.appendChild(ov);

    function close() {
      ov.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    closeBtn.addEventListener("click", close);
    ov.addEventListener("click", close);
  }

  /* ---------- отрисовка ---------- */
  function renderHead(p) {
    var c = chars(p)[p.charIdx % chars(p).length];
    p.$charName.textContent = p.lang === "ru" ? c.ru : c.en;
    p.$portrait.src = c.icon;
    p.$en.classList.toggle("active", p.lang === "en");
    p.$ru.classList.toggle("active", p.lang === "ru");
  }

  function renderTiles(p) {
    p.$window.querySelectorAll(".tile").forEach(function (n) { n.remove(); });
    p.tiles.forEach(function (t) {
      var tile = el("div", "tile " + t.mode);
      var span = document.createElement("span");
      span.textContent = t.ch;
      tile.appendChild(span);
      p.$window.appendChild(tile);
    });
  }

  // Добавляет пачку навыков за только что выпавшую букву — сразу, не дожидаясь
  // остальных букв
  function appendPerks(p, batch) {
    batch.forEach(function (perk, i) {
      var row = el("div", "perk q" + perk.q);
      row.style.animationDelay = (i * 70) + "ms";
      row.title = p.lang === "ru" ? perk.en : perk.ru;
      row.appendChild(pkNode("q" + perk.q, PERK_ICON_BASE + perk.icon));
      var txt = el("div", "txt");
      var name = el("div", "name");
      var sub = el("div", "sub");
      name.textContent = p.lang === "ru" ? perk.ru : perk.en;
      sub.textContent = p.lang === "ru" ? perk.en : perk.ru;
      txt.appendChild(name);
      txt.appendChild(sub);
      row.appendChild(txt);
      row.addEventListener("click", function () { togglePerk(p, row); });
      p.$perks.appendChild(row);
    });
  }

  /* ---------- выбор 4 навыков после рандома ---------- */
  function updatePick(p) {
    p.$perks.classList.toggle("pickable", p.pickable && !p.locked);
    p.$perks.querySelectorAll(".perk").forEach(function (row) {
      var sel = p.sel.has(row);
      row.classList.toggle("sel", sel);
      row.classList.toggle("off", p.locked && !sel); // лишние прячем после выбора
    });
    if (!p.pickable) return;
    if (p.locked) setStatus(p, "навыки выбраны");
    else setStatus(p, "выберите навыки: " + p.sel.size + "/" + PICK_COUNT);
  }

  function togglePerk(p, row) {
    if (!p.pickable) return;
    if (p.locked) {
      // снятие галочки с выбранного перка возвращает весь список
      if (p.sel.has(row)) {
        p.sel.delete(row);
        p.locked = false;
        audio("tick");
        updatePick(p);
      }
      return;
    }
    if (p.sel.has(row)) {
      p.sel.delete(row);
      audio("tick");
    } else {
      if (p.sel.size >= PICK_COUNT) return;
      p.sel.add(row);
      audio(p.sel.size === PICK_COUNT ? "land" : "tick");
      if (p.sel.size === PICK_COUNT) p.locked = true;
    }
    updatePick(p);
  }

  function finishPick(p) {
    p.pickable = true;
    if (p.perks.length <= PICK_COUNT) {
      // выпало ровно столько (или меньше) — забираем все автоматически
      p.$perks.querySelectorAll(".perk").forEach(function (row) { p.sel.add(row); });
      p.locked = true;
    }
    updatePick(p);
  }

  function setStatus(p, text) { p.$status.textContent = text; }

  function resetPlayer(p) {
    p.tiles = [{ ch: "?", mode: "idle" }];
    p.perks = [];
    p.sel = new Set();
    p.pickable = false;
    p.locked = false;
    renderTiles(p);
    p.$perks.innerHTML = "";
    p.$perks.classList.remove("pickable");
    setStatus(p, "");
  }

  function setLang(p, lang) {
    if (rolling || p.lang === lang) return;
    p.lang = lang;
    resetPlayer(p);
    renderHead(p);
  }

  function makeSparks(p) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      var sp = el("div", "spark");
      sp.style.setProperty("--dx", Math.cos(a) * d + "px");
      sp.style.setProperty("--dy", Math.sin(a) * d + "px");
      p.$window.appendChild(sp);
      setTimeout(function (n) { n.remove(); }, 750, sp);
    }
    p.$window.classList.remove("shake");
    void p.$window.offsetWidth; // перезапуск анимации
    p.$window.classList.add("shake");
    setTimeout(function () { p.$window.classList.remove("shake"); }, 500);
  }

  /* ---------- вращение ---------- */
  async function spinTile(p, slot, keys, duration) {
    var elapsed = 0;
    while (elapsed < duration) {
      var t = elapsed / duration;
      var step = 50 + 170 * t * t;
      p.tiles[slot] = { ch: keys[Math.floor(Math.random() * keys.length)], mode: "spin" };
      renderTiles(p);
      audio("tick");
      await sleep(step);
      elapsed += step;
    }
  }

  async function spinPlayer(p) {
    var pool = poolFor(p);
    var keys = Object.keys(pool);
    var used = usedLetters[p.lang + p.role] = usedLetters[p.lang + p.role] || new Set();
    var chosen = [];
    p.tiles = [];

    while (p.perks.length < MIN_PERKS && chosen.length < MAX_LETTERS) {
      p.tiles.push({ ch: "?", mode: "spin" });
      renderTiles(p);
      setStatus(p, chosen.length ? "мало навыков — ещё буква!" : "крутим…");
      await spinTile(p, p.tiles.length - 1, keys, chosen.length ? 1400 : 2000 + Math.random() * 600);

      var avail = keys.filter(function (k) { return chosen.indexOf(k) < 0 && !used.has(k); });
      if (!avail.length) avail = keys.filter(function (k) { return chosen.indexOf(k) < 0; });
      var L = avail[Math.floor(Math.random() * avail.length)];
      chosen.push(L);
      used.add(L);

      p.tiles[p.tiles.length - 1] = { ch: L, mode: "land" };
      renderTiles(p);
      audio("land");
      makeSparks(p);

      // навыки за эту букву показываем сразу же
      var batch = pool[L];
      p.perks = p.perks.concat(batch);
      appendPerks(p, batch);
      setStatus(p, "навыков: " + p.perks.length);
      await sleep(500);
    }
    finishPick(p);
  }

  async function roll() {
    if (rolling) return;
    rolling = true;
    usedLetters = {};
    var btn = document.getElementById("rollBtn");
    btn.disabled = true;
    btn.textContent = "· · ·";
    players.forEach(resetPlayer);
    await sleep(30);
    for (var i = 0; i < players.length; i++) await spinPlayer(players[i]);
    rolling = false;
    btn.disabled = false;
    btn.textContent = "Крутить";
  }

  /* ---------- запуск ---------- */
  function init() {
    var grid = document.getElementById("grid");
    for (var i = 0; i < 4; i++) {
      players.push({ role: "s", label: "Выживший " + (i + 1), lang: "ru", charIdx: i });
    }
    players.push({ role: "k", label: "Убийца", lang: "ru", charIdx: 0 });
    players.forEach(function (p, i) {
      var panel = buildPanel(p);
      panel.style.animationDelay = (i * 60) + "ms";
      grid.appendChild(panel);
      resetPlayer(p);
      renderHead(p);
    });
    document.getElementById("rollBtn").addEventListener("click", roll);
    document.getElementById("btn-perklist").addEventListener("click", openPerkList);
    bindSound();
  }

  init();
})();
