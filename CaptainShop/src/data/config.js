// Static configuration: perk tiers, item rarities, the item catalogue, and the
// tunable economy. Loaded as a classic script -> everything hangs off window.App
// so the app also runs by double-clicking index.html (no server needed).
window.App = window.App || {};

// Perk tiers (survivor & killer perks).
// `cost` — tier roll from the reel (random perk of that tier);
// `shrinePrice` — Храм Тайн (you buy the exact perk you see → premium);
// `payout` — reward for giving the killer a perk of that tier.
App.TIER = {
  1: { roman: 'I',   c1: '#d9b545', c2: '#6e5410', glow: 'rgba(217,181,69,.35)',  tint: 'rgba(217,181,69,.22)', payout: 250, cost: 75,  shrinePrice: 100 },
  2: { roman: 'II',  c1: '#57c47a', c2: '#1d5c33', glow: 'rgba(87,196,122,.35)',  tint: 'rgba(87,196,122,.2)',  payout: 400, cost: 150, shrinePrice: 250 },
  3: { roman: 'III', c1: '#a86ae8', c2: '#4a2378', glow: 'rgba(168,106,232,.4)',  tint: 'rgba(168,106,232,.24)', payout: 550, cost: 300, shrinePrice: 450 }
};

// Item rarities (colours: brown / green / blue / purple — no yellow).
// `weight` is the chance of rolling that rarity from the item machine.
App.RARITY = {
  'Обычный':      { label: 'ОБЫЧНЫЙ',      c1: '#b1855a', c2: '#5a3f27', glow: 'rgba(177,133,90,.35)',  tint: 'rgba(177,133,90,.22)', weight: 0.40 },
  'Необычный':    { label: 'НЕОБЫЧНЫЙ',    c1: '#57c47a', c2: '#1d5c33', glow: 'rgba(87,196,122,.35)',  tint: 'rgba(87,196,122,.2)',  weight: 0.30 },
  'Редкий':       { label: 'РЕДКИЙ',       c1: '#4da6e0', c2: '#1e4a6e', glow: 'rgba(77,166,224,.35)',  tint: 'rgba(77,166,224,.22)', weight: 0.20 },
  'Очень редкий': { label: 'ОЧЕНЬ РЕДКИЙ', c1: '#a86ae8', c2: '#4a2378', glow: 'rgba(168,106,232,.4)',  tint: 'rgba(168,106,232,.24)', weight: 0.10 }
};

// Survivor items: Russian names + rarities from items.json, matched to the
// artwork in the Items/ folders.
App.ITEMS = [
  { name: 'Аптечка первой помощи',              rarity: 'Редкий',       img: 'Items/Medkits/First Aid Kit.png' },
  { name: 'Вместительный ящик с инструментами', rarity: 'Редкий',       img: 'Items/Toolboxes/Commodious Toolbox.png' },
  { name: 'Инструменты механика',               rarity: 'Редкий',       img: 'Items/Toolboxes/Mechanic_s Toolbox.png' },
  { name: 'Карта с подписями',                  rarity: 'Редкий',       img: 'Items/Maps/Annotated Map.png' },
  { name: 'Ключ скелета',                       rarity: 'Редкий',       img: 'Items/Keys/Skeleton Key.png' },
  { name: 'Спортивный фонарик',                 rarity: 'Редкий',       img: 'Items/Flashlights/Sport Flashlight.png' },
  { name: 'Флакон Виго с туманом',              rarity: 'Редкий',       img: 'Items/Fog Vials/Vigo_s Fog Vial.png' },
  { name: 'Аптечка',                            rarity: 'Необычный',    img: 'Items/Medkits/Emergency Med Kit.png' },
  { name: 'Небрежная карта',                    rarity: 'Необычный',    img: 'Items/Maps/Scribbled Map.png' },
  { name: 'Потертый ключ',                      rarity: 'Необычный',    img: 'Items/Keys/Dull Key.png' },
  { name: 'Флакон мастерового с туманом',       rarity: 'Необычный',    img: 'Items/Fog Vials/Artisan_s Fog Vial.png' },
  { name: 'Фонарик',                            rarity: 'Необычный',    img: 'Items/Flashlights/Flashlight.png' },
  { name: 'Ящик с инструментами',               rarity: 'Необычный',    img: 'Items/Toolboxes/Toolbox.png' },
  { name: 'Загадочная карта',                   rarity: 'Обычный',      img: 'Items/Maps/Cryptic Map.png' },
  { name: 'Изношенные инструменты',             rarity: 'Обычный',      img: 'Items/Toolboxes/Worn-Out Toolbox.png' },
  { name: 'Походная аптечка',                   rarity: 'Обычный',      img: 'Items/Medkits/Camping Aid Kit.png' },
  { name: 'Сломанный ключ',                     rarity: 'Обычный',      img: 'Items/Keys/Broken Key.png' },
  { name: 'Флакон подмастерья с туманом',       rarity: 'Обычный',      img: 'Items/Fog Vials/Apprentice_s Fog Vial.png' },
  { name: 'Аптечка лесничего',                  rarity: 'Очень редкий', img: 'Items/Medkits/Ranger Med Kit.png' },
  { name: 'Инструменты инженера',               rarity: 'Очень редкий', img: 'Items/Toolboxes/Engineer_s Toolbox.png' }
];

// Tunables that used to live in the editor "props" panel — edit to rebalance.
// Economy: elite kit = 4 × ТИР III rolls (1200) + 12 random rolls (1200)
// + 4 item rolls (400) = 2800. Giving the killer EVERYTHING at tier III
// = 200 start + 4×550 + 2×250 + 700 map = 3600 → full team with one
// tier-3 perk each, plus shrine luxuries. Without selling the map (-700)
// the elite kit gets very tight. All-tier-I gives (2350) only afford a
// basic random-roll kit. Value ordering the payouts encode: map rights >
// a tier-3 perk (700 > 550); one addon = a tier-1 perk (250 = 250).
// Rolls are always cheaper than the shrine, and the random roll (100)
// must cost MORE than a ТИР I roll (75) — it guarantees at least tier 1 —
// while staying below its ~128 expected value.
App.PROPS = {
  startBalance: 200,
  randomCost: 100,
  itemCost: 50,
  mapPayout: 700,
  addonsPayout: 250,
  shrineRefreshCost: 80,
  sounds: true
};

App.STORAGE_KEY = 'dbd-tournament-shop-v2';
