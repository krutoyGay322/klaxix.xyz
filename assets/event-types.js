// Shared between index.html and editor.html.
// The `id` is what gets stored in events.json; badge/legend/color are display only.
// To add a new event type, add a row here — the legend and the editor dropdown
// both build themselves from this list.
const EVENT_TYPES = [
  { id: 'stream',  badge: 'СТРИМ',             legend: 'Стрим',       color: '#e8a33d' },
  { id: 'tourney', badge: 'ХЕРНЯТУРИК',        legend: 'ХЕРНЯТурик',  color: '#65c5a6' },
  { id: 'event',   badge: 'ИВЕНТ',             legend: 'Ивент',       color: '#e07a6a' },
  { id: 'shoot',   badge: 'СЪЕМКИ',            legend: 'Съемки',      color: '#a98ede' },
  { id: 'sponsor', badge: 'СПОНСОРСКИЙТУРНИР', legend: 'СПОНСОРСКИЙ', color: '#7db2dc' },
];

const TYPES_BY_ID = new Map(EVENT_TYPES.map(t => [t.id, t]));
const FALLBACK_TYPE = { id: 'event', badge: 'ИВЕНТ', legend: 'Ивент', color: '#e07a6a' };

/** Unknown type ids fall back rather than throwing, so a typo in events.json
 *  degrades to a visible event instead of a blank calendar. */
const typeOf = id => TYPES_BY_ID.get(id) || FALLBACK_TYPE;
