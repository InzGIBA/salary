import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHolidays, getDayInfo, isWorkingDay, getSalaryDate, getSalaryMoment,
  getSchedule, getUpcomingHolidays, countWorkingDays, daysBetween, plural, keyOf,
} from '../assets/js/holidays.js';

const has = (year, iso) => getHolidays(year).has(iso);

test('фиксированные праздники РК 2026', () => {
  for (const iso of ['2026-01-01', '2026-01-02', '2026-01-07', '2026-03-08',
    '2026-03-21', '2026-03-22', '2026-03-23', '2026-05-01', '2026-05-07',
    '2026-05-09', '2026-07-06', '2026-08-30', '2026-10-25']) {
    assert.ok(has(2026, iso), `${iso} должен быть праздником`);
  }
});

test('16 декабря и 1 декабря — рабочие дни (не праздники)', () => {
  assert.ok(!has(2026, '2026-12-16'));
  assert.ok(!has(2026, '2026-12-01'));
  assert.ok(isWorkingDay(new Date(2026, 11, 16)));
});

test('переносы выходных 2026', () => {
  assert.ok(has(2026, '2026-03-09'), '8 марта (вс) -> 9 марта');
  assert.ok(has(2026, '2026-03-24'), 'Наурыз 21 (сб) -> 24 марта');
  assert.ok(has(2026, '2026-03-25'), 'Наурыз 22 (вс) -> 25 марта');
  assert.ok(has(2026, '2026-05-11'), '9 мая (сб) -> 11 мая');
  assert.ok(has(2026, '2026-08-31'), '30 августа (вс) -> 31 августа');
  assert.ok(has(2026, '2026-10-26'), '25 октября (вс) -> 26 октября');
  assert.equal(getHolidays(2026).get('2026-03-24').kind, 'transfer');
});

test('переносы не создают новых праздников в обычные годы', () => {
  assert.ok(!has(2026, '2026-05-02'));
  assert.ok(!has(2026, '2026-07-07'));
});

test('Курбан-айт', () => {
  assert.ok(has(2025, '2025-06-06'));
  assert.ok(has(2026, '2026-05-27'));
  assert.equal(getHolidays(2026).get('2026-05-27').name, 'Курбан-айт');
});

test('Наурыз 2025: пять выходных подряд', () => {
  for (const d of [21, 22, 23, 24, 25]) {
    assert.ok(!isWorkingDay(new Date(2025, 2, d)), `2025-03-${d} выходной`);
  }
  assert.ok(isWorkingDay(new Date(2025, 2, 26)));
});

test('Новый год 2027: перенос 2 января (сб) на 4 января', () => {
  assert.ok(has(2027, '2027-01-04'));
  assert.ok(!isWorkingDay(new Date(2027, 0, 4)));
});

const salaryCases = [
  // [год, месяц (0-based), ожидаемый день, режим]
  [2026, 0, 9],    // 10.01.2026 — суббота -> пятница 9-е
  [2026, 1, 10],   // вторник
  [2026, 2, 10],   // вторник (9-е — перенос, но 10-е рабочее)
  [2026, 4, 8],    // 10.05 — вс, 9.05 — праздник -> пятница 8-е
  [2026, 6, 10],   // пятница
  [2026, 7, 10],   // понедельник
  [2026, 9, 9],    // 10.10 — суббота -> пятница
  [2026, 11, 10],  // четверг
  [2027, 0, 8],    // 10.01.2027 — вс, 7.01 — праздник -> пятница 8-е
  [2025, 2, 7],    // 10.03.2025 — перенос выходного -> пятница 7-е
  [2027, 4, 6],    // 10.05.2027 — перенос Дня Победы, 7-е — праздник -> чт 6-е
];

for (const [y, m, expected] of salaryCases) {
  test(`ЗП ${y}-${String(m + 1).padStart(2, '0')} -> ${expected}-е (накануне)`, () => {
    const s = getSalaryDate(y, m, 'before');
    assert.equal(s.date.getDate(), expected);
    assert.equal(s.date.getMonth(), m);
    assert.ok(isWorkingDay(s.date));
  });
}

