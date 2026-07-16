// The view: pure functions that turn state into an HTML string. App.render().
// Styles copied verbatim from the original template; bindings -> ${expressions},
// sc-if/sc-for -> when/each, inline handlers -> data-act, style-hover -> CSS.
window.App = window.App || {};
(function (App) {

  const S = App.store.state;
  const esc = App.esc, when = App.when, each = App.each;
  const getPerkSrc = App.game.getPerkSrc, shrinePrice = App.game.shrinePrice;
  const ALL_PERKS = App.ALL_PERKS, KILLER_PERKS = App.KILLER_PERKS;
  const TIER = App.TIER, RARITY = App.RARITY, PROPS = App.PROPS;
  const SURVIVOR_ICONS = App.SURVIVOR_ICONS, KILLER_ICONS = App.KILLER_ICONS;

  const CELL = 'assets/Auric_Cell.png';
  const cell = (s = '1.2em', tr = '-0.35em') =>
    `<img src="${CELL}" style="width:${s};height:${s};vertical-align:${tr};object-fit:contain;filter:drop-shadow(0 0 4px rgba(220,180,90,0.5));">`;
  const EMPTY = { c1: '#242b32', c2: '#171c21', glow: 'transparent' };
  const survIcon = i => 'SurvivorIcons/' + encodeURIComponent(SURVIVOR_ICONS[i % SURVIVOR_ICONS.length]);

  // Visual attributes for a perk or an item (unifies colour/label/image).
  function vis(entry) {
    if (entry && entry.isItem) {
      const r = RARITY[entry.rarity] || RARITY['Обычный'];
      return { c1: r.c1, c2: r.c2, glow: r.glow, tint: r.tint, label: r.label, isItem: true,
        img: entry.img, rot: 'none', unrot: 'none', rad: '8px' };
    }
    const t = TIER[entry.tier];
    return { c1: t.c1, c2: t.c2, glow: t.glow, tint: t.tint, label: 'ТИР ' + t.roman, isItem: false,
      img: getPerkSrc(entry.name), rot: 'rotate(45deg)', unrot: 'rotate(-45deg)', rad: '0px' };
  }

  // ---- header ----
  function header() {
    const coinAnim = S.coinFxOn ? 'coinPulse .6s ease' : 'none';
    // Hovering a priced button sets walletPreview (the balance delta): show
    // the current balance and what it becomes after the click.
    let preview = '';
    if (S.walletPreview != null) {
      const after = S.balance + S.walletPreview;
      const col = S.walletPreview < 0 ? '#e0796d' : '#57c47a';
      preview = `<span style="font-size:30px;color:#59646d;"> → </span><span style="font-size:38px;color:${col};">${after}</span>`;
    }
    return `
    <div data-key="header" style="display:flex;align-items:center;gap:36px;flex:0 0 auto;position:relative;z-index:2;">
      <div style="display:flex;flex-direction:column;gap:2px;">
        <input type="text" value="${esc(S.teamName)}" data-in="teamName" style="font-family:'Russo One',sans-serif;font-size:46px;letter-spacing:.14em;text-transform:uppercase;line-height:1;color:#f0e6cf;background:none;border:none;outline:none;width:1200px;margin:0;padding:0;animation:titleGlow 3.5s ease-in-out infinite;">
      </div>
      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:16px;background:linear-gradient(180deg,#1c1710,#0e0b07);border:1px solid #8a6a1e;border-bottom:3px solid #d9b545;clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px);padding:12px 34px;animation:${coinAnim};">
        <img src="${CELL}" style="width:46px;height:46px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(220,180,90,0.5));" alt="ЗК">
        <div style="font-family:'Oswald',sans-serif;font-size:46px;font-weight:600;line-height:1;color:#eecf7a;transform:translateY(-4px);">${S.balance}${preview}</div>
      </div>
      <button data-act="openDebug" class="debug-btn" style="background:none;border:1px solid #3a5c6e;color:#5fb0d9;border-radius:4px;padding:15px 26px;font-family:'Oswald',sans-serif;font-size:20px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;">DEBUG Меню</button>
    </div>`;
  }

  // ---- reel + buy buttons ----
  function reel() {
    const reelTransform = 'translateX(' + (-S.offset) + 'px)';
    const cards = each(S.reel, p => {
      const v = vis(p);
      const imgSize = v.isItem ? '105px' : '165px';
      return `
            <div style="width:300px;flex:0 0 300px;height:100%;box-sizing:border-box;border-right:1px solid #1d242a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0 12px 16px;">
              <div style="width:190px;height:190px;display:flex;align-items:center;justify-content:center;">
                <div style="width:${v.isItem ? '110px' : '120px'};height:${v.isItem ? '110px' : '120px'};transform:${v.rot};border-radius:${v.rad};background:linear-gradient(135deg,${v.c1},${v.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 16px rgba(0,0,0,.55), 0 0 10px ${v.glow};display:flex;align-items:center;justify-content:center;">
                  <img src="${v.img}" style="transform:${v.unrot};width:${imgSize};height:${imgSize};object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8));">
                </div>
              </div>
              <div style="font-family:'Oswald',sans-serif;font-size:23px;letter-spacing:.16em;color:${v.c1};">${v.label}</div>
              <div style="font-size:21px;color:#c3ccd4;text-align:center;line-height:1.25;max-width:270px;">${esc(p.name)}</div>
            </div>`;
    });
    const buyBtn = (act, bg, b, accent, label, cost, extra = '') => `
        <button data-act="${act}" data-delta="-${cost}" class="buy-btn" style="background:linear-gradient(180deg,${bg});border:1px solid ${b};border-bottom:3px solid ${accent};clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%,0 14px);padding:16px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;color:#dbe2e8;transition:transform .12s, filter .12s;">
          <div style="font-family:'Oswald',sans-serif;font-size:23px;letter-spacing:.14em;color:${accent};">${label}</div>
          <div style="font-size:18px;color:#7d8a94;">${cost} ${cell()}${extra}</div>
        </button>`;
    return `
      <div style="background:linear-gradient(180deg,#151b21,#0c1013);border:1px solid #3b4652;border-top:2px solid #55627a;border-radius:6px;position:relative;height:300px;overflow:hidden;flex:0 0 auto;min-width:0;max-width:100%;animation:glowPulse 4.5s ease-in-out infinite;" id="reel">
        <div id="reel-inner" style="position:absolute;left:0;top:0;height:100%;display:flex;transform:${reelTransform};transition:${S.transition};will-change:transform;">
          ${cards}
        </div>
        ${when(S.reel.length === 0, `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:23px;color:#59646d;letter-spacing:.06em;">Выберите тир, чтобы открыть перк или предмет</div>`)}
        <div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#11161a 0%,transparent 14%,transparent 86%,#11161a 100%);"></div>
        <div id="marker" style="position:absolute;top:0;bottom:0;left:50%;width:4px;margin-left:-2px;background:#d8433a;box-shadow:0 0 18px #d8433a;pointer-events:none;animation:markerPulse 1.6s ease-in-out infinite;"></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;flex:0 0 auto;opacity:${S.spinning ? 0.45 : 1};">
        ${buyBtn('buy1', '#20261c,#12161a 60%,#0d1013', '#6e5410', '#d9b545', 'ТИР I', TIER[1].cost)}
        ${buyBtn('buy2', '#17231b,#12161a 60%,#0d1013', '#1d5c33', '#57c47a', 'ТИР II', TIER[2].cost)}
        ${buyBtn('buy3', '#1c1826,#12161a 60%,#0d1013', '#4a2378', '#a86ae8', 'ТИР III', TIER[3].cost)}
        ${buyBtn('buyR', '#261a15,#161316 60%,#0f0d0e', '#8a3d2c', '#d98a5f', 'СЛУЧ. ПЕРК', PROPS.randomCost)}
        ${buyBtn('buyItem', '#152028,#141920 60%,#0e1114', '#2f5a6e', '#5fb0d9', 'СЛУЧ. ПРЕДМЕТ', PROPS.itemCost)}
      </div>`;
  }

  // ---- shrine ----
  function shrine() {
    const refreshSpin = S.shrineAnim ? 'raySpin 1s linear infinite' : 'none';
    const cards = each(S.shrine, (p, i) => {
      const v = vis(p);
      const anim = S.purchaseIdx === i ? 'cardFlash .8s ease both' : 'none';
      const priceLabel = p.bought ? 'КУПЛЕНО' : shrinePrice(p);
      const priceColor = p.bought ? '#59646d' : '#eecf7a';
      const imgSize = v.isItem ? '100px' : '185px';
      return `
            <div data-key="shrine${i}" ${p.bought ? '' : `data-act="buyShrine" data-i="${i}" data-delta="-${shrinePrice(p)}"`} class="shrine-card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:${p.bought ? 'default' : 'pointer'};opacity:${p.bought ? 0.45 : 1};border-radius:6px;animation:${anim};transition:transform .15s;min-height:0;overflow:hidden;padding:4px 0;">
              <div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;">
                <div style="width:${v.isItem ? '118px' : '128px'};height:${v.isItem ? '118px' : '128px'};transform:${v.rot};border-radius:${v.rad};background:linear-gradient(135deg,${v.c1},${v.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 18px rgba(0,0,0,.55), 0 0 12px ${v.glow};display:flex;align-items:center;justify-content:center;">
                  <img src="${v.img}" style="transform:${v.unrot};width:${imgSize};height:${imgSize};object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8));">
                </div>
              </div>
              <div style="font-size:23px;color:#c3ccd4;line-height:1.2;text-align:center;margin-top:2px;max-width:300px;">${esc(p.name)}</div>
              ${when(!p.bought, `<div style="display:flex;align-items:center;gap:6px;font-family:'Oswald',sans-serif;font-size:36px;letter-spacing:.1em;color:${priceColor};">${priceLabel} <img src="${CELL}" style="width:32px;height:32px;object-fit:contain;transform:translateY(3px);"></div>`)}
              ${when(p.bought, `<div style="font-family:'Russo One',sans-serif;font-size:24px;letter-spacing:.14em;color:#d8433a;border:3px solid #d8433a;border-radius:6px;padding:4px 16px;transform:rotate(-12deg);animation:stampIn .4s ease both;text-shadow:0 0 12px rgba(216,67,58,.5);">${priceLabel}</div>`)}
            </div>`;
    });
    const cover = when(!!S.shrineAnim, `
        <div style="position:absolute;left:0;top:0;right:0;bottom:0;z-index:5;background:linear-gradient(180deg,#0d0f11,#151109 60%,#0b0d0f);border-bottom:3px solid #d9b545;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;animation:${S.shrineAnim === 'cover' ? 'curtainDown .5s cubic-bezier(.3,1,.4,1) both' : 'curtainUp .55s cubic-bezier(.6,0,.7,1) both'};">
          <div style="width:120px;height:120px;transform:rotate(45deg);border:3px solid #d9b545;box-shadow:0 0 30px rgba(238,207,122,.35), inset 0 0 24px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1c1710,#0e0b07);"><img src="${CELL}" style="transform:rotate(-45deg);width:76px;height:76px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(220,180,90,.6));"></div>
          <div style="font-family:'Russo One',sans-serif;font-size:26px;letter-spacing:.34em;text-transform:uppercase;color:#eecf7a;">Обновление…</div>
        </div>`);
    return `
      <div style="background:linear-gradient(180deg,rgba(22,24,18,.72),rgba(10,11,10,.78));border:1px solid #3b4030;border-top:2px solid #8a6a1e;border-radius:6px;padding:22px 30px;flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden;animation:glowPulse 5s ease-in-out infinite;">
        <div style="display:flex;align-items:center;gap:20px;">
          <div style="font-family:'Russo One',sans-serif;font-size:28px;letter-spacing:.3em;text-transform:uppercase;color:#eecf7a;animation:titleGlow 4s ease-in-out infinite;">Храм Тайн</div>
          <div style="flex:1;"></div>
          <button data-act="refreshShrine" data-delta="-${S.shrineRefreshed ? PROPS.shrineRefreshCost : 0}" class="shrine-refresh" style="display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#152028,#0d151b);border:1px solid #3a5c6e;border-bottom:3px solid #5fb0d9;clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%,0 10px);color:#5fb0d9;padding:10px 24px;font-family:'Oswald',sans-serif;font-size:19px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:transform .12s, filter .12s;"><span style="display:inline-block;font-size:24px;line-height:1;animation:${refreshSpin};">⟳</span> Обновить · ${S.shrineRefreshed ? PROPS.shrineRefreshCost + ' ' + cell() : 'БЕСПЛАТНО'}</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;flex:1;min-height:0;">
          ${cards}
        </div>
        ${cover}
      </div>`;
  }

  // ---- survivors ----
  function perkSlot(sv, i, k) {
    const p = sv.perks[k];
    if (!p) {
      return `<div data-key="ps${i}-${k}" data-drop="perk" data-i="${i}" data-k="${k}" class="slot" style="width:104px;height:104px;display:flex;align-items:center;justify-content:center;cursor:default;">
                    <div style="width:72px;height:72px;transform:rotate(45deg);background:linear-gradient(135deg,${EMPTY.c1},${EMPTY.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 14px rgba(0,0,0,.55), 0 0 10px ${EMPTY.glow};display:flex;align-items:center;justify-content:center;"></div>
                  </div>`;
    }
    const t = TIER[p.tier];
    return `<div data-key="ps${i}-${k}" draggable="true" data-drag='${esc(JSON.stringify({ kind: 'perk', from: i, slot: k }))}' data-drop="perk" data-act="perkClick" data-ctx="perkCtx" data-tip="${esc(p.name + ' · тир ' + t.roman)}" data-i="${i}" data-k="${k}" class="slot" style="width:104px;height:104px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                    <div style="width:72px;height:72px;transform:rotate(45deg);background:linear-gradient(135deg,${t.c1},${t.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 14px rgba(0,0,0,.55), 0 0 10px ${t.glow};display:flex;align-items:center;justify-content:center;">
                      <img src="${getPerkSrc(p.name)}" style="transform:rotate(-45deg);width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8));">
                    </div>
                  </div>`;
  }
  function survivorRow(sv, i) {
    const v = sv.item ? vis(sv.item) : null;
    const itemC1 = v ? v.c1 : EMPTY.c1, itemC2 = v ? v.c2 : EMPTY.c2, itemGlow = v ? v.glow : 'transparent';
    const itemAttrs = sv.item
      ? `draggable="true" data-drag='${esc(JSON.stringify({ kind: 'item', from: i }))}' data-drop="item" data-act="itemClick" data-ctx="itemCtx" data-tip="${esc(sv.item.name + ' · ' + sv.item.rarity)}" data-i="${i}"`
      : `data-drop="item" data-i="${i}"`;
    const itemInner = sv.item
      ? `<img src="${v.img}" style="width:104px;height:104px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.7));">`
      : '';
    return `
            <div data-key="sv${i}" style="display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.02);border:1px solid #1d242a;border-radius:4px;padding:8px 16px;min-height:0;">
              <div data-act="pickIcon" data-i="${i}" class="surv-icon" style="width:120px;height:120px;flex:0 0 120px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #2b343d, #171c21 75%);border:3px solid #aeb9c2;box-shadow:0 0 12px rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;"><img src="${survIcon(sv.icon)}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.45);"></div>
              <div style="display:flex;gap:8px;flex:1;">
                ${[0, 1, 2, 3].map(k => perkSlot(sv, i, k)).join('')}
              </div>
              <div style="width:1px;align-self:stretch;background:#1d242a;margin:8px 6px;"></div>
              <div ${itemAttrs} class="slot" style="width:112px;height:112px;flex:0 0 112px;border-radius:8px;background:linear-gradient(135deg,${itemC1},${itemC2});border:3px solid #0a0c0e;box-shadow:inset 0 0 14px rgba(0,0,0,.55), 0 0 10px ${itemGlow};display:flex;align-items:center;justify-content:center;cursor:${sv.item ? 'pointer' : 'default'};">
                ${itemInner}
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;justify-content:center;flex:0 0 auto;">
                ${each([0, 1], () => `<div ${sv.item ? `data-tip="${esc('Аддон · ' + sv.item.rarity)}"` : ''} style="width:38px;height:38px;border-radius:6px;background:linear-gradient(135deg,${itemC1},${itemC2});border:2px solid #0a0c0e;box-shadow:inset 0 0 8px rgba(0,0,0,.55), 0 0 8px ${itemGlow};"></div>`)}
              </div>
            </div>`;
  }
  function survivors() {
    return `
      <div style="background:linear-gradient(180deg,rgba(16,21,26,.75),rgba(9,12,15,.8));border:1px solid #2a333c;border-top:2px solid #4a5866;border-radius:6px;padding:18px 26px;flex:1.75;min-height:0;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:baseline;gap:18px;">
          <div style="font-family:'Russo One',sans-serif;font-size:25px;letter-spacing:.3em;text-transform:uppercase;color:#9db4c8;">Выжившие</div>
        </div>
        <div style="display:grid;grid-template-rows:repeat(4,1fr);flex:1;min-height:0;gap:6px;">
          ${each(S.survivors, survivorRow)}
        </div>
      </div>`;
  }

  // ---- killer ----
  function killer() {
    const killerSlots = each([0, 1, 2, 3], k => {
      const p = S.killerPerks[k];
      if (!p) return `<div style="width:128px;height:128px;display:flex;align-items:center;justify-content:center;"><div style="width:88px;height:88px;transform:rotate(45deg);background:linear-gradient(135deg,${EMPTY.c1},${EMPTY.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 16px rgba(0,0,0,.55), 0 0 10px ${EMPTY.glow};display:flex;align-items:center;justify-content:center;"></div></div>`;
      const t = TIER[p.tier];
      return `<div data-tip="${esc(p.name + ' · тир ' + t.roman)}" style="width:128px;height:128px;display:flex;align-items:center;justify-content:center;"><div style="width:88px;height:88px;transform:rotate(45deg);background:linear-gradient(135deg,${t.c1},${t.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 16px rgba(0,0,0,.55), 0 0 10px ${t.glow};display:flex;align-items:center;justify-content:center;"><img src="${getPerkSrc(p.name)}" style="transform:rotate(-45deg);width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8));"></div></div>`;
    });
    const addonSlots = each([0, 1], k => {
      const a = S.addons[k];
      if (!a) return `<div data-tip="Аддон — закрыт" style="width:96px;height:96px;flex:0 0 96px;border-radius:8px;background:linear-gradient(135deg,${EMPTY.c1},${EMPTY.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 14px rgba(0,0,0,.55), 0 0 10px ${EMPTY.glow};display:flex;align-items:center;justify-content:center;"><div style="font-size:38px;color:#f2ede2;text-shadow:0 2px 6px rgba(0,0,0,.7);line-height:1;">❌</div></div>`;
      const t = TIER[a.tier];
      return `<div data-tip="${esc(a.name)}" style="width:96px;height:96px;flex:0 0 96px;border-radius:8px;background:linear-gradient(135deg,${t.c1},${t.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 14px rgba(0,0,0,.55), 0 0 10px ${t.glow};display:flex;align-items:center;justify-content:center;"><div style="font-size:38px;color:#f2ede2;text-shadow:0 2px 6px rgba(0,0,0,.7);line-height:1;"></div></div>`;
    });
    const giveBtn = (act, accent, label, pay) => `
          <button data-act="${act}" data-delta="${pay}" class="give-btn" style="display:flex;flex-direction:column;align-items:center;gap:4px;background:linear-gradient(180deg,#241416,#130d0e);border:1px solid #5c2a2a;border-bottom:3px solid ${accent};clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%,0 12px);padding:12px 8px;cursor:pointer;color:#dbe2e8;transition:transform .12s, filter .12s;">
            <span style="font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:.1em;color:${accent};">${label}</span>
            <span style="font-family:'Oswald',sans-serif;font-size:19px;color:#eecf7a;">+${pay} ${cell()}</span>
          </button>`;
    const addonSide = S.addons.length < 2
      ? `<button data-act="giveAddons" data-delta="${PROPS.addonsPayout}" class="side-btn" style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(160deg,#1e1414,#161112);border:1px solid #5c2a2a;border-radius:4px;padding:12px 20px;cursor:pointer;color:#dbe2e8;">
            <span style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;"><span style="font-family:'Oswald',sans-serif;font-size:20px;letter-spacing:.08em;color:#c07a72;">Открыть аддон убийце</span><span style="font-size:15px;color:#7d8a94;">Маньяк сможет выбрать себе 1 Очень Редкий аддон</span></span>
            <span style="font-family:'Oswald',sans-serif;font-size:22px;color:#eecf7a;">+${PROPS.addonsPayout} ${cell()}</span></button>`
      : `<div style="display:flex;align-items:center;justify-content:space-between;background:#12100f;border:1px dashed #3c2a2a;border-radius:4px;padding:12px 20px;color:#59646d;"><span style="font-family:'Oswald',sans-serif;font-size:20px;letter-spacing:.08em;">Аддоны — открыты (2/2)</span><span style="font-family:'Oswald',sans-serif;font-size:22px;">✓</span></div>`;
    const mapSide = !S.mapTraded
      ? `<button data-act="tradeMap" data-delta="${PROPS.mapPayout}" class="side-btn" style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(160deg,#1e1414,#161112);border:1px solid #5c2a2a;border-radius:4px;padding:12px 20px;cursor:pointer;color:#dbe2e8;flex:0 0 auto;">
            <span style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;"><span style="font-family:'Oswald',sans-serif;font-size:20px;letter-spacing:.08em;color:#c07a72;">Продать право выбора карты</span><span style="font-size:15px;color:#7d8a94;">Убийца выбирает карту</span></span>
            <span style="font-family:'Oswald',sans-serif;font-size:22px;color:#eecf7a;">+${PROPS.mapPayout} ${cell()}</span></button>`
      : `<div style="display:flex;align-items:center;justify-content:space-between;background:#12100f;border:1px dashed #3c2a2a;border-radius:4px;padding:12px 20px;color:#59646d;flex:0 0 auto;"><span style="font-family:'Oswald',sans-serif;font-size:20px;letter-spacing:.08em;">Право выбора карты — продано</span><span style="font-family:'Oswald',sans-serif;font-size:22px;">✓</span></div>`;
    return `
      <div style="background:linear-gradient(180deg,rgba(30,14,14,.7),rgba(12,7,8,.85));border:1px solid #5c2a2a;border-top:2px solid #8a3d2c;border-radius:6px;box-shadow:inset 0 0 70px rgba(120,20,20,.13);padding:18px 26px;flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div data-act="openKillerIcon" class="killer-icon" style="width:80px;height:80px;border-radius:50%;background:#10151a;border:2px solid #5c2a2a;overflow:hidden;cursor:pointer;flex-shrink:0;">
            <img src="${KILLER_ICONS[S.killerIcon]}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.45);">
          </div>
          <div style="font-family:'Russo One',sans-serif;font-size:26px;letter-spacing:.3em;text-transform:uppercase;color:#e06a5a;text-shadow:0 0 16px rgba(216,67,58,.45);">Убийца · ${S.killerPerks.length} / 4</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;justify-content:center;flex:1;min-height:0;">
          ${killerSlots}
          <div style="width:1px;align-self:stretch;background:#3c2a2a;margin:14px 10px;"></div>
          ${addonSlots}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;flex:0 0 auto;opacity:${(S.killerPerks.length >= 4 || S.spinning) ? 0.4 : 1};">
          ${giveBtn('give1', '#d9b545', 'ОТДАТЬ ТИР I', TIER[1].payout)}
          ${giveBtn('give2', '#57c47a', 'ОТДАТЬ ТИР II', TIER[2].payout)}
          ${giveBtn('give3', '#a86ae8', 'ОТДАТЬ ТИР III', TIER[3].payout)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:0 0 auto;">
          ${addonSide}
          ${mapSide}
        </div>
      </div>`;
  }

  // ---- overlays ----
  function overlays() {
    let out = '';

    if (S.tip) {
      out += `<div data-key="tip" style="position:absolute;left:${S.tip.x}px;top:${S.tip.y - 12}px;transform:translate(-50%,-100%);z-index:80;pointer-events:none;background:linear-gradient(180deg,#1c222a,#10141a);border:1px solid #d9b545;border-bottom:3px solid #d9b545;clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%,0 10px);padding:10px 24px;font-family:'Oswald',sans-serif;font-size:25px;letter-spacing:.06em;color:#f0e6cf;white-space:nowrap;animation:pop .12s ease;">${esc(S.tip.text)}</div>`;
    }

    if (S.killerFx) {
      const f = S.killerFx;
      out += `<div data-key="kfx" style="position:absolute;left:0;top:0;right:0;bottom:0;z-index:55;background:radial-gradient(1100px 750px at 50% 45%, rgba(120,10,10,.5), rgba(5,3,3,.95) 70%),rgba(4,2,2,.8);display:flex;align-items:center;justify-content:center;animation:fadeIn .12s ease;overflow:hidden;">
        <div style="position:absolute;top:20%;left:0;width:100%;height:8px;background:linear-gradient(90deg,transparent,#ff3b2f,transparent);animation:slashIn .55s ease .05s both;"></div>
        <div style="position:absolute;top:48%;left:0;width:100%;height:14px;background:linear-gradient(90deg,transparent,#c02218,transparent);animation:slashIn .55s ease .22s both;"></div>
        <div style="position:absolute;top:74%;left:0;width:100%;height:6px;background:linear-gradient(90deg,transparent,#ff6a5e,transparent);animation:slashIn .55s ease .38s both;"></div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:30px;">
          <div style="width:320px;height:320px;display:flex;align-items:center;justify-content:center;animation:killerSlam .6s cubic-bezier(.2,1.3,.3,1) both;">
            <div style="width:210px;height:210px;transform:${f.rot};border-radius:${f.rad};background:linear-gradient(135deg,${f.c1},${f.c2});border:5px solid #0a0c0e;box-shadow:inset 0 0 28px rgba(0,0,0,.5), 0 0 90px rgba(216,67,58,.6);display:flex;align-items:center;justify-content:center;">
              ${when(!!f.img, `<img src="${f.img}" style="transform:${f.unrot};width:300px;height:300px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,.8));">`)}
              ${when(!f.img, `<div style="transform:${f.unrot};font-size:86px;color:#f7e6e2;line-height:1;text-shadow:0 3px 12px rgba(0,0,0,.7);">${f.glyph}</div>`)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;animation:pop .3s ease .25s both;">
            <div style="font-family:'Russo One',sans-serif;font-size:52px;letter-spacing:.18em;text-transform:uppercase;color:#ff5b4d;text-shadow:0 0 30px rgba(216,67,58,.8);">${esc(f.title)}</div>
            <div style="font-family:'Oswald',sans-serif;font-size:40px;color:#eef2f5;">${esc(f.name)}</div>
            <div style="font-family:'Russo One',sans-serif;font-size:36px;color:#eecf7a;text-shadow:0 0 20px rgba(238,207,122,.6);">${f.pay} ${cell('1.1em', '-0.3em')}</div>
          </div>
        </div>
      </div>`;
    }

    if (S.winOverlay) {
      const w = S.winOverlay, v = vis(w);
      const imgSize = v.isItem ? '210px' : '300px';
      const outerAnim = S.winClosing ? 'fadeOut .4s ease both' : 'fadeIn .18s ease';
      const popAnim = S.winClosing ? 'winOut .4s ease both' : 'winPop .45s cubic-bezier(.2,1.4,.4,1)';
      out += `<div data-key="win" style="position:absolute;inset:0;z-index:50;background:radial-gradient(1000px 700px at 50% 45%, ${v.tint}, rgba(6,8,10,.96) 72%),rgba(6,8,10,.72);display:flex;align-items:center;justify-content:center;animation:${outerAnim};">
        <div style="position:absolute;left:50%;top:45%;width:1400px;height:1400px;margin:-700px 0 0 -700px;pointer-events:none;opacity:.45;"><div style="width:100%;height:100%;border-radius:50%;background:repeating-conic-gradient(${v.tint} 0deg 8deg, transparent 8deg 26deg);animation:raySpin 18s linear infinite;-webkit-mask-image:radial-gradient(circle, rgba(0,0,0,.9) 0%, transparent 65%);mask-image:radial-gradient(circle, rgba(0,0,0,.9) 0%, transparent 65%);"></div></div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:34px;animation:${popAnim};">
          <div style="width:300px;height:300px;display:flex;align-items:center;justify-content:center;animation:winGlow 1.2s ease-in-out infinite;">
            <div style="width:200px;height:200px;transform:${v.isItem ? 'none' : 'rotate(45deg)'};border-radius:${v.isItem ? '16px' : '0px'};background:linear-gradient(135deg,${v.c1},${v.c2});border:5px solid #0a0c0e;box-shadow:inset 0 0 28px rgba(0,0,0,.5), 0 0 60px ${v.glow};display:flex;align-items:center;justify-content:center;">
              <img src="${v.img}" style="transform:${v.unrot};width:${imgSize};height:${imgSize};object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.8));">
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
            <div style="font-family:'Oswald',sans-serif;font-size:24px;letter-spacing:.34em;text-transform:uppercase;color:${v.c1};">${v.label}</div>
            <div style="font-family:'Oswald',sans-serif;font-size:44px;letter-spacing:.06em;color:#eef2f5;">${esc(w.name)}</div>
            <div style="font-size:22px;color:#8b98a2;">${w.owner ? '→ ' + esc(w.owner) : ''}</div>
          </div>
        </div>
      </div>`;
    }

    if (S.moveSel) {
      const sel = S.moveSel;
      const targets = S.survivors.map((sv, i) => ({ sv, i })).filter(x => {
        if (x.i === sel.from) return false;
        return sel.kind === 'perk' ? x.sv.perks.length < 4 : !x.sv.item;
      });
      const rows = each(targets, x => `
            <button data-act="moveTo" data-i="${x.i}" class="move-target" style="display:flex;align-items:center;gap:16px;background:#171d22;border:1px solid #2a333c;border-radius:4px;padding:12px 20px;cursor:pointer;color:#dbe2e8;font-size:21px;">
              <span style="width:64px;height:64px;border-radius:50%;background:#10151a;border:2px solid #aeb9c2;display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${survIcon(x.sv.icon)}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.45);"></span>
              <span>${esc(x.sv.name)}</span>
              <span style="flex:1;"></span>
              <span style="font-size:17px;color:#59646d;">${sel.kind === 'perk' ? (4 - x.sv.perks.length) + ' свободно' : 'слот предмета свободен'}</span>
            </button>`);
      out += `<div data-key="move" data-act="closeMove" style="position:absolute;inset:0;z-index:60;background:rgba(6,8,10,.75);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;">
        <div data-act="stop" style="background:#14191e;border:1px solid #2a333c;border-radius:6px;padding:34px 44px;display:flex;flex-direction:column;gap:22px;min-width:560px;animation:pop .2s ease;">
          <div style="font-family:'Oswald',sans-serif;font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:#e8edf1;">${sel.kind === 'perk' ? 'Передать перк' : 'Передать предмет'}</div>
          <div style="font-size:20px;color:#8b98a2;">${esc(sel.label)} — от: ${esc(S.survivors[sel.from].name)}</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${rows}
            ${when(targets.length === 0, `<div style="font-size:20px;color:#59646d;">Нет свободных слотов у других выживших.</div>`)}
          </div>
          <button data-act="closeMove" class="ghost-btn" style="align-self:flex-end;background:none;border:1px solid #3a444e;color:#8b98a2;border-radius:4px;padding:10px 26px;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;">Отмена</button>
        </div>
      </div>`;
    }

    if (S.iconPick !== null) {
      const opts = each(SURVIVOR_ICONS, (io, k) => {
        const ring = S.survivors[S.iconPick].icon === k ? '0 0 0 4px #aeb9c2' : 'none';
        return `<div data-act="pickSurvIcon" data-k="${k}" class="icon-opt" style="width:115px;height:115px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #2b343d, #171c21 75%);border:3px solid #aeb9c2;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;box-shadow:${ring};"><img src="SurvivorIcons/${encodeURIComponent(io)}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.45);"></div>`;
      });
      out += `<div data-key="iconpick" data-act="closeIcon" style="position:absolute;inset:0;z-index:60;background:rgba(6,8,10,.75);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;">
        <div data-act="stop" style="background:#14191e;border:1px solid #2a333c;border-radius:6px;padding:34px 44px;display:flex;flex-direction:column;gap:24px;animation:pop .2s ease;">
          <div style="font-family:'Oswald',sans-serif;font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:#e8edf1;">Иконка выжившего</div>
          <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:12px;max-height:60vh;overflow-y:auto;padding:12px;">${opts}</div>
          <button data-act="closeIcon" class="ghost-btn" style="align-self:flex-end;background:none;border:1px solid #3a444e;color:#8b98a2;border-radius:4px;padding:10px 26px;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;">Закрыть</button>
        </div>
      </div>`;
    }

    if (S.killerIconPick) {
      const opts = each(KILLER_ICONS, (src, i) => {
        const border = S.killerIcon === i ? '#c07a72' : '#3a444e';
        const ring = S.killerIcon === i ? '0 0 12px rgba(192,122,114,0.6)' : 'none';
        return `<div data-act="pickKillerIcon" data-i="${i}" class="icon-opt" style="width:115px;height:115px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #2b343d, #171c21 75%);border:3px solid ${border};display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;box-shadow:${ring};"><img src="${src}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.45);"></div>`;
      });
      out += `<div data-key="killericonpick" data-act="closeKillerIcon" style="position:absolute;inset:0;z-index:60;background:rgba(6,8,10,.75);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;">
        <div data-act="stop" style="background:#14191e;border:1px solid #2a333c;border-radius:6px;padding:34px 44px;display:flex;flex-direction:column;gap:24px;animation:pop .2s ease;">
          <div style="font-family:'Oswald',sans-serif;font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:#e8edf1;">Иконка убийцы</div>
          <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:12px;max-height:60vh;overflow-y:auto;padding:12px;">${opts}</div>
          <button data-act="closeKillerIcon" class="ghost-btn" style="align-self:flex-end;background:none;border:1px solid #3a444e;color:#8b98a2;border-radius:4px;padding:10px 26px;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;">Закрыть</button>
        </div>
      </div>`;
    }

    if (S.toastMsg) {
      out += `<div data-key="toast" style="position:absolute;bottom:40px;left:50%;transform:translateX(-50%);z-index:70;background:#241416;border:1px solid #5c2a2a;color:#e0958c;border-radius:4px;padding:14px 32px;font-size:21px;font-family:'Oswald',sans-serif;letter-spacing:.06em;animation:pop .25s ease;">${esc(S.toastMsg)}</div>`;
    }

    return out;
  }

  // ---- popup (document-level, fixed) ----
  function popup() {
    const p = S.popup;
    if (!p) return '';
    const width = p.type === 'tier_lists' ? '2100px' : '640px';
    let body = '';

    if (p.type === 'debug') {
      body = `<div style="display:flex;flex-direction:column;gap:12px;">
        <button data-act="openCurrency" class="pop-btn" style="background:#152028;border:1px solid #3a5c6e;color:#5fb0d9;padding:22px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:32px;cursor:pointer;">Установить ${cell('1.2em', '-0.3em')}</button>
        <button data-act="undo" class="pop-btn" style="background:#1a1722;border:1px solid #4a2378;color:#a86ae8;padding:22px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:32px;cursor:pointer;">Отменить (Ctrl+Z)</button>
        <button data-act="resetShop" class="pop-btn" style="background:#1e1414;border:1px solid #3c2a2a;color:#c07a72;padding:22px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:32px;cursor:pointer;">Полный сброс</button>
        <button data-act="tierLists" class="pop-btn" style="background:#1d242a;border:1px solid #3c4852;color:#aeb9c2;padding:22px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:32px;cursor:pointer;">Списки перков</button>
      </div>`;
    } else if (p.type === 'tier_lists') {
      const perkRow = x => {
        const t = TIER[x.tier];
        return `<div style="display:flex;align-items:center;gap:20px;padding:8px 10px;border-bottom:1px solid rgba(42,51,60,0.5);min-width:0;">
            <div style="width:56px;height:56px;flex:0 0 56px;margin:12px;transform:rotate(45deg);background:linear-gradient(135deg,${t.c1},${t.c2});border:3px solid #0a0c0e;box-shadow:0 0 8px ${t.glow};display:flex;align-items:center;justify-content:center;">
              <img src="${x.src}" loading="lazy" style="transform:rotate(-45deg);width:76px;height:76px;object-fit:contain;filter:drop-shadow(0 1px 3px rgba(0,0,0,.8));">
            </div>
            <div style="font-size:24px;color:#e8edf1;line-height:1.25;">${esc(x.name)}</div>
          </div>`;
      };
      const column = (title, perks) => `<div style="flex:1;min-width:0;">
          <div style="font-family:'Oswald',sans-serif;font-size:34px;letter-spacing:.08em;color:#8b98a2;margin-bottom:14px;border-bottom:1px solid #2a333c;padding-bottom:10px;">${title}</div>
          ${each([1, 2, 3], tier => `
            <div style="font-family:'Oswald',sans-serif;font-size:30px;letter-spacing:.1em;color:${TIER[tier].c1};margin:24px 0 10px;">ТИР ${TIER[tier].roman} · ${perks.filter(x => x.tier === tier).length}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">
              ${each(perks.filter(x => x.tier === tier), perkRow)}
            </div>
          `)}
        </div>`;
      body = `<div style="font-family:'Oswald',sans-serif;font-size:40px;color:#e8edf1;margin-bottom:20px;">ВСЕ ПЕРКИ ПО ТИРАМ</div>
        <div style="display:flex;gap:44px;text-align:left;height:76vh;overflow-y:auto;padding-right:12px;">
          ${column('Выжившие', ALL_PERKS)}
          ${column('Убийца', KILLER_PERKS)}
        </div>`;
    } else if (p.type === 'delete_perk') {
      body = `<div style="display:flex;gap:12px;justify-content:center;">
        <button data-act="confirmDelete" class="pop-btn" style="flex:1;background:#1e1414;border:1px solid #3c2a2a;color:#c07a72;padding:18px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:30px;cursor:pointer;">Удалить</button>
        <button data-act="closePopup" class="pop-btn" style="flex:1;background:#1d242a;border:1px solid #2a333c;color:#aeb9c2;padding:18px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:30px;cursor:pointer;">Отмена</button>
      </div>`;
    } else if (p.type === 'perk_desc') {
      const t = TIER[p.tier] || TIER[1];
      const src = getPerkSrc(p.title);
      body = `${when(!!src, `<div style="height:150px;display:flex;align-items:center;justify-content:center;margin-bottom:24px;">
          <div style="width:96px;height:96px;transform:rotate(45deg);background:linear-gradient(135deg,${t.c1},${t.c2});border:3px solid #0a0c0e;box-shadow:inset 0 0 16px rgba(0,0,0,.55), 0 0 14px ${t.glow};display:flex;align-items:center;justify-content:center;">
            <img src="${src}" style="transform:rotate(-45deg);width:130px;height:130px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.8));">
          </div>
        </div>`)}
        <div style="color:#aeb9c2;font-size:24px;font-family:sans-serif;line-height:1.5;white-space:pre-wrap;text-align:left;overflow-y:auto;max-height:600px;">${esc(p.desc)}</div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:30px;">
          <button data-act="closePopup" class="pop-btn" style="flex:1;background:#1d242a;border:1px solid #2a333c;color:#aeb9c2;padding:18px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:30px;cursor:pointer;">Закрыть</button>
        </div>`;
    } else if (p.type === 'set_currency') {
      body = `<input type="number" value="${esc(S.currencyInput)}" data-in="currency" style="width:100%;background:#0d1114;border:1px solid #2a333c;color:#eecf7a;padding:16px;border-radius:4px;font-family:'Oswald',sans-serif;font-size:34px;text-align:center;box-sizing:border-box;" />
        <div style="display:flex;gap:12px;justify-content:center;margin-top:20px;">
          <button data-act="applyCurrency" class="pop-btn" style="flex:1;background:#152028;border:1px solid #3a5c6e;color:#5fb0d9;padding:18px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:30px;cursor:pointer;">Сохранить</button>
          <button data-act="closePopup" class="pop-btn" style="flex:1;background:#1d242a;border:1px solid #2a333c;color:#aeb9c2;padding:18px;border-radius:6px;font-family:'Oswald',sans-serif;font-size:30px;cursor:pointer;">Отмена</button>
        </div>`;
    }

    return `<div data-key="popup" data-act="closePopup" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;">
        <div data-act="stop" style="background:#171d22;border:1px solid #2a333c;padding:48px;border-radius:10px;width:${width};max-width:94vw;box-sizing:border-box;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.8);">
          <div style="font-size:36px;color:#e8edf1;margin-bottom:32px;font-family:'Oswald',sans-serif;letter-spacing:0.05em;">${esc(p.title)}</div>
          ${body}
        </div>
      </div>`;
  }

  // ---- root ----
  App.render = function () {
    const shakeAnim = S.shaking ? 'screenShake .55s ease' : 'none';
    const coinFloat = S.coinFloat
      ? `<div data-key="coinfloat" style="position:absolute;top:112px;right:310px;z-index:66;font-family:'Russo One',sans-serif;font-size:46px;color:${S.coinFloatColor};text-shadow:0 0 20px rgba(238,207,122,.65);animation:floatUp 1.4s ease both;pointer-events:none;">${esc(S.coinFloat)} <img src="${CELL}" style="width:1.05em;height:1.05em;vertical-align:-0.25em;object-fit:contain;filter:drop-shadow(0 0 6px rgba(220,180,90,0.5));"></div>`
      : '';
    const redFlash = S.redFlashOn
      ? `<div data-key="redflash" style="position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:65;background:radial-gradient(ellipse at 50% 50%, rgba(160,20,20,0) 35%, rgba(150,12,12,.6) 100%);animation:redFlash 1.2s ease both;"></div>`
      : '';

    return `
<div style="width:100vw;height:100vh;overflow:hidden;background:#07090c;display:flex;align-items:center;justify-content:center;animation:${shakeAnim};">
  <div id="frame" style="width:2560px;height:1440px;flex:0 0 auto;transform:scale(${S.scale});box-sizing:border-box;background:radial-gradient(1900px 1100px at 50% -15%, #1e252d 0%, #11161b 52%, #090c0f 100%);color:#dbe2e8;font-family:'PT Sans',sans-serif;display:flex;flex-direction:column;padding:32px 44px;gap:20px;position:relative;overflow:hidden;">
    <canvas id="bg" data-key="bg" width="2560" height="1440" style="position:absolute;left:0;top:0;width:2560px;height:1440px;pointer-events:none;z-index:1;"></canvas>
    <div data-key="vignette" style="position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 50% 60%, transparent 48%, rgba(0,0,0,.62) 100%);"></div>
    ${redFlash}
    ${coinFloat}
    ${header()}
    <div data-key="main" style="display:grid;grid-template-columns:1400px 1fr;gap:24px;flex:1;min-height:0;position:relative;z-index:2;">
      <div style="display:flex;flex-direction:column;gap:16px;min-height:0;min-width:0;">
        ${reel()}
        ${shrine()}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;min-height:0;min-width:0;">
        ${survivors()}
        ${killer()}
      </div>
    </div>
    ${overlays()}
  </div>
</div>
${popup()}`;
  };

})(window.App);
