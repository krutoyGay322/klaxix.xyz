// Events live in events.json — edit them with editor.html, not by hand.
const EVENTS_URL = 'events.json';

const MONTH_NAMES = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
const MONTH_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

let eventsByDate = new Map();

const pad = n => String(n).padStart(2, '0');

/** '2026-07-18' -> local Date. Parsed by hand because `new Date(str)` reads a
 *  bare ISO date as UTC, which shifts the day for anyone behind Greenwich. */
function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Midnight today — so an event happening today still counts as upcoming. */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function plural(n, one, few, many) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// --- Legend -----------------------------------------------------------------

function renderLegend() {
  const legend = document.getElementById('legend');
  legend.replaceChildren(...EVENT_TYPES.map(t => {
    const item = document.createElement('span');
    item.className = 'legend__item';
    item.style.color = t.color;
    item.textContent = `■ ${t.legend}`;
    return item;
  }));
}

// --- Hero: the next upcoming event ------------------------------------------

function renderHero(events) {
  const today = startOfToday();
  const upcoming = events
    .filter(ev => parseDate(ev.date) >= today)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date))[0];

  const hero = document.getElementById('hero');
  if (!upcoming) {
    hero.hidden = true;
    return;
  }

  const date = parseDate(upcoming.date);
  const type = typeOf(upcoming.type);
  const daysLeft = Math.round((date - today) / 86400000);

  document.getElementById('hero-next').textContent =
    `СЛЕДУЮЩИЙ: ${WEEKDAYS_SHORT[date.getDay()]} ${pad(date.getDate())}.${pad(date.getMonth() + 1)} / ${upcoming.time}`;
  document.getElementById('hero-title').textContent = upcoming.title.toUpperCase();
  document.getElementById('hero-desc').textContent = upcoming.desc;

  const badge = document.getElementById('hero-type');
  badge.textContent = type.badge;
  badge.style.color = type.color;

  document.getElementById('hero-countdown').textContent = daysLeft === 0
    ? 'СЕГОДНЯ'
    : `−${daysLeft} ${plural(daysLeft, 'ДЕНЬ', 'ДНЯ', 'ДНЕЙ')}`;

  hero.hidden = false;
}

// --- Calendar grid ----------------------------------------------------------

const view = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
})();

function makeEmptyCell() {
  const cell = document.createElement('div');
  cell.className = 'day day--empty';
  return cell;
}

function makeDayCell(day) {
  const today = startOfToday();
  const event = eventsByDate.get(`${view.year}-${pad(view.month)}-${pad(day)}`);
  const isToday = view.year === today.getFullYear()
    && view.month === today.getMonth() + 1
    && day === today.getDate();

  const cell = document.createElement(event ? 'button' : 'div');
  cell.className = 'day';
  if (isToday) cell.classList.add('day--today');
  if (event) {
    const type = typeOf(event.type);
    cell.classList.add('day--event');
    cell.type = 'button';
    cell.style.setProperty('--event-color', type.color);
    cell.addEventListener('click', () => openModal(event));
  }

  const num = document.createElement('span');
  num.className = 'day__num';
  num.textContent = day;
  cell.append(num);

  if (event) {
    const row = document.createElement('div');
    row.className = 'day__event';
    const dot = document.createElement('div');
    dot.className = 'day__dot';
    const label = document.createElement('div');
    label.className = 'day__label';
    label.textContent = event.title;
    row.append(dot, label);
    if (event.vod) {
      const play = document.createElement('span');
      play.className = 'day__vod';
      play.textContent = '▶';
      row.append(play);
    }
    cell.append(row);
  } else if (isToday) {
    const mark = document.createElement('div');
    mark.className = 'day__today';
    mark.textContent = 'сегодня';
    cell.append(mark);
  }

  return cell;
}

function renderCalendar() {
  document.getElementById('month-label').textContent =
    `// ${MONTH_NAMES[view.month - 1]} ${view.year}`;

  const first = new Date(view.year, view.month - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const numDays = new Date(view.year, view.month, 0).getDate();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(makeEmptyCell());
  for (let day = 1; day <= numDays; day++) cells.push(makeDayCell(day));
  while (cells.length % 7 !== 0) cells.push(makeEmptyCell());

  document.getElementById('days').replaceChildren(...cells);
}

function shiftMonth(delta) {
  const next = new Date(view.year, view.month - 1 + delta, 1);
  view.year = next.getFullYear();
  view.month = next.getMonth() + 1;
  renderCalendar();
}

// --- Modal ------------------------------------------------------------------

const modal = document.getElementById('modal');

function openModal(event) {
  const date = parseDate(event.date);
  const type = typeOf(event.type);

  const badge = document.getElementById('modal-type');
  badge.textContent = type.badge;
  badge.style.color = type.color;

  document.getElementById('modal-title').textContent = event.title;
  document.getElementById('modal-when').textContent =
    `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_GENITIVE[date.getMonth()]} · ${event.time}`;
  document.getElementById('modal-desc').textContent = event.desc;

  const vod = document.getElementById('modal-vod');
  if (event.vod) {
    vod.href = event.vod;
    vod.hidden = false;
  } else {
    vod.hidden = true;
  }

  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});
document.getElementById('modal-close').addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// --- Init -------------------------------------------------------------------

document.getElementById('prev-month').addEventListener('click', () => shiftMonth(-1));
document.getElementById('next-month').addEventListener('click', () => shiftMonth(1));

async function loadEvents() {
  const res = await fetch(EVENTS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  const events = Array.isArray(data) ? data : data.events;
  if (!Array.isArray(events)) throw new Error('events.json: нет массива "events"');
  return events;
}

async function init() {
  renderLegend();

  let events = [];
  try {
    events = await loadEvents();
  } catch (err) {
    // The calendar still renders (empty) so the page never looks dead.
    document.getElementById('load-error').hidden = false;
    console.error('Не удалось загрузить events.json:', err);
  }

  eventsByDate = new Map(events.map(ev => [ev.date, ev]));
  renderHero(events);
  renderCalendar();
}

init();
