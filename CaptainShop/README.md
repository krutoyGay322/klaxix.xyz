# Лавка Капитана — Dead by Daylight tournament shop

A self-contained static web app. **No build step, no framework, no dependencies.**
Plain HTML + CSS + JavaScript.

## Run it

Just **double-click `index.html`** — it opens straight in your browser. (It uses
plain classic scripts, so it works from `file://` with no server.)

To run it from a local server instead (optional):

```bash
# from this folder
python -m http.server 5757
# then open http://localhost:5757
```

## Host it

Upload the whole folder to any static host — GitHub Pages, Netlify, Cloudflare
Pages, itch.io, or any web server. There is nothing to compile. (You can delete
the `_legacy/` folder before uploading; it only holds the old version.)

## Where things live

```
index.html              Entry point: loads fonts, styles.css, and src/main.js
src/
  main.js               Bootstrap: restore save, wire render, resize, embers
  view.js               The whole UI as HTML-string functions (edit visuals here)
  actions.js            Turns clicks/drags/etc. into game actions
  game.js               Game logic (buy, give, shrine, drag, undo, …)
  styles.css            Keyframe animations + hover styles
  core/
    dom.js              ~120-line render engine (keyed DOM morphing)
    store.js            App state + localStorage save/load + undo history
    audio.js            Procedural sound effects (Web Audio)
    embers.js           Background ember particles (canvas)
  data/
    perks.js            Survivor perks (name, image, tier)
    killerPerks.js      Killer perks (name, image, tier)
    perkDesc.js         Perk descriptions (Russian)
    survivorIcons.js    Survivor portrait filenames
    killerIcons.js      Killer portrait paths
    config.js           TIER colours, item RARITY, the ITEMS catalogue, economy (PROPS)

assets/ survivorPerks/ killerPerks/ killerIcons/ SurvivorIcons/ Items/   image assets
_legacy/                the previous framework-based version (safe to delete)
```

## Common edits

- **Rebalance the economy** (costs / payouts / starting balance): `src/data/config.js` → `PROPS`.
- **Change item rarities / drop rates**: `src/data/config.js` → `RARITY` (colours + `weight`)
  and `ITEMS` (the catalogue: name, rarity, image).
- **Add or change a survivor perk**: `src/data/perks.js` (+ description in `perkDesc.js`);
  drop the image into `survivorPerks/TierN/`.
- **Add or change a killer perk**: `src/data/killerPerks.js`; image into `killerPerks/Tier N/`.
- **Change the look** of a section: find the section function in `src/view.js`
  (`header`, `reel`, `shrine`, `survivors`, `killer`, `overlays`, `popup`).
- **Change an animation**: `src/styles.css` (the `@keyframes`).

### How rendering works (the short version)

State lives in `src/core/store.js`. When it changes, `view.js` produces a fresh
HTML string and `core/dom.js` *morphs* it onto the live page — patching only what
changed instead of rebuilding. That is what keeps the reel spin, the ember
canvas, running animations, and text-input focus smooth, without React.
