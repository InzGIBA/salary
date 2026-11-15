// Праздники Казахстана и расчёт даты зарплаты.
// Чистый ESM-модуль: используется и страницей, и тестами (node --test).

export const SALARY_DAY = 10;

// Нерабочие праздничные дни по Закону РК «О праздниках в Республике Казахстан».
// 16 декабря (День Независимости) и 1 декабря (День Первого Президента) — рабочие дни.
const FIXED_HOLIDAYS = [
  [1, 1, 'Новый год'],
  [1, 2, 'Новый год'],
  [1, 7, 'Православное Рождество'],
  [3, 8, 'Международный женский день'],
  [3, 21, 'Наурыз мейрамы'],
  [3, 22, 'Наурыз мейрамы'],
  [3, 23, 'Наурыз мейрамы'],
  [5, 1, 'День единства народа Казахстана'],
  [5, 7, 'День защитника Отечества'],
  [5, 9, 'День Победы'],
  [7, 6, 'День Столицы'],
  [8, 30, 'День Конституции'],
  [10, 25, 'День Республики'],
];

// Курбан-айт (первый день)._future годы — астрономический прогноз:
// точную дату ежегодно объявляет ДУМК РК.
const KURBAN_AIT = {
  2024: [6, 16],
  2025: [6, 6],
  2026: [5, 27],
  2027: [5, 17],
  2028: [5, 5],
  2029: [4, 24],
  2030: [4, 13],
};

export const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
}

export function keyOf(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function isWeekend(date) {
  const w = date.getDay();
  return w === 0 || w === 6;
}

const holidayCache = new Map();

// Map 'YYYY-MM-DD' -> { name, kind: 'holiday'|'transfer', date }
export function getHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const map = new Map();
  const add = (y, m, d, name, kind) => {
    const date = new Date(y, m - 1, d);
    map.set(keyOf(date), { name, kind, date });
  };

  for (const [m, d, name] of FIXED_HOLIDAYS) add(year, m, d, name, 'holiday');
  if (KURBAN_AIT[year]) add(year, KURBAN_AIT[year][0], KURBAN_AIT[year][1], 'Курбан-айт', 'holiday');

  // ТК РК, ст. 86: при совпадении выходного и праздничного дня выходной
  // переносится на следующий после праздничного рабочий день.
  const base = [...map.values()].sort((a, b) => a.date - b.date);
  for (const h of base) {
    if (!isWeekend(h.date)) continue;
    const cursor = addDays(h.date, 1);
    while (isWeekend(cursor) || map.has(keyOf(cursor))) cursor.setDate(cursor.getDate() + 1);
    map.set(keyOf(cursor), { name: `Перенос выходного (${h.name})`, kind: 'transfer', date: new Date(cursor) });
  }

  holidayCache.set(year, map);
  return map;
}

export function getDayInfo(date) {
  const holiday = getHolidays(date.getFullYear()).get(keyOf(date)) || null;
  const weekend = isWeekend(date);
  return { holiday, weekend, working: !weekend && !holiday };
}

export function isWorkingDay(date) {
  return getDayInfo(date).working;
}

export function countWorkingDays(from, toExclusive) {
  let n = 0;
  const d = startOfDay(from);
  const end = startOfDay(toExclusive);
  while (d < end) {
    if (isWorkingDay(d)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// mode: 'before' — накануне (как платят по ТК РК), 'nearest' — ближайший рабочий день.
export function getSalaryDate(year, monthIndex, mode = 'before') {
  const original = new Date(year, monthIndex, SALARY_DAY);
  if (isWorkingDay(original)) {
    return { date: original, original, shifted: false, reason: null };
  }

  const info = getDayInfo(original);
  const reason = info.holiday ? info.holiday.name : WEEKDAYS_FULL[original.getDay()];

  if (mode === 'nearest') {
    for (let dist = 1; dist < 32; dist++) {
      const before = addDays(original, -dist);
      const after = addDays(original, dist);
      if (isWorkingDay(before)) return { date: before, original, shifted: true, reason };
      if (isWorkingDay(after)) return { date: after, original, shifted: true, reason };
    }
  }

  const date = addDays(original, -1);
  while (!isWorkingDay(date)) date.setDate(date.getDate() - 1);
  return { date, original, shifted: true, reason };
}

export function getSalaryMoment(year, monthIndex, hour = 10, minute = 0, mode = 'before') {
  const s = getSalaryDate(year, monthIndex, mode);
  const moment = new Date(s.date.getFullYear(), s.date.getMonth(), s.date.getDate(), hour, minute, 0, 0);
  return { ...s, moment };
}

// Полное расписание относительно момента now.
export function getSchedule(now, { hour = 10, minute = 0, mode = 'before' } = {}) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const cur = getSalaryMoment(y, m, hour, minute, mode);

  if (now < cur.moment) {
    return {
      phase: sameDay(now, cur.moment) ? 'today' : 'waiting',
      target: cur,
      prev: getSalaryMoment(y, m - 1, hour, minute, mode),
      next: getSalaryMoment(y, m + 1, hour, minute, mode),
    };
  }
  if (sameDay(now, cur.moment)) {
    return {
      phase: 'paid',
      target: cur,
      prev: getSalaryMoment(y, m - 1, hour, minute, mode),
      next: getSalaryMoment(y, m + 1, hour, minute, mode),
    };
  }
  const next = getSalaryMoment(y, m + 1, hour, minute, mode);
  return {
    phase: sameDay(now, next.moment) ? 'today' : 'waiting',
    target: next,
    prev: cur,
    next: getSalaryMoment(y, m + 2, hour, minute, mode),
  };
}

// Ближайшие праздники/переносы начиная с today (включительно).
export function getUpcomingHolidays(now, count = 5) {
  const out = [];
  const start = startOfDay(now);
  for (let year = start.getFullYear(); year <= start.getFullYear() + 1 && out.length < count; year++) {
    const entries = [...getHolidays(year).values()].sort((a, b) => a.date - b.date);
    for (const e of entries) {
      if (e.date >= start && out.length < count) out.push(e);
    }
  }
  return out;
}

export function getYearHolidays(year) {
  return [...getHolidays(year).values()].sort((a, b) => a.date - b.date);
}

export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}