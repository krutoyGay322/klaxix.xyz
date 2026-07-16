// Event delegation: one set of listeners on the root translates DOM events into
// game actions via data-act / data-ctx / data-in / data-drag / data-drop /
// data-tip. Exposes App.bindEvents(root).
window.App = window.App || {};
(function (App) {

  const game = App.game, store = App.store;
  const num = (el, name) => parseInt(el.dataset[name], 10);

  const click = {
    openDebug: () => store.setState({ popup: { type: 'debug', title: 'DEBUG МЕНЮ' } }),
    buy1: () => game.buy(1),
    buy2: () => game.buy(2),
    buy3: () => game.buy(3),
    buyR: () => game.buy('r'),
    buyItem: () => game.buyItem(),
    refreshShrine: () => game.refreshShrine(),
    buyShrine: el => game.buyShrine(num(el, 'i')),
    pickIcon: el => store.setState({ iconPick: num(el, 'i') }),
    perkClick: el => {
      const sv = store.state.survivors[num(el, 'i')];
      const p = sv.perks[num(el, 'k')];
      if (p) store.setState({ popup: { type: 'perk_desc', title: p.name, tier: p.tier, desc: game.PERK_DESC[p.name] || 'Описание отсутствует.' } });
    },
    itemClick: el => {
      const i = num(el, 'i');
      const sv = store.state.survivors[i];
      if (sv.item) store.setState({ moveSel: { kind: 'item', from: i, label: sv.item.name } });
    },
    openKillerIcon: () => store.setState({ killerIconPick: true }),
    pickKillerIcon: el => game.setKillerIcon(num(el, 'i')),
    closeKillerIcon: () => store.setState({ killerIconPick: false }),
    give1: () => game.give(1),
    give2: () => game.give(2),
    give3: () => game.give(3),
    giveAddons: () => game.giveAddons(),
    tradeMap: () => game.tradeMap(),
    moveTo: el => game.moveTo(num(el, 'i')),
    closeMove: () => store.setState({ moveSel: null }),
    pickSurvIcon: el => game.pickSurvivorIcon(num(el, 'k')),
    closeIcon: () => store.setState({ iconPick: null }),
    closePopup: () => store.setState({ popup: null }),
    openCurrency: () => store.setState({ popup: { type: 'set_currency', title: 'УСТАНОВИТЬ ЗОЛОТЫЕ КЛЕТКИ' }, currencyInput: String(store.state.balance) }),
    undo: () => { store.setState({ popup: null }); game.undo(); },
    resetShop: () => { store.setState({ popup: null }); game.reset(); },
    tierLists: () => store.setState({ popup: { type: 'tier_lists', title: '' } }),
    confirmDelete: () => game.confirmDelete(),
    applyCurrency: () => game.applyCurrency()
  };

  const ctx = {
    perkCtx: el => {
      const i = num(el, 'i'), k = num(el, 'k');
      const p = store.state.survivors[i].perks[k];
      if (p) store.setState({ popup: { type: 'delete_perk', title: 'УДАЛИТЬ ПЕРК ' + p.name + '?', svIndex: i, perkSlot: k, isItem: false } });
    },
    itemCtx: el => {
      const i = num(el, 'i');
      const sv = store.state.survivors[i];
      if (sv.item) store.setState({ popup: { type: 'delete_perk', title: 'УДАЛИТЬ ПРЕДМЕТ ' + sv.item.name + '?', svIndex: i, isItem: true } });
    }
  };

  const input = {
    teamName: el => store.set({ teamName: el.value }),
    currency: el => store.setState({ currencyInput: el.value })
  };

  let curTip = null;

  App.bindEvents = function (root) {
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'stop') return;
      const fn = click[act];
      if (fn) fn(el, e);
    });

    root.addEventListener('contextmenu', e => {
      const el = e.target.closest('[data-ctx]');
      if (!el) return;
      e.preventDefault();
      const fn = ctx[el.dataset.ctx];
      if (fn) fn(el, e);
    });

    root.addEventListener('input', e => {
      const el = e.target.closest('[data-in]');
      if (!el) return;
      const fn = input[el.dataset.in];
      if (fn) fn(el, e);
    });

    root.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (el && el !== curTip) { curTip = el; game.showTip(el, el.dataset.tip); }
    });
    root.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-tip]');
      if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) { curTip = null; game.hideTip(); }
    });

    // Wallet preview: hovering a priced button shows balance-after-click.
    let curWallet = null;
    root.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-delta]');
      if (el && el !== curWallet) {
        curWallet = el;
        store.setState({ walletPreview: parseInt(el.dataset.delta, 10) || 0 });
      } else if (!el && curWallet && !document.contains(curWallet)) {
        // hovered button was removed mid-hover (e.g. map sold) — clear the preview
        curWallet = null;
        store.setState({ walletPreview: null });
      }
    });
    root.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-delta]');
      if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) {
        curWallet = null;
        store.setState({ walletPreview: null });
      }
    });

    root.addEventListener('dragstart', e => {
      const el = e.target.closest('[data-drag]');
      if (!el) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.drag);
    });
    root.addEventListener('dragover', e => {
      if (e.target.closest('[data-drop]')) e.preventDefault();
    });
    root.addEventListener('drop', e => {
      const el = e.target.closest('[data-drop]');
      if (!el) return;
      e.preventDefault();
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch (_) { return; }
      if (data.kind === 'perk' && el.dataset.drop === 'perk') game.swapPerk(data.from, data.slot, num(el, 'i'), num(el, 'k'));
      else if (data.kind === 'item' && el.dataset.drop === 'item') game.swapItem(data.from, num(el, 'i'));
    });

    window.addEventListener('keydown', e => {
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); game.undo(); }
    });
  };

})(window.App);
