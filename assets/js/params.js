// Разбор query-параметров табло: режим киоска и настройки в ссылке.
// Чистый ESM-модуль: используется страницей и тестами (node --test).

export const CURRENCIES = ['₸', '₽', '$', '€'];
export const THEMES = ['night', 'day'];
export const ANIMATIONS = ['flap', 'slide', 'fade'];
export const MODES = ['before', 'nearest'];

const TRUTHY = new Set(['', '1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

export function parseBool(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  const v = String(value).trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return fallback;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function int(value, min, max, fallback) {
  if (value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseTime(value, settings) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!m) return { hour: settings.hour, minute: settings.minute };
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

// base — уже загруженные настройки (localStorage поверх заводских).
// Значения из ссылки живут только в памяти и не перезаписывают localStorage.
export function parseQuery(search, base) {
  const q = new URLSearchParams(search || '');
  const settings = { ...base.settings };
  const look = { ...base.look };

  if (q.has('name')) settings.name = String(q.get('name')).trim().slice(0, 30);
  if (q.has('amount')) settings.amount = int(q.get('amount'), 0, 1e12, settings.amount);
  if (q.has('currency')) settings.currency = pick(q.get('currency'), CURRENCIES, settings.currency);
  if (q.has('time')) Object.assign(settings, parseTime(q.get('time'), settings));
  if (q.has('mode')) settings.mode = pick(q.get('mode'), MODES, settings.mode);

  if (q.has('theme')) look.theme = pick(q.get('theme'), THEMES, look.theme);
  if (q.has('anim')) look.anim = pick(q.get('anim'), ANIMATIONS, look.anim);
  if (q.has('ticker')) look.ticker = parseBool(q.get('ticker'), look.ticker);
  if (q.has('grain')) look.grain = parseBool(q.get('grain'), look.grain);
  if (q.has('glow')) look.glow = int(q.get('glow'), 0, 100, look.glow);
  look.sound = parseBool(q.get('sound'), look.sound);

  let timeOffset = 0;
  if (q.get('now')) {
    const d = new Date(q.get('now'));
    if (!isNaN(d)) timeOffset = d.getTime() - Date.now();
  }

  return {
    kiosk: parseBool(q.get('kiosk'), false),
    settings,
    look,
    timeOffset,
    scale: int(q.get('scale'), 60, 160, 100) / 100,
    nowParam: q.get('now') || '',
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Ссылка для телевизора: переносит настройки, которых нет в его localStorage.
// В отличие от киоска звук не переносится — табло на стене всегда немое.
export function buildKioskUrl(href, settings, look, base, extras = {}) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  const p = url.searchParams;
  p.set('kiosk', 'true');

  if (settings.name && settings.name !== base.settings.name) p.set('name', settings.name);
  if (settings.amount > 0) p.set('amount', String(settings.amount));
  if (settings.currency !== base.settings.currency) p.set('currency', settings.currency);
  if (settings.hour !== base.settings.hour || settings.minute !== base.settings.minute) {
    p.set('time', `${pad(settings.hour)}:${pad(settings.minute)}`);
  }
  if (settings.mode !== base.settings.mode) p.set('mode', settings.mode);

  if (look.theme !== base.look.theme) p.set('theme', look.theme);
  if (look.anim !== base.look.anim) p.set('anim', look.anim);
  if (!look.ticker) p.set('ticker', 'false');
  if (!look.grain) p.set('grain', 'false');
  if (look.glow !== base.look.glow) p.set('glow', String(look.glow));

  if (extras.now) p.set('now', extras.now);
  if (extras.scale && extras.scale !== 1) p.set('scale', String(Math.round(extras.scale * 100)));
  return url.toString();
}