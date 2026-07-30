# Магазин убийцы (Killer Shop)

Мини-игра в стиле Horror UI Kit: убийца крутит «Дьявольскую рулетку», собирает себе перки
и продаёт перки/предметы выжившим за клетки крови.

## Структура

- `index.html` — разметка (каркас, динамические области заполняет JS)
- `css/style.css` — все стили и анимации
- `js/app.js` — логика (рулетка, продажа, объединение перков, оверлеи)
- `js/data.js` — **генерируется** скриптом `tools/generate_data.py`, не редактировать руками
- `killerShopSpecificKillerPerks/<S..F> tier/` — иконки перков убийцы по тирам магазина
- `assets/Auric_Cell.png` — валюта
- `_legacy/Killer Shop.dc.html` — исходный прототип (DC-компонент), больше не используется

## Данные

`tools/generate_data.py` собирает `js/data.js` из:

- перки убийцы — `killerShopSpecificKillerPerks/` (тиры S/A/B/C/D/F)
- перки выживших — `../assets/dbd/survivorPerks/Tier0..3` + описания из `SurvivorPerks.json`
- предметы — `../assets/dbd/items/` (редкости в стиле Лавки капитана)
- портреты — `../assets/dbd/survivorIcons`, `../assets/dbd/killerIcons`
- русские названия — карты из `../Roulette/data/*.json`

Перегенерация (из папки `KillerShop/`):

```bash
python -X utf8 tools/generate_data.py
```
