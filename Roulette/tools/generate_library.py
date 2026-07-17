# tools/generate_library.py
"""Regenerates data/library.js for the standalone roulette.

Run from anywhere:  python tools/generate_library.py
(paths are resolved relative to this file, so the folder can live anywhere).

Ports the data half of DBDStreaming's modules/perk_randomizer.py and
modules/rolls.py:
  - scans survivorPerks/ + killerPerks/ for every perk icon (reel-fill library)
  - scans survivorIcons/ + killerIcons/ for character portraits
  - parses data/SurvivorPerks.json + data/KillerPerks.json (tolerating the
    missing-comma format) and resolves each perk's icon path through the
    Russian-name -> English-filename maps in data/*.json

Everything is emitted as ONE JS file (window.ROULETTE_DATA) so index.html
works from file:// with zero fetch()/server.
"""
import os
import re
import json
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, "data", "library.js")


def load_json(*parts):
    path = os.path.join(ROOT, *parts)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"WARNING: failed to load {path}: {e}")
        return {}


def parse_perks_file(path):
    """Tolerant parse (SurvivorPerks.json omits commas between objects)."""
    if not os.path.exists(path):
        print(f"WARNING: {path} not found")
        return []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if content.startswith('['):
        content = content[1:]
    if content.endswith(']'):
        content = content[:-1]
    fixed = '[' + re.sub(r'\}\s*\{', '},{', content.strip()) + ']'
    try:
        data = json.loads(fixed)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError as e:
        print(f"ERROR parsing {os.path.basename(path)}: {e}")
        return []


def scan_perk_library(folder):
    """Every perk icon under <folder>/<character>/*.png -> [{name, icon}]."""
    items = []
    base = os.path.join(ROOT, folder)
    for path in sorted(glob.glob(os.path.join(base, "*", "*.png"))):
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        items.append({"name": os.path.splitext(os.path.basename(path))[0], "icon": rel})
    return items


def scan_characters(folder):
    """Character portraits <folder>/*.{png,webp,jpg} -> [{name, image}]."""
    items = []
    base = os.path.join(ROOT, folder)
    for ext in ("*.png", "*.webp", "*.jpg"):
        for path in sorted(glob.glob(os.path.join(base, ext))):
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            items.append({"name": os.path.splitext(os.path.basename(path))[0], "image": rel})
    return items


def find_icon_anywhere(folder, filename):
    """Fallback: search every character dir for '<filename>.png'."""
    matches = glob.glob(os.path.join(ROOT, folder, "*", filename + ".png"))
    if matches:
        return os.path.relpath(matches[0], ROOT).replace(os.sep, "/")
    return None


def build_pool(role, pool_json, char_map, perk_map, folder, default_folder, name_key):
    """Resolve each rolled-perk entry to a real on-disk icon path."""
    pool = []
    dropped = []
    for item in parse_perks_file(os.path.join(ROOT, "data", pool_json)):
        ru_char = item.get(name_key, default_folder)
        ru_perk = item.get("perk_name", "")
        if not ru_perk:
            continue
        en_char = char_map.get(ru_char, default_folder)
        if role == "killer":
            en_file = perk_map.get(ru_char, {}).get(ru_perk, ru_perk)
        else:
            en_file = perk_map.get(ru_perk, ru_perk)

        image = f"{folder}/{en_char}/{en_file}.png"
        if not os.path.exists(os.path.join(ROOT, image)):
            image = find_icon_anywhere(folder, en_file)
        if not image:
            dropped.append(f"{ru_perk} ({ru_char})")
            continue
        pool.append({
            "name": ru_perk,
            "survivor": ru_char,
            "description": item.get("description", ""),
            "image": image,
        })
    if dropped:
        print(f"WARNING [{role}]: {len(dropped)} perk(s) dropped (icon not found):")
        for d in dropped[:10]:
            print(f"  - {d}")
        if len(dropped) > 10:
            print(f"  ... and {len(dropped) - 10} more")
    return pool


def main():
    survivor_map = load_json("data", "survivor_map.json")
    perk_map = load_json("data", "perk_map.json")
    killer_map = load_json("data", "killer_map.json")
    killer_perk_map = load_json("data", "killer_perk_map.json")

    data = {
        "survivorPerkLibrary": scan_perk_library("survivorPerks"),
        "killerPerkLibrary": scan_perk_library("killerPerks"),
        "survivorCharacters": scan_characters("survivorIcons"),
        "killerCharacters": scan_characters("killerIcons"),
        "survivorPerkPool": build_pool(
            "survivor", "SurvivorPerks.json", survivor_map, perk_map,
            "survivorPerks", "General Survivor", "survivor_name"),
        "killerPerkPool": build_pool(
            "killer", "KillerPerks.json", killer_map, killer_perk_map,
            "killerPerks", "General Killer", "killer_name"),
    }

    js = ("// AUTO-GENERATED by tools/generate_library.py — do not edit by hand.\n"
          "window.ROULETTE_DATA = "
          + json.dumps(data, ensure_ascii=False, indent=1)
          + ";\n")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"OK: wrote {OUT_PATH}")
    for k, v in data.items():
        print(f"  {k}: {len(v)}")


if __name__ == "__main__":
    main()
