// Генерирует TeamRandomiser/data.json из ассетов CaptainShop + словарей Roulette.
// Запуск: node TeamRandomiser/tools/build-data.mjs (из корня репозитория)
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const SHOP = join(ROOT, 'CaptainShop');
const j = p => JSON.parse(readFileSync(p, 'utf8'));

const perkMap = j(join(ROOT, 'Roulette/data/perk_map.json'));           // рус -> eng (файл)
const killerPerkMap = j(join(ROOT, 'Roulette/data/killer_perk_map.json')); // килер -> {рус -> eng}
const survivorMap = j(join(ROOT, 'Roulette/data/survivor_map.json'));   // рус -> eng
const killerMap = j(join(ROOT, 'Roulette/data/killer_map.json'));       // РУС -> eng

const inv = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));

const survPerkRu = inv(perkMap);
const killerPerkRu = {};
for (const perks of Object.values(killerPerkMap))
  for (const [ru, en] of Object.entries(perks)) killerPerkRu[en] = ru;
const survRu = inv(survivorMap);
const killerRu = inv(killerMap);

const titleCase = s => s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const files = d => readdirSync(d).filter(f => /\.(png|webp)$/i.test(f));
const base = f => f.replace(/\.(png|webp)$/i, '');
const missing = [];

// Порядок выхода в DBD (по именам файлов). Новые персонажи — в конец списка.
const KILLER_ORDER = [
  'Trapper', 'Wraith', 'Hillbilly', 'Nurse', 'Shape Variant', 'Hag', 'Doctor', 'Huntress',
  'Cannibal', 'Nightmare', 'Pig', 'Clown', 'Spirit', 'Legion', 'Plague', 'Ghostface',
  'Demogorgon', 'Oni', 'Deathslinger', 'Executioner', 'Blight', 'Twins', 'Trickster',
  'Nemesis', 'Cenobite', 'Artist', 'Onryo', 'Dredge', 'Mastermind', 'Knight',
  'Skull Merchant', 'Singularity', 'Xenomorph', 'Good Guy', 'Unknown', 'Lich',
  'Dark Lord', 'Houndmaster', 'Ghoul', 'Animatronic', 'Krasue',
  'T_UI_K42_TheFirst_Portrait', 'Slasher'
];
const SURVIVOR_ORDER = [
  'Dwight Fairfield', 'Meg Thomas', 'Claudette Morel', 'Jake Park', 'Nea Karlsson',
  'Laurie Strode', 'Ace Visconti', 'Bill Overbeck', 'Feng Min', 'David King',
  'Quentin Smith', 'David Tapp', 'Kate Denson', 'Adam Francis', 'Jeff Johansen',
  'Jane Romero', 'Ash Williams', 'Nancy Wheeler', 'Steve Harrington', 'Yui Kimura',
  'Zarina Kassir', 'Cheryl Mason', 'Felix Richter', 'Elodie Rakoto', 'Yun-Jin Lee',
  'Jill Valentine', 'Leon S Kennedy', 'Mikaela Reid', 'Jonah Vasquez', 'Yoichi Asakawa',
  'Haddie Kaur', 'Ada Wong', 'Rebecca Chambers', 'Vittorio Toscano', 'Thalita Lyra',
  'Renato Lyra', 'Gabriel Soma', 'Nicolas Cage', 'Ellen Ripley', 'Alan Wake',
  'Sable Ward', 'Aestri Yazar', 'Lara Croft', 'Trevor Belmont', 'Taurie Cain',
  'Orela Rose', 'Rick Grimes', 'Michonne Grimes', 'Vee Boonyasak', 'Dustin Henderson',
  'Eleven', 'Kwon Tae-young', 'Shane Wiigwaas'
];
function orderIdx(order, en, kind) {
  const i = order.indexOf(en);
  if (i === -1) missing.push(`${kind} вне списка порядка выхода: ${en}`);
  return i === -1 ? 1e9 : i;
}

function perkPool(dir, tiers, ruMap, kind) {
  const out = [];
  for (const [tier, sub] of tiers) {
    for (const f of files(join(SHOP, dir, sub))) {
      const en = f.replace(/\.png$/, '');
      let ru = ruMap[en];
      if (!ru) { missing.push(`${kind}: ${en}`); ru = en; }
      out.push({ name: kind === 'killer' ? titleCase(ru.toLowerCase()) : ru, src: `../CaptainShop/${dir}/${sub}/${f}`, tier });
    }
  }
  return out;
}

