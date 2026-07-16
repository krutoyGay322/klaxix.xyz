// Game logic: every action that mutates state or fires an effect. App.game.
window.App = window.App || {};
(function (App) {

  const store = App.store, S = App.store.state, sfx = App.sfx;
  const PROPS = App.PROPS, TIER = App.TIER, RARITY = App.RARITY, ITEMS = App.ITEMS;
  const ALL_PERKS = App.ALL_PERKS, KILLER_PERKS = App.KILLER_PERKS;
  const el = id => document.getElementById(id);

  // ---- pools & pure helpers ----
  const survPool  = tier => ALL_PERKS.filter(p => p.tier === tier).map(p => p.name);
  const killerPool = tier => KILLER_PERKS.filter(p => p.tier === tier).map(p => p.name);

  function getPerkSrc(name) {
    let p = ALL_PERKS.find(x => x.name === name);
    if (!p) p = KILLER_PERKS.find(x => x.name === name);
    return p ? p.src : '';
  }
  const randTier = () => { const r = Math.random(); return r < 0.6 ? 1 : r < 0.9 ? 2 : 3; };
  const allPerks = () => S.survivors.flatMap(s => s.perks);

  function pickFrom(tier, exclude) {
    const ex = new Set(exclude);
    let p = survPool(tier).filter(n => !ex.has(n));
    if (!p.length) p = survPool(tier);
    return { name: p[Math.floor(Math.random() * p.length)], tier };
  }
  function pickKillerFrom(tier, exclude) {
    const ex = new Set(exclude);
    let p = killerPool(tier).filter(n => !ex.has(n));
    if (!p.length) p = killerPool(tier);
    return { name: p[Math.floor(Math.random() * p.length)], tier };
  }

  // Build-dependent perks the killer can't be offered on the current roll.
  const TURN_BACK = 'ПЕРЕВЕСТИ ЧАСЫ НАЗАД', POP_WEASEL = 'ЧЕРТИК ИЗ ТАБАКЕРКИ';
  const THRILL = 'ПОРЧА: ОХОТНИЧИЙ АЗАРТ';
  function killerRollExclusions() {
    const have = new Set(S.killerPerks.map(p => p.name));
    const ex = [];
    // Turn Back the Clock and Pop Goes the Weasel can't both be in the build.
    if (have.has(TURN_BACK)) ex.push(POP_WEASEL);
    if (have.has(POP_WEASEL)) ex.push(TURN_BACK);
    // Thrill of the Hunt only unlocks once another Порча (Hex) is in the build.
    const hasOtherHex = S.killerPerks.some(p => p.name !== THRILL && p.name.startsWith('ПОРЧА:'));
    if (!hasOtherHex) ex.push(THRILL);
    return ex;
  }

  // A fresh idle reel of killer perks that excludes everything already owned, so
  // the roulette never displays a perk the killer holds (killers can't duplicate).
  // Used to replace the spun reel after a killer win — the just-won card would
  // otherwise sit in the roulette as an "already owned" perk.
  function killerIdleReel(owned) {
    const ex = new Set(owned);
    const pool = KILLER_PERKS.filter(p => !ex.has(p.name));
    if (!pool.length) return [];
    const reel = [];
    for (let i = 0; i < 40; i++) {
      let c, tries = 0;
      do { c = pool[Math.floor(Math.random() * pool.length)]; }
      while (++tries < 25 && reel[i - 1] && c.name === reel[i - 1].name);
      reel.push({ name: c.name, tier: c.tier });
    }
    return reel;
  }

  // Roll a rarity by weight, then a random item of that rarity.
  function randItem() {
    const r = Math.random();
    let acc = 0, rarity = 'Обычный';
    for (const name in RARITY) { acc += RARITY[name].weight; if (r <= acc) { rarity = name; break; } }
    const poolI = ITEMS.filter(it => it.rarity === rarity);
    const it = poolI[Math.floor(Math.random() * poolI.length)];
    return { name: it.name, rarity: it.rarity, img: it.img, isItem: true };
  }

  // Shrine price: perks by tier, items by rarity (premium over the 100 roll).
  const ITEM_PRICE = { 'Обычный': 150, 'Необычный': 200, 'Редкий': 250, 'Очень редкий': 300 };
  const shrinePrice = p => p.isItem ? (ITEM_PRICE[p.rarity] || 150) : TIER[p.tier].shrinePrice;

  function genShrine() {
    const used = [], a = [];
    // 0-2 of the 8 slots hold items, the rest are perks.
    const itemCount = Math.floor(Math.random() * 3);
    const itemSlots = new Set();
    while (itemSlots.size < itemCount) itemSlots.add(Math.floor(Math.random() * 8));
    const usedItems = [];
    for (let i = 0; i < 8; i++) {
      if (itemSlots.has(i)) {
        let it, tries = 0;
        do { it = randItem(); } while (usedItems.includes(it.name) && ++tries < 25);
        usedItems.push(it.name);
        a.push({ ...it, bought: false });
      } else {
        const t = randTier();
        const p = pickFrom(t, used);
        used.push(p.name);
        a.push({ name: p.name, tier: t, bought: false });
      }
    }
    return a;
  }
  const freePerkIdx = () => S.survivors.findIndex(s => s.perks.length < 4);
  const freeItemIdx = () => S.survivors.findIndex(s => !s.item);

  const T = {}; // transient timers

  // ---- feedback / FX ----
  function showToast(msg) {
    clearTimeout(T.toast);
    store.setState({ toastMsg: msg });
    T.toast = setTimeout(() => store.setState({ toastMsg: null }), 2200);
  }
  function pulseCoins(delta) {
    clearTimeout(T.coin); clearTimeout(T.coin2);
    if (delta > 0) sfx.coin();
    store.setState({ coinFxOn: false, coinFloat: null }, () => {
      requestAnimationFrame(() => store.setState({
        coinFxOn: true,
        coinFloat: (delta > 0 ? '+' : '−') + Math.abs(delta),
        coinFloatColor: delta > 0 ? '#eecf7a' : '#e0796d'
      }));
    });
    T.coin = setTimeout(() => store.setState({ coinFxOn: false }), 800);
    T.coin2 = setTimeout(() => store.setState({ coinFloat: null }), 1450);
  }
  function triggerKillerFx(fx) {
    clearTimeout(T.kfx); clearTimeout(T.shk);
    store.setState({ killerFx: null, shaking: false }, () => {
      requestAnimationFrame(() => store.setState({ killerFx: fx, shaking: true, redFlashOn: true }));
    });
    T.shk = setTimeout(() => store.setState({ shaking: false }), 650);
    T.kfx = setTimeout(() => store.setState({ killerFx: null, redFlashOn: false }), 2100);
  }
  // Anchor the tooltip to the hovered element (centred above it) — anchoring to
  // the mouse-entry point put it in arbitrary spots depending on approach angle.
  function showTip(target, text) {
    const fr = el('frame');
    if (!fr || !text || !target.getBoundingClientRect) return;
    const r = fr.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const sc = S.scale || 1;
    store.setState({ tip: { text, x: (b.left + b.width / 2 - r.left) / sc, y: (b.top - r.top) / sc } });
  }
  const hideTip = () => { if (S.tip) store.setState({ tip: null }); };

  // ---- reel spin ----
  function startTickLoop() {
    cancelAnimationFrame(T.tickRaf);
    T.tickIdx = null;
    const loop = () => {
      if (!S.spinning) return;
      const inner = el('reel-inner'), cont = el('reel');
      if (inner && cont) {
        try {
          const m = new DOMMatrixReadOnly(getComputedStyle(inner).transform);
          const idx = Math.floor((-m.m41 + cont.offsetWidth / 2) / 300);
          if (idx !== T.tickIdx) {
            T.tickIdx = idx;
            sfx.tick();
            const mk = el('marker');
            if (mk && mk.animate) mk.animate(
              [{ opacity: 1, boxShadow: '0 0 30px #ff6a5e' }, { opacity: .7, boxShadow: '0 0 18px #d8433a' }],
              { duration: 90 }
            );
          }
        } catch (e) {}
      }
      T.tickRaf = requestAnimationFrame(loop);
    };
    T.tickRaf = requestAnimationFrame(loop);
  }
  function spinReel(winner, reel, onLand) {
    const WIN = 34, ITEM = 300;
    clearTimeout(T.start); clearTimeout(T.spin); clearTimeout(T.win); clearTimeout(T.win2); clearTimeout(T.kreel);
    store.setState({ reel, spinning: true, offset: 0, transition: 'none', winOverlay: null, winClosing: false }, () => {
      store.save();
      T.start = setTimeout(() => {
        const w = (el('reel') && el('reel').offsetWidth) || 1300;
        const jitter = (Math.random() * 0.7 - 0.35) * ITEM;
        const target = WIN * ITEM + ITEM / 2 - w / 2 + jitter;
        store.setState({ offset: target, transition: 'transform 5.5s cubic-bezier(0.1, 0.85, 0.15, 1)' });
        startTickLoop();
      }, 60);
      T.spin = setTimeout(() => { cancelAnimationFrame(T.tickRaf); sfx.land(); onLand(); }, 5600);
    });
  }

  // ---- purchases ----
  function buy(kind) {
    store.pushHistory();
    if (S.spinning) return;
    const cost = kind === 'r' ? PROPS.randomCost : TIER[kind].cost;
    if (S.balance < cost) { showToast('Недостаточно Золотых клеток'); return; }
    if (freePerkIdx() < 0) { showToast('Все слоты перков заняты (4 × 4)'); return; }
    sfx.unlockAudio();
    const tier = kind === 'r' ? randTier() : kind;
    const winner = pickFrom(tier, allPerks().map(p => p.name));
    const N = 40, WIN = 34, reel = [];
    for (let i = 0; i < N; i++) {
      if (i === WIN) { reel.push(winner); continue; }
      // never let two identical cards sit next to each other (incl. around the winner)
      let c, tries = 0;
      do { c = pickFrom(kind === 'r' ? randTier() : tier, []); }
      while (++tries < 25 && ((reel[i - 1] && c.name === reel[i - 1].name) || (i === WIN - 1 && c.name === winner.name)));
      reel.push(c);
    }
    store.setState({ balance: S.balance - cost });
    pulseCoins(-cost);
    spinReel(winner, reel, () => {
      const idx = freePerkIdx();
      if (idx < 0) { store.set({ spinning: false }); return; }
      const survivors = S.survivors.map((s, j) => j === idx ? { ...s, perks: [...s.perks, winner] } : s);
      store.set({ spinning: false, survivors, winOverlay: { ...winner, owner: survivors[idx].name } });
      T.win = setTimeout(() => store.setState({ winClosing: true }), 1900);
      T.win2 = setTimeout(() => store.setState({ winOverlay: null, winClosing: false }), 2320);
    });
  }

  function buyItem() {
    if (S.spinning) return;
    const cost = PROPS.itemCost;
    if (S.balance < cost) { showToast('Недостаточно Золотых клеток'); return; }
    if (freeItemIdx() < 0) { showToast('У всех выживших уже есть предмет'); return; }
    sfx.unlockAudio();
    const winner = randItem();
    const N = 40, WIN = 34, reel = [];
    for (let i = 0; i < N; i++) {
      if (i === WIN) { reel.push(winner); continue; }
      let c, tries = 0;
      do { c = randItem(); }
      while (++tries < 25 && ((reel[i - 1] && c.name === reel[i - 1].name) || (i === WIN - 1 && c.name === winner.name)));
      reel.push(c);
    }
    store.setState({ balance: S.balance - cost });
    pulseCoins(-cost);
    spinReel(winner, reel, () => {
      const idx = freeItemIdx();
      if (idx < 0) { store.set({ spinning: false }); return; }
      const survivors = S.survivors.map((s, j) => j === idx ? { ...s, item: winner } : s);
      store.set({ spinning: false, survivors, winOverlay: { ...winner, owner: survivors[idx].name } });
      T.win = setTimeout(() => store.setState({ winClosing: true }), 1900);
      T.win2 = setTimeout(() => store.setState({ winOverlay: null, winClosing: false }), 2320);
    });
  }

  // ---- killer ----
  function give(tier) {
    store.pushHistory();
    if (S.spinning) return;
    if (S.killerPerks.length >= 4) { showToast('У убийцы уже 4 перка'); return; }
    sfx.unlockAudio();
    // Roll the killer perk on the same reel the survivors use. The killer can't
    // hold duplicates, so perks already in the build are excluded from the WHOLE
    // reel (winner + filler) — never shown, never landed — along with the
    // build-dependent barred perks (mutually-exclusive pair, Hex-gated Thrill).
    const barred = killerRollExclusions();
    const exclude = S.killerPerks.map(p => p.name).concat(barred);
    const winner = pickKillerFrom(tier, exclude);
    const N = 40, WIN = 34, reel = [];
    for (let i = 0; i < N; i++) {
      if (i === WIN) { reel.push(winner); continue; }
      // never let two identical cards sit next to each other (incl. around the winner)
      let c, tries = 0;
      do { c = pickKillerFrom(tier, exclude); }
      while (++tries < 25 && ((reel[i - 1] && c.name === reel[i - 1].name) || (i === WIN - 1 && c.name === winner.name)));
      reel.push(c);
    }
    spinReel(winner, reel, () => {
      if (S.killerPerks.length >= 4) { store.set({ spinning: false }); return; }
      const t = TIER[tier];
      sfx.boom();
      const killerPerks = [...S.killerPerks, winner];
      store.set({ spinning: false, killerPerks, balance: S.balance + t.payout });
      pulseCoins(t.payout);
      triggerKillerFx({ title: 'УБИЙЦА УСИЛЕН', name: winner.name + ' · тир ' + t.roman, pay: '+' + t.payout,
        c1: t.c1, c2: t.c2, img: getPerkSrc(winner.name), glyph: '', rot: 'rotate(45deg)', unrot: 'rotate(-45deg)', rad: '0px' });
      // Once the slam overlay covers the reel, swap the just-won (now owned) card
      // out so the idle roulette never shows a perk the killer already holds.
      clearTimeout(T.kreel);
      T.kreel = setTimeout(() => store.setState({
        reel: killerIdleReel(killerPerks.map(p => p.name)), offset: 0, transition: 'none'
      }), 400);
    });
  }
  function giveAddons() {
    store.pushHistory();
    if (S.addons.length >= 2) return;
    const pay = PROPS.addonsPayout;
    sfx.unlockAudio(); sfx.boom();
    const addon = { name: 'Аддон III · ' + String(Math.floor(Math.random() * 15) + 1).padStart(2, '0'), tier: 3 };
    store.set({ addons: [...S.addons, addon], balance: S.balance + pay });
    pulseCoins(pay);
    const t = TIER[3];
    triggerKillerFx({ title: 'АДДОН ОТКРЫТ', name: addon.name, pay: '+' + pay,
      c1: t.c1, c2: t.c2, img: '', glyph: '', rot: 'none', unrot: 'none', rad: '16px' });
  }
  function tradeMap() {
    if (S.mapTraded) return;
    store.pushHistory();
    const pay = PROPS.mapPayout;
    sfx.unlockAudio(); sfx.boom();
    store.set({ mapTraded: true, balance: S.balance + pay });
    pulseCoins(pay);
    triggerKillerFx({ title: 'КАРТА ПРОДАНА', name: 'Убийца выбирает карту', pay: '+' + pay,
      c1: '#c07a72', c2: '#5c2a2a', img: 'assets/mapRights.png', glyph: '', rot: 'none', unrot: 'none', rad: '16px' });
  }
  function setKillerIcon(i) { store.setState({ killerIconPick: false }); store.set({ killerIcon: i }); }

  // ---- shrine ----
  function refreshShrine() {
    store.pushHistory();
    if (S.spinning || S.shrineAnim) return;
    const cost = S.shrineRefreshed ? PROPS.shrineRefreshCost : 0; // first refresh is free
    if (S.balance < cost) { showToast('Недостаточно Золотых клеток'); return; }
    sfx.unlockAudio(); sfx.whoosh();
    if (cost > 0) pulseCoins(-cost);
    store.setState({ shrineAnim: 'cover', balance: S.balance - cost, shrineRefreshed: true });
    clearTimeout(T.shr); clearTimeout(T.shr2);
    T.shr = setTimeout(() => { store.set({ shrine: genShrine() }); store.setState({ shrineAnim: 'reveal' }); sfx.land(); }, 560);
    T.shr2 = setTimeout(() => store.setState({ shrineAnim: null }), 1140);
  }
  function buyShrine(i) {
    store.pushHistory();
    const p = S.shrine[i];
    if (!p || p.bought || S.spinning) return;
    const price = shrinePrice(p);
    if (S.balance < price) { showToast('Недостаточно Золотых клеток'); return; }
    let survivors;
    if (p.isItem) {
      const svIdx = freeItemIdx();
      if (svIdx < 0) { showToast('У всех выживших уже есть предмет'); return; }
      const item = { name: p.name, rarity: p.rarity, img: p.img, isItem: true };
      survivors = S.survivors.map((s, j) => j === svIdx ? { ...s, item } : s);
    } else {
      const svIdx = freePerkIdx();
      if (svIdx < 0) { showToast('Все слоты перков заняты (4 × 4)'); return; }
      const perk = { name: p.name, tier: p.tier };
      survivors = S.survivors.map((s, j) => j === svIdx ? { ...s, perks: [...s.perks, perk] } : s);
    }
    sfx.land();
    pulseCoins(-price);
    const shrine = S.shrine.map((s, j) => j === i ? { ...s, bought: true } : s);
    store.setState({ shrine, balance: S.balance - price, survivors, purchaseIdx: i }, () => store.save());
    clearTimeout(T.pur);
    T.pur = setTimeout(() => store.setState({ purchaseIdx: null }), 900);
  }

  // ---- survivors: move / drag / delete / icon ----
  function moveTo(targetIdx) {
    const sel = S.moveSel;
    if (!sel) return;
    let survivors = S.survivors;
    if (sel.kind === 'perk') {
      const perk = survivors[sel.from].perks[sel.slot];
      if (!perk || survivors[targetIdx].perks.length >= 4) { store.setState({ moveSel: null }); return; }
      survivors = survivors.map((s, j) => {
        if (j === sel.from) return { ...s, perks: s.perks.filter((_, k) => k !== sel.slot) };
        if (j === targetIdx) return { ...s, perks: [...s.perks, perk] };
        return s;
      });
    } else {
      const item = survivors[sel.from].item;
      if (!item || survivors[targetIdx].item) { store.setState({ moveSel: null }); return; }
      survivors = survivors.map((s, j) => {
        if (j === sel.from) return { ...s, item: null };
        if (j === targetIdx) return { ...s, item };
        return s;
      });
    }
    store.set({ survivors, moveSel: null });
  }
  function swapPerk(from, fromSlot, to, toSlot) {
    const svs = [...S.survivors];
    if (from === to) {
      const sv = { ...svs[from], perks: [...svs[from].perks] };
      const tmp = sv.perks[fromSlot]; sv.perks[fromSlot] = sv.perks[toSlot]; sv.perks[toSlot] = tmp;
      sv.perks = sv.perks.filter(Boolean);
      svs[from] = sv;
    } else {
      const fromSv = { ...svs[from], perks: [...svs[from].perks] };
      const toSv = { ...svs[to], perks: [...svs[to].perks] };
      const p1 = fromSv.perks[fromSlot], p2 = toSv.perks[toSlot];
      fromSv.perks[fromSlot] = p2; toSv.perks[toSlot] = p1;
      fromSv.perks = fromSv.perks.filter(Boolean); toSv.perks = toSv.perks.filter(Boolean);
      svs[from] = fromSv; svs[to] = toSv;
    }
    store.set({ survivors: svs });
  }
  function swapItem(from, to) {
    const svs = [...S.survivors];
    const fromSv = { ...svs[from] }, toSv = { ...svs[to] };
    const tmp = fromSv.item; fromSv.item = toSv.item; toSv.item = tmp;
    svs[from] = fromSv; svs[to] = toSv;
    store.set({ survivors: svs });
  }
  function pickSurvivorIcon(k) {
    const survivors = S.survivors.map((sv, j) => j === S.iconPick ? { ...sv, icon: k } : sv);
    store.set({ survivors, iconPick: null });
  }
  function confirmDelete() {
    store.pushHistory();
    const p = S.popup;
    if (!p || p.type !== 'delete_perk') return;
    const svs = [...S.survivors];
    const sv = { ...svs[p.svIndex] };
    if (p.isItem) sv.item = null;
    else sv.perks = sv.perks.filter((_, idx) => idx !== p.perkSlot);
    svs[p.svIndex] = sv;
    store.set({ survivors: svs, popup: null });
  }

  // ---- debug menu ----
  function applyCurrency() {
    const val = parseInt(S.currencyInput, 10);
    if (!isNaN(val)) store.set({ balance: val, popup: null });
    else store.setState({ popup: null });
  }
  function reset() {
    if (!confirm('Полный сброс магазина? Баланс, перки, предметы и Храм Тайн будут обнулены.')) return;
    store.clearSaved();
    store.set({
      balance: PROPS.startBalance, survivors: store.freshSurvivors(), killerPerks: [], addons: [],
      addonsGiven: false, mapTraded: false, shrine: genShrine(), shrineRefreshed: false, reel: [], spinning: false,
      offset: 0, transition: 'none', winOverlay: null, winClosing: false, moveSel: null, iconPick: null, popup: null
    });
  }

  App.game = {
    getPerkSrc, allPerks, genShrine, shrinePrice,
    buy, buyItem, give, giveAddons, tradeMap, setKillerIcon,
    refreshShrine, buyShrine, moveTo, swapPerk, swapItem, pickSurvivorIcon,
    confirmDelete, applyCurrency, reset, showTip, hideTip,
    undo: () => store.undo(),
    PERK_DESC: App.PERK_DESC, KILLER_ICONS: App.KILLER_ICONS
  };

})(window.App);
