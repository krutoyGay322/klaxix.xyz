# -*- coding: utf-8 -*-
"""Generates ../js/data.js for the Killer Shop.

Scans:
  - KillerShop/killerShopSpecificKillerPerks/<X> tier/*.png  -> killer perk pools S..F
  - assets/dbd/survivorPerks/Tier0..3/*.png                  -> survivor perk pools 0..3
  - assets/dbd/items/<Category>/*.png                        -> item shop
  - assets/dbd/survivorIcons, killerIcons                    -> character rosters

Russian names come from Roulette/data/perk_map.json, killer_perk_map.json,
survivor_map.json, killer_map.json and descriptions from
assets/dbd/survivorPerks/SurvivorPerks.json.

Run:  python -X utf8 tools/generate_data.py   (from KillerShop/)
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SHOP = os.path.dirname(HERE)                       # KillerShop/
ROOT = os.path.dirname(SHOP)                       # repo root
DBD = os.path.join(ROOT, "assets", "dbd")
RDATA = os.path.join(ROOT, "Roulette", "data")

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

def stem(fn):
    return os.path.splitext(fn)[0]

def pretty_en(s):
    # file stems use _ instead of apostrophes: Dead Man_s Switch -> Dead Man's Switch
    s = re.sub(r"\s*\(\d+\)$", "", s)              # "Nemesis (1)" -> "Nemesis"
    return s.replace("_", "'")

def pngs(folder):
    return sorted(
        f for f in os.listdir(folder)
        if f.lower().endswith((".png", ".webp", ".jpg"))
    )

# ---------- name maps ----------
perk_ru = {en: ru for ru, en in load(os.path.join(RDATA, "perk_map.json")).items()}
surv_ru = {en: ru for ru, en in load(os.path.join(RDATA, "survivor_map.json")).items()}
killer_ru = {en: ru for ru, en in load(os.path.join(RDATA, "killer_map.json")).items()}
kperk_ru = {}
for _killer, perks in load(os.path.join(RDATA, "killer_perk_map.json")).items():
    for ru, en in perks.items():
        kperk_ru[en] = ru

# names missing from the Roulette maps
kperk_ru.setdefault("No Holds Barred", "НИКАКИХ ЗАПРЕТОВ")
kperk_ru.setdefault("Scourge Hook Weeping Wounds", "СЕКУЩИЙ КРЮК: ПЛАЧУЩИЕ РАНЫ")
kperk_ru.setdefault("Hex Fortune_s Fool", "ПОРЧА: ШУТ ФОРТУНЫ")
surv_ru.setdefault("Shane Wiigwaas", "Шейн Виигваас")
killer_ru.setdefault("Shape Variant", "ТЕНЬ")
killer_ru.setdefault("T_UI_K42_TheFirst_Portrait", "ПЕРВЫЙ")

desc_by_ru = {
    p["perk_name"]: p["description"]
    for p in load(os.path.join(DBD, "survivorPerks", "SurvivorPerks.json"))
}

unmatched = []

# ---------- killer perks (shop-specific tier folders) ----------
killer_perks = {}
for t in "SABCDF":
    folder = os.path.join(SHOP, "killerShopSpecificKillerPerks", f"{t} tier")
    pool = []
    for fn in pngs(folder):
        st = stem(fn)
        key = re.sub(r"\s*\(\d+\)$", "", st)
        ru = kperk_ru.get(key)
        if not ru:
            unmatched.append(("killer perk", st))
        pool.append({
            "name": ru or pretty_en(st),
            "img": f"killerShopSpecificKillerPerks/{t} tier/{fn}",
        })
    killer_perks[t] = pool

# ---------- survivor perks (shared asset tiers) ----------
survivor_perks = {}
for t in range(4):
    folder = os.path.join(DBD, "survivorPerks", f"Tier{t}")
    pool = []
    for fn in pngs(folder):
        st = stem(fn)
        ru = perk_ru.get(st)
        if not ru:
            unmatched.append(("survivor perk", st))
        pool.append({
            "name": ru or pretty_en(st),
            "desc": desc_by_ru.get(ru, ""),
            "img": f"../assets/dbd/survivorPerks/Tier{t}/{fn}",
        })
    survivor_perks[str(t)] = pool

# ---------- items ----------
# rarity + russian names: base list from CaptainShop/items.json conventions,
# extended with the variants that exist only as assets.
RARITY_PRICE = {
    "Обычный": 300,
    "Необычный": 350,
    "Редкий": 400,
    "Очень редкий": 500,
    "Событие": 250,
}
ITEM_INFO = {  # file stem -> (russian name, rarity) — mirrors CaptainShop/src/data/config.js
    # Medkits
    "Camping Aid Kit": ("Походная аптечка", "Обычный"),
    "Emergency Med Kit": ("Аптечка", "Необычный"),
    "First Aid Kit": ("Аптечка первой помощи", "Редкий"),
    "Ranger Med Kit": ("Аптечка лесничего", "Очень редкий"),
    # Toolboxes
    "Worn-Out Toolbox": ("Изношенные инструменты", "Обычный"),
    "Toolbox": ("Ящик с инструментами", "Необычный"),
    "Mechanic_s Toolbox": ("Инструменты механика", "Редкий"),
    "Commodious Toolbox": ("Вместительный ящик с инструментами", "Редкий"),
    "Engineer_s Toolbox": ("Инструменты инженера", "Очень редкий"),
    "Alex_s Toolbox": ("Инструменты Алекс", "Очень редкий"),
    # Flashlights
    "Flashlight": ("Фонарик", "Необычный"),
    "Sport Flashlight": ("Спортивный фонарик", "Редкий"),
    "Utility Flashlight": ("Практичный фонарик", "Очень редкий"),
    # Keys
    "Broken Key": ("Сломанный ключ", "Обычный"),
    "Dull Key": ("Потертый ключ", "Необычный"),
    "Skeleton Key": ("Ключ скелета", "Редкий"),
    # Maps
    "Cryptic Map": ("Загадочная карта", "Обычный"),
    "Scribbled Map": ("Небрежная карта", "Необычный"),
    "Annotated Map": ("Карта с подписями", "Редкий"),
    # Fog vials
    "Apprentice_s Fog Vial": ("Флакон подмастерья с туманом", "Обычный"),
    "Artisan_s Fog Vial": ("Флакон мастерового с туманом", "Необычный"),
    "Vigo_s Fog Vial": ("Флакон Виго с туманом", "Редкий"),
    # Firecrackers — event items, event rarity (yellow)
    "Chinese Firecracker": ("Китайская петарда", "Событие"),
    "Third Year Party Starter": ("Праздничная петарда", "Событие"),
    "Winter Party Starter": ("Зимняя петарда", "Событие"),
}
CATEGORY_RU = {
    "Medkits": "Аптечки",
    "Toolboxes": "Инструменты",
    "Flashlights": "Фонарики",
    "Keys": "Ключи",
    "Maps": "Карты",
    "Fog Vials": "Флаконы с туманом",
    "Firecrackers": "Петарды",
}
CATEGORY_ORDER = ["Medkits", "Toolboxes", "Flashlights", "Maps", "Keys", "Fog Vials", "Firecrackers"]
# what the shop actually sells - the other asset variants are excluded from stock
ITEM_STOCK = {
    "Ranger Med Kit",                          # аптечки: только фиолетовая
    "Alex_s Toolbox", "Engineer_s Toolbox",    # инструменты: две фиолетовые
    "Sport Flashlight", "Utility Flashlight",  # фонарики: синий и фиолетовый
    "Skeleton Key",                            # ключи: только синий
    "Annotated Map",                           # карты: только синяя
    "Apprentice_s Fog Vial", "Artisan_s Fog Vial", "Vigo_s Fog Vial",
    "Third Year Party Starter",                # петарды: только одна
}

items = []
for cat in CATEGORY_ORDER:
    folder = os.path.join(DBD, "items", cat)
    for fn in pngs(folder):
        st = stem(fn)
        if st not in ITEM_STOCK:
            continue
        info = ITEM_INFO.get(st)
        if not info:
            unmatched.append(("item", st))
            info = (pretty_en(st), "Обычный")
        name, rarity = info
        items.append({
            "name": name,
            "cat": CATEGORY_RU[cat],
            "rarity": rarity,
            "price": RARITY_PRICE[rarity],
            "img": f"../assets/dbd/items/{cat}/{fn}",
        })
# sort variants inside a category by price so cheap items come first
order = {c: i for i, c in enumerate(CATEGORY_RU.values())}
items.sort(key=lambda it: (order[it["cat"]], it["price"], it["name"]))

# ---------- rosters ----------
# DBD chapter release order (file stems). New characters go to the end until added here.
SURVIVOR_ORDER = [
    "Dwight Fairfield", "Meg Thomas", "Claudette Morel", "Jake Park", "Nea Karlsson",
    "Laurie Strode", "Ace Visconti", "Bill Overbeck", "Feng Min", "David King",
    "Quentin Smith", "David Tapp", "Kate Denson", "Adam Francis", "Jeff Johansen",
    "Jane Romero", "Ash Williams", "Nancy Wheeler", "Steve Harrington", "Yui Kimura",
    "Zarina Kassir", "Cheryl Mason", "Felix Richter", "Elodie Rakoto", "Yun-Jin Lee",
    "Jill Valentine", "Leon S Kennedy", "Mikaela Reid", "Jonah Vasquez", "Yoichi Asakawa",
    "Haddie Kaur", "Ada Wong", "Rebecca Chambers", "Vittorio Toscano", "Thalita Lyra",
    "Renato Lyra", "Gabriel Soma", "Nicolas Cage", "Ellen Ripley", "Alan Wake",
    "Sable Ward", "Aestri Yazar", "Lara Croft", "Trevor Belmont", "Taurie Cain",
    "Orela Rose", "Rick Grimes", "Michonne Grimes", "Vee Boonyasak", "Dustin Henderson",
    "Eleven", "Kwon Tae-young", "Shane Wiigwaas",
]
KILLER_ORDER = [
    "Trapper", "Wraith", "Hillbilly", "Nurse", "Shape Variant",
    "Hag", "Doctor", "Huntress", "Cannibal", "Nightmare",
    "Pig", "Clown", "Spirit", "Legion", "Plague",
    "Ghostface", "Demogorgon", "Oni", "Deathslinger", "Executioner",
    "Blight", "Twins", "Trickster", "Nemesis", "Cenobite",
    "Artist", "Onryo", "Dredge", "Mastermind", "Knight",
    "Skull Merchant", "Singularity", "Xenomorph", "Good Guy", "Unknown",
    "Lich", "Dark Lord", "Houndmaster", "Ghoul", "Animatronic",
    "Krasue", "T_UI_K42_TheFirst_Portrait", "Slasher",
]

def roster(folder, ru_map, order):
    idx = {n: i for i, n in enumerate(order)}
    out = []
    for fn in pngs(os.path.join(DBD, folder)):
        st = stem(fn)
        ru = ru_map.get(st)
        if not ru:
            unmatched.append((folder, st))
        if st not in idx:
            unmatched.append((folder + " (release order)", st))
        out.append({"_st": st, "name": ru or pretty_en(st), "img": f"../assets/dbd/{folder}/{fn}"})
    out.sort(key=lambda c: (idx.get(c["_st"], len(order)), c["name"].lower()))
    for c in out:
        del c["_st"]
    return out

survivors = roster("survivorIcons", surv_ru, SURVIVOR_ORDER)
killers = roster("killerIcons", killer_ru, KILLER_ORDER)

data = {
    "killerPerks": killer_perks,
    "survivorPerks": survivor_perks,
    "items": items,
    "survivors": survivors,
    "killers": killers,
}

out_path = os.path.join(SHOP, "js", "data.js")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    f.write("// AUTO-GENERATED by tools/generate_data.py — do not edit by hand.\n")
    f.write("window.SHOP_DATA = ")
    f.write(json.dumps(data, ensure_ascii=False, indent=1))
    f.write(";\n")

print(f"written {out_path}")
print(f"killer perks: " + ", ".join(f"{t}={len(killer_perks[t])}" for t in "SABCDF"))
print(f"survivor perks: " + ", ".join(f"T{t}={len(survivor_perks[str(t)])}" for t in range(4)))
print(f"items: {len(items)}, survivors: {len(survivors)}, killers: {len(killers)}")
if unmatched:
    print(f"\n{len(unmatched)} entries without a russian name (fallback to english):")
    for kind, name in unmatched:
        print(f"  [{kind}] {name}")