const survivorPerks = perkPool('survivorPerks', [[1, 'Tier1'], [2, 'Tier2'], [3, 'Tier3']], survPerkRu, 'surv');
const killerPerks = perkPool('killerPerks', [[1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3']], killerPerkRu, 'killer');

// Предметы: русское имя + редкость как в DBD из items.json
// (1 обычный/коричневый, 2 необычный/жёлтый, 3 редкий/зелёный, 4 очень редкий/фиолетовый).
const ITEMS = {
  'Medkits/Camping Aid Kit.png': ['Походная аптечка', 1],
  'Medkits/First Aid Kit.png': ['Аптечка', 2],
  'Medkits/Emergency Med Kit.png': ['Аптечка первой помощи', 3],
  'Medkits/Ranger Med Kit.png': ['Аптечка лесничего', 4],
  'Toolboxes/Worn-Out Toolbox.png': ['Изношенные инструменты', 1],
  'Toolboxes/Toolbox.png': ['Ящик с инструментами', 2],
  'Toolboxes/Mechanic_s Toolbox.png': ['Инструменты механика', 3],
  'Toolboxes/Commodious Toolbox.png': ['Вместительный ящик с инструментами', 3],
  'Toolboxes/Engineer_s Toolbox.png': ['Инструменты инженера', 4],
  'Toolboxes/Alex_s Toolbox.png': ['Ящик Алекса', 4],
  'Maps/Cryptic Map.png': ['Загадочная карта', 1],
  'Maps/Scribbled Map.png': ['Небрежная карта', 2],
  'Maps/Annotated Map.png': ['Карта с подписями', 3],
  'Keys/Broken Key.png': ['Сломанный ключ', 1],
  'Keys/Dull Key.png': ['Потертый ключ', 2],
  'Keys/Skeleton Key.png': ['Ключ скелета', 3],
  'Flashlights/Flashlight.png': ['Фонарик', 2],
  'Flashlights/Sport Flashlight.png': ['Спортивный фонарик', 3],
  'Flashlights/Utility Flashlight.png': ['Рабочий фонарик', 4],
  'Fog Vials/Apprentice_s Fog Vial.png': ['Флакон подмастерья с туманом', 1],
  'Fog Vials/Artisan_s Fog Vial.png': ['Флакон мастерового с туманом', 2],
  'Fog Vials/Vigo_s Fog Vial.png': ['Флакон Виго с туманом', 3],
  'Firecrackers/Chinese Firecracker.png': ['Китайская петарда', 1],
  'Firecrackers/Winter Party Starter.png': ['Зимний заводила вечеринок', 2],
  'Firecrackers/Third Year Party Starter.png': ['Заводила вечеринок третьего года', 2],
};
const items = [];
for (const cat of readdirSync(join(SHOP, 'Items'))) {
  for (const f of files(join(SHOP, 'Items', cat))) {
    const key = `${cat}/${f}`;
    const meta = ITEMS[key];
    if (!meta) { missing.push(`item: ${key}`); continue; }
    items.push({ name: meta[0], rarity: meta[1], src: `../CaptainShop/Items/${cat}/${f}` });
  }
}

const KILLER_OVERRIDES = { 'Shape Variant': 'ФОРМА', 'T_UI_K42_TheFirst_Portrait': 'ПЕРВЫЙ' };
const killers = files(join(SHOP, 'killerIcons')).map(f => {
  const en = base(f);
  let ru = killerRu[en] || KILLER_OVERRIDES[en];
  if (!ru) { missing.push(`killerIcon: ${en}`); ru = en; }
  return { name: titleCase(ru.toLowerCase()), src: `../CaptainShop/killerIcons/${f}`, idx: orderIdx(KILLER_ORDER, en, 'убийца') };
}).sort((a, b) => a.idx - b.idx).map(({ idx, ...k }) => k);

const SURV_OVERRIDES = { 'Shane Wiigwaas': 'Шейн Вигваас' };
const icons = files(join(SHOP, 'SurvivorIcons')).map(f => {
  const en = base(f);
  let ru = survRu[en] || SURV_OVERRIDES[en];
  if (!ru) { missing.push(`survIcon: ${en}`); ru = en; }
  return { name: ru, src: `../CaptainShop/SurvivorIcons/${f}`, idx: orderIdx(SURVIVOR_ORDER, en, 'выживший') };
}).sort((a, b) => a.idx - b.idx).map(({ idx, ...s }) => s);

const data = { killers, icons, killerPerks, survivorPerks, items };
writeFileSync(join(ROOT, 'TeamRandomiser/data.json'), JSON.stringify(data, null, 1), 'utf8');
console.log(`killers=${killers.length} survivors=${icons.length} killerPerks=${killerPerks.length} survivorPerks=${survivorPerks.length} items=${items.length}`);
if (missing.length) { console.log('\nБез перевода / без метаданных:'); missing.forEach(m => console.log(' - ' + m)); }
