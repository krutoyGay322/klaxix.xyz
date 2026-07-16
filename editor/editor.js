// Editor for events.json. Nothing here writes to disk — you edit in the browser,
// download the file, and commit it to GitHub.

const EVENTS_URL = '../events.json';
const WEEKDAYS_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

let events = [];
let editingIndex = null; // null = the form is adding rather than editing

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const byDate = (a, b) =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('notice--info', !isError);
}

// --- Serialisation ----------------------------------------------------------

/** Field order is fixed so re-saving an unchanged file produces no git diff.
 *  `vod` is only written when set, so old files stay byte-identical. */
const toJSON = () => JSON.stringify(
  { events: [...events].sort(byDate).map(ev => {
      const out = { date: ev.date, time: ev.time, type: ev.type, title: ev.title, desc: ev.desc };
      if (ev.vod) out.vod = ev.vod;
      return out;
    }) },
  null, 2
) + '\n';

function refresh() {
  renderList();
  $('json-preview').textContent = toJSON();
  $('count').textContent = events.length;
}

// --- List -------------------------------------------------------------------

function renderList() {
  const today = startOfToday();
  const sorted = [...events].sort(byDate);

  $('empty').hidden = sorted.length > 0;

  $('list').replaceChildren(...sorted.map(ev => {
    const index = events.indexOf(ev);
    const type = typeOf(ev.type);
    const date = parseDate(ev.date);

    const row = document.createElement('div');
    row.className = 'row';
    if (index === editingIndex) row.classList.add('row--editing');
    if (date < today) row.classList.add('row--past');
    row.style.setProperty('--event-color', type.color);

    const when = document.createElement('div');
    when.className = 'row__date';
    when.innerHTML = '';
    const dayLine = document.createElement('div');
    dayLine.className = 'row__day';
    dayLine.textContent = `${WEEKDAYS_SHORT[date.getDay()]} ${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
    const timeLine = document.createElement('div');
    timeLine.textContent = `${ev.time} · ${date.getFullYear()}`;
    when.append(dayLine, timeLine);

    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('div');
    title.className = 'row__title';
    title.textContent = ev.title;
    const badge = document.createElement('div');
    badge.className = 'row__type';
    badge.textContent = type.badge;
    if (ev.vod) {
      const vodTag = document.createElement('span');
      vodTag.className = 'row__vod';
      vodTag.textContent = '▶ VOD';
      badge.append(' ', vodTag);
    }
    main.append(title, badge);

    const actions = document.createElement('div');
    actions.className = 'row__actions';

    const edit = document.createElement('button');
    edit.className = 'iconbtn';
    edit.type = 'button';
    edit.textContent = 'Изменить';
    edit.addEventListener('click', () => startEdit(index));

    const del = document.createElement('button');
    del.className = 'iconbtn iconbtn--danger';
    del.type = 'button';
    del.textContent = 'Удалить';
    del.addEventListener('click', () => remove(index));

    actions.append(edit, del);
    row.append(when, main, actions);
    return row;
  }));
}

// --- Form -------------------------------------------------------------------

function fillTypeSelect() {
  $('f-type').replaceChildren(...EVENT_TYPES.map(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.legend;
    return opt;
  }));
}

function resetForm() {
  editingIndex = null;
  $('event-form').reset();
  $('f-time').value = '14:00';
  $('form-title').textContent = 'Новый ивент';
  $('submit-btn').textContent = 'Добавить';
  $('cancel-btn').hidden = true;
  $('form-error').hidden = true;
  renderList();
}

function startEdit(index) {
  const ev = events[index];
  editingIndex = index;
  $('f-date').value = ev.date;
  $('f-time').value = ev.time;
  $('f-type').value = ev.type;
  $('f-title').value = ev.title;
  $('f-desc').value = ev.desc;
  $('f-vod').value = ev.vod || '';
  $('form-title').textContent = 'Изменить ивент';
  $('submit-btn').textContent = 'Сохранить';
  $('cancel-btn').hidden = false;
  $('form-error').hidden = true;
  renderList();
  $('f-title').focus();
}

function remove(index) {
  if (!confirm(`Удалить «${events[index].title}»?`)) return;
  events.splice(index, 1);
  // Editing indices shift when an earlier item disappears.
  if (editingIndex === index) resetForm();
  else if (editingIndex !== null && index < editingIndex) editingIndex--;
  refresh();
}

function showError(message) {
  const el = $('form-error');
  el.textContent = message;
  el.hidden = false;
}

$('event-form').addEventListener('submit', e => {
  e.preventDefault();

  const draft = {
    date: $('f-date').value,
    time: $('f-time').value,
    type: $('f-type').value,
    title: $('f-title').value.trim(),
    desc: $('f-desc').value.trim(),
    vod: $('f-vod').value.trim(),
  };

  if (!draft.date) return showError('Укажи дату.');
  if (!draft.title) return showError('Укажи название.');
  if (draft.vod && !/^https?:\/\//.test(draft.vod)) {
    return showError('Ссылка на VOD должна начинаться с http:// или https://');
  }

  // One event per day — the calendar cell only has room for one.
  const clash = events.findIndex((ev, i) => ev.date === draft.date && i !== editingIndex);
  if (clash !== -1) {
    return showError(`На ${draft.date} уже есть «${events[clash].title}». Удали или измени его.`);
  }

  if (editingIndex === null) events.push(draft);
  else events[editingIndex] = draft;

  resetForm();
  refresh();
});

$('cancel-btn').addEventListener('click', resetForm);

// --- Import / export --------------------------------------------------------

/** Accepts either {events:[…]} or a bare […] array. */
function adopt(data, source) {
  const list = Array.isArray(data) ? data : data?.events;
  if (!Array.isArray(list)) throw new Error('в файле нет массива "events"');

  events = list.map(ev => ({
    date: String(ev.date || '').slice(0, 10),
    time: String(ev.time || '14:00').slice(0, 5),
    type: TYPES_BY_ID.has(ev.type) ? ev.type : FALLBACK_TYPE.id,
    title: String(ev.title || 'Без названия'),
    desc: String(ev.desc || ''),
    vod: String(ev.vod || ''),
  })).filter(ev => /^\d{4}-\d{2}-\d{2}$/.test(ev.date));

  setStatus(`Загружено ${events.length} ${events.length === 1 ? 'ивент' : 'ивентов'} из ${source}.`);
  refresh();
}

$('import-btn').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    adopt(JSON.parse(await file.text()), file.name);
  } catch (err) {
    setStatus(`Не смог прочитать файл: ${err.message}`, true);
  }
  e.target.value = ''; // let the same file be picked again
});

$('download-btn').addEventListener('click', () => {
  const blob = new Blob([toJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'events.json';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Скачано. Теперь залей events.json в репозиторий вместо старого.');
});

$('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(toJSON());
    setStatus('JSON скопирован в буфер обмена.');
  } catch {
    setStatus('Браузер не дал доступ к буферу — открой "Показать JSON" и скопируй вручную.', true);
  }
});

// --- Init -------------------------------------------------------------------

async function init() {
  fillTypeSelect();
  setStatus('Загружаю events.json…');

  try {
    const res = await fetch(EVENTS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    adopt(await res.json(), 'events.json');
  } catch (err) {
    events = [];
    refresh();
    setStatus(
      `Не удалось загрузить events.json (${err.message}). Начни с нуля или нажми «Загрузить свой JSON».`,
      true
    );
  }
}

init();
