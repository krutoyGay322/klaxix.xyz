// Central state store: holds app state, merges updates synchronously, notifies
// the renderer, and handles localStorage persistence + undo history. App.store.
window.App = window.App || {};
(function (App) {

  const PROPS = App.PROPS, ALL_PERKS = App.ALL_PERKS, STORAGE_KEY = App.STORAGE_KEY;

  function freshSurvivors() {
    return [0, 1, 2, 3].map(i => ({ name: 'Выживший ' + (i + 1), icon: i, perks: [], item: null }));
  }
  function initialReel() {
    return Array(40).fill(0).map((_, i) => ({
      name: ALL_PERKS[i % ALL_PERKS.length].name,
      tier: (i % 3) + 1
    }));
  }

  const state = {
    scale: 1,
    mobile: false,
    teamName: 'ЛАВКА КАПИТАНА',
    balance: PROPS.startBalance,
    survivors: freshSurvivors(),
    killerIcon: 0,
    killerPerks: [],
    addons: [],
    addonsGiven: false,
    mapTraded: false,
    shrine: [],
    shrineRefreshed: false,
    walletPreview: null,
    reel: initialReel(),
    spinning: false,
    offset: 0,
    transition: 'none',
    winOverlay: null,
    winClosing: false,
    toastMsg: null,
    moveSel: null,
    iconPick: null,
    killerIconPick: false,
    killerFx: null,
    shrineAnim: null,
    purchaseIdx: null,
    coinFxOn: false,
    coinFloat: null,
    coinFloatColor: '#eecf7a',
    redFlashOn: false,
    shaking: false,
    tip: null,
    popup: null,
    currencyInput: '',
    history: []
  };

  let notify = () => {};

  // Bumped when the economy is rebalanced: saves from an older economy keep
  // their perks/items but have their balance reset to the new startBalance.
  const ECO_VERSION = 3;

  function save() {
    const { teamName, balance, survivors, killerIcon, killerPerks, addons, addonsGiven, mapTraded, shrine, shrineRefreshed } = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(
        { eco: ECO_VERSION, teamName, balance, survivors, killerIcon, killerPerks, addons, addonsGiven, mapTraded, shrine, shrineRefreshed }
      ));
    } catch (e) {}
  }

  App.store = {
    state,
    freshSurvivors,
    onChange(fn) { notify = fn; },
    setState(patch, cb) { Object.assign(state, patch); if (cb) cb(); notify(); },
    set(patch, cb) { this.setState(patch, () => { save(); if (cb) cb(); }); },
    save,

    load() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
      // Migrate perk names saved before they were corrected against the JSON catalogues.
      const RENAMED = {
        'Злодейство': 'Дерзость', 'Бдительность': 'Бессонница',
        'Поспешное лечение': 'Поправка', 'Форсаж': 'Выше головы', 'На волю': 'Форсаж',
        'Командная работа: Собраться с силами': 'Командная работа: Скромная победа',
        'Усердие': 'Выдержка',
        'ГОРЬКИЙ ШЕПОТ': 'ТИХИЙ ШОРОХ', 'ЗОВ МОРЯ': 'СОЛЕНОЕ МОРЕ',
        'УДАР МИЛОСЕРДИЯ': 'ДОБИВАНИЕ', 'ГОРДЫНЯ': 'СВИРЕПАЯ ГОРДЫНЯ'
      };
      const REMOVED = new Set(['Дерзость', 'Чары: Пауки-прядильщики']); // perks cut from the pool entirely
      const fix = p => (p && RENAMED[p.name]) ? { ...p, name: RENAMED[p.name] } : p;
      const keep = p => !(p && REMOVED.has(p.name));
      if (s) {
        if (Array.isArray(s.survivors)) s.survivors = s.survivors.map(sv => sv ? { ...sv, perks: (sv.perks || []).map(fix).filter(keep) } : sv);
        if (Array.isArray(s.killerPerks)) s.killerPerks = s.killerPerks.map(fix);
        if (Array.isArray(s.shrine)) s.shrine = s.shrine.map(fix).filter(keep);
      }
      if (s && Array.isArray(s.shrine) && s.shrine.length && Array.isArray(s.survivors)) {
        Object.assign(state, {
          teamName: s.teamName || 'ЛАВКА КАПИТАНА',
          balance: (s.eco === ECO_VERSION && typeof s.balance === 'number') ? s.balance : PROPS.startBalance,
          survivors: s.survivors,
          killerIcon: s.killerIcon || 0,
          killerPerks: s.killerPerks || [],
          addons: s.addons || [],
          addonsGiven: !!s.addonsGiven,
          mapTraded: !!s.mapTraded,
          shrine: s.shrine,
          shrineRefreshed: !!s.shrineRefreshed
        });
        return true;
      }
      return false;
    },

    clearSaved() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} },

    pushHistory() {
      const { balance, survivors, killerPerks, addons, addonsGiven, mapTraded, shrine, shrineRefreshed } = state;
      const snap = JSON.parse(JSON.stringify({ balance, survivors, killerPerks, addons, addonsGiven, mapTraded, shrine, shrineRefreshed }));
      state.history = [...state.history, snap];
    },

    undo() {
      if (!state.history.length) return;
      const h = [...state.history];
      const snap = h.pop();
      this.setState(Object.assign({}, snap, { history: h, popup: null }), () => save());
    }
  };

})(window.App);
