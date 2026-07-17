# Магазин Капитана — устройство и обслуживание

Самодостаточное статическое приложение: HTML + CSS + JavaScript,
без сборки, без фреймворков, без зависимостей. Работает даже с `file://`
(двойной клик по `index.html`).

## Где что лежит

```
index.html              Точка входа: шрифты, styles.css и src/main.js
src/
  main.js               Бутстрап: восстановление сейва, рендер, resize, угли
  view.js               Весь UI как функции, возвращающие HTML-строки (визуал правится здесь)
  actions.js            Превращает клики/драги в игровые действия
  game.js               Игровая логика (покупка, выдача, шрайн, драг, undo, …)
  styles.css            Keyframe-анимации + hover-стили
  core/
    dom.js              Рендер-движок ~120 строк (keyed DOM morphing)
    store.js            Состояние + localStorage-сейв + история undo
    audio.js            Процедурные звуки (Web Audio)
    embers.js           Фоновые угли (canvas)
  data/
    perks.js            Перки выживших (имя, картинка, тир)
    killerPerks.js      Перки убийц
    perkDesc.js         Описания перков (русские)
    survivorIcons.js    Имена файлов портретов выживших
    killerIcons.js      Пути портретов убийц
    config.js           Цвета тиров, RARITY, каталог ITEMS, экономика (PROPS)

assets/ survivorPerks/ killerPerks/ killerIcons/ SurvivorIcons/ Items/   картинки
_legacy/                старая версия на фреймворке (в гит не попадает, можно удалить)
```

## Частые правки

- **Ребаланс экономики** (цены / выплаты / стартовый баланс): `src/data/config.js` → `PROPS`.
- **Редкости предметов / шансы дропа**: `src/data/config.js` → `RARITY` (цвета + `weight`)
  и `ITEMS` (каталог: имя, редкость, картинка).
- **Добавить/изменить перк выжившего**: `src/data/perks.js` (+ описание в `perkDesc.js`);
  картинку — в `survivorPerks/TierN/`.
- **Добавить/изменить перк убийцы**: `src/data/killerPerks.js`; картинку — в `killerPerks/Tier N/`.
- **Поменять вид секции**: найди функцию секции в `src/view.js`
  (`header`, `reel`, `shrine`, `survivors`, `killer`, `overlays`, `popup`).
- **Поменять анимацию**: `src/styles.css` (`@keyframes`).

## Как работает рендер (коротко)

Состояние живёт в `src/core/store.js`. При изменении `view.js` строит свежую
HTML-строку, а `core/dom.js` *морфит* её на живую страницу — патчит только то,
что изменилось, вместо полной перестройки. Именно это сохраняет плавным спин
барабана, canvas с углями, идущие анимации и фокус текстовых полей — без React.