test('режим nearest: 10.01.2027 (вс) -> понедельник 11-е', () => {
  const s = getSalaryDate(2027, 0, 'nearest');
  assert.equal(s.date.getDate(), 11);
});

test('режим nearest: при равенстве расстояний выбирается предыдущий', () => {
  // 10.05.2026 (вс): назад 8-е (пт, 2 дня), вперёд 12-е (вт, 2 дня; 11-е — перенос)
  const s = getSalaryDate(2026, 4, 'nearest');
  assert.equal(s.date.getDate(), 8);
});

test('getSalaryDate: причина переноса', () => {
  assert.equal(getSalaryDate(2026, 0).reason, 'суббота');
  assert.equal(getSalaryDate(2026, 4).reason, 'воскресенье');
  assert.equal(getSalaryDate(2025, 2).reason, 'Перенос выходного (Международный женский день)');
  assert.equal(getSalaryDate(2026, 1).reason, null);
});

test('getSchedule: фазы дня ЗП', () => {
  const opts = { hour: 10, minute: 0 };
  const before = getSchedule(new Date(2026, 6, 9, 15, 0), opts);
  assert.equal(before.phase, 'waiting');
  assert.equal(keyOf(before.target.date), '2026-07-10');
  assert.equal(daysBetween(new Date(2026, 6, 9), before.target.date), 1);

  const morning = getSchedule(new Date(2026, 6, 10, 9, 0), opts);
  assert.equal(morning.phase, 'today');

  const exact = getSchedule(new Date(2026, 6, 10, 10, 0), opts);
  assert.equal(exact.phase, 'paid');

  const evening = getSchedule(new Date(2026, 6, 10, 23, 59), opts);
  assert.equal(evening.phase, 'paid');
  assert.equal(keyOf(evening.next.date), '2026-08-10');

  const after = getSchedule(new Date(2026, 6, 11, 0, 30), opts);
  assert.equal(after.phase, 'waiting');
  assert.equal(keyOf(after.target.date), '2026-08-10');
  assert.equal(keyOf(after.prev.date), '2026-07-10');
});

test('getSchedule: переход через год', () => {
  const s = getSchedule(new Date(2026, 11, 11, 12, 0), { hour: 10 });
  assert.equal(keyOf(s.target.date), '2027-01-08');
  assert.equal(s.target.date.getFullYear(), 2027);
});

test('getSchedule: сегодня 2026-11-15 -> ЗП 10 декабря', () => {
  const s = getSchedule(new Date(2026, 10, 15, 12, 0), { hour: 10 });
  assert.equal(keyOf(s.target.date), '2026-12-10');
  assert.equal(daysBetween(new Date(2026, 10, 15), s.target.date), 25);
});

test('getUpcomingHolidays: после 15 ноября 2026 ближайший — Новый год', () => {
  const list = getUpcomingHolidays(new Date(2026, 10, 15), 3);
  assert.equal(keyOf(list[0].date), '2027-01-01');
  assert.equal(list[0].name, 'Новый год');
});

test('countWorkingDays', () => {
  // с 9 по 13 июля 2026 (чт-пн): 9 (чт), 10 (пт), 13 (пн) — но toExclusive 13-е -> 2
  assert.equal(countWorkingDays(new Date(2026, 6, 9), new Date(2026, 6, 13)), 2);
  // неделя 6-12 июля 2026: 6 — праздник, 7-10 рабочие, 11-12 выходные
  assert.equal(countWorkingDays(new Date(2026, 6, 6), new Date(2026, 6, 13)), 4);
});

test('plural', () => {
  assert.equal(plural(1, 'день', 'дня', 'дней'), 'день');
  assert.equal(plural(2, 'день', 'дня', 'дней'), 'дня');
  assert.equal(plural(5, 'день', 'дня', 'дней'), 'дней');
  assert.equal(plural(11, 'день', 'дня', 'дней'), 'дней');
  assert.equal(plural(21, 'день', 'дня', 'дней'), 'день');
  assert.equal(plural(0, 'день', 'дня', 'дней'), 'дней');
});