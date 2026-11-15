import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, buildKioskUrl, parseBool } from '../assets/js/params.js';

const DEFAULTS = { name: '', amount: 0, currency: '₸', hour: 10, minute: 0, mode: 'before' };
const LOOK_DEFAULTS = { theme: 'night', sound: true, ticker: true, grain: true, glow: 60, anim: 'flap' };
const base = () => ({ settings: { ...DEFAULTS }, look: { ...LOOK_DEFAULTS } });
const parse = (search, b = base()) => parseQuery(search, b);

test('киоск включается любым истинным написанием', () => {
  for (const q of ['?kiosk', '?kiosk=', '?kiosk=true', '?kiosk=True', '?kiosk=TRUE', '?kiosk=1', '?kiosk=yes', '?kiosk=on', '?kiosk=%20True%20']) {
    assert.equal(parse(q).kiosk, true, q);
  }
});

test('киоск выключается ложными значениями и отсутствием параметра', () => {
  for (const q of ['', '?now=2026-07-10', '?kiosk=0', '?kiosk=false', '?kiosk=False', '?kiosk=no', '?kiosk=off', '?kiosk=whatever']) {
    assert.equal(parse(q).kiosk, false, q);
  }
});

test('parseBool уважает запасное значение', () => {
  assert.equal(parseBool(null, true), true);
  assert.equal(parseBool('мусор', true), true);
  assert.equal(parseBool('OFF', true), false);
});

test('без параметров настройки не меняются', () => {
  const b = base();
  b.settings.amount = 350000;
  b.look.theme = 'day';
  const r = parse('?kiosk=true', b);
  assert.deepEqual(r.settings, b.settings);
  assert.deepEqual(r.look, b.look);
});

test('параметры ссылки перекрывают сохранённые настройки', () => {
  const b = base();
  b.settings.amount = 350000;
  b.settings.name = 'Алмас';
  const r = parse('?kiosk=true&amount=500000&name=%20Отдел%20кадров%20&currency=$&time=09:30&mode=nearest', b);
  assert.equal(r.settings.amount, 500000);
  assert.equal(r.settings.name, 'Отдел кадров');
  assert.equal(r.settings.currency, '$');
  assert.equal(r.settings.hour, 9);
  assert.equal(r.settings.minute, 30);
  assert.equal(r.settings.mode, 'nearest');
});

test('мусорные значения не ломают настройки', () => {
  const r = parse('?amount=abc&currency=DOGE&time=99:99&mode=sideways&glow=1000&theme=neon&anim=spin');
  assert.deepEqual(r.settings, DEFAULTS);
  assert.equal(r.look.glow, 100);
  assert.equal(r.look.theme, 'night');
  assert.equal(r.look.anim, 'flap');
});

test('имя обрезается до 30 символов, сумма не бывает отрицательной', () => {
  const r = parse('?name=' + 'я'.repeat(40) + '&amount=-500');
  assert.equal(r.settings.name.length, 30);
  assert.equal(r.settings.amount, 0);
});

test('оформление из ссылки', () => {
  const r = parse('?theme=day&anim=slide&ticker=false&grain=0&glow=25&sound=no');
  assert.equal(r.look.theme, 'day');
  assert.equal(r.look.anim, 'slide');
  assert.equal(r.look.ticker, false);
  assert.equal(r.look.grain, false);
  assert.equal(r.look.glow, 25);
  assert.equal(r.look.sound, false);
});

test('масштаб киоска ограничен 60–160%', () => {
  assert.equal(parse('').scale, 1);
  assert.equal(parse('?scale=120').scale, 1.2);
  assert.equal(parse('?scale=10').scale, 0.6);
  assert.equal(parse('?scale=900').scale, 1.6);
  assert.equal(parse('?scale=abc').scale, 1);
});

test('now задаёт смещение времени', () => {
  const r = parse('?now=2026-07-10T11:00:00');
  const expected = new Date('2026-07-10T11:00:00').getTime() - Date.now();
  assert.ok(Math.abs(r.timeOffset - expected) < 1000);
  assert.equal(r.nowParam, '2026-07-10T11:00:00');
  assert.equal(parse('?now=ерунда').timeOffset, 0);
});

test('исходные настройки не мутируют', () => {
  const b = base();
  parse('?amount=1&name=X&theme=day&glow=0', b);
  assert.deepEqual(b.settings, DEFAULTS);
  assert.deepEqual(b.look, LOOK_DEFAULTS);
});

test('ссылка для телевизора содержит только отличия от заводских', () => {
  const url = buildKioskUrl('https://example.kz/salary/index.html?now=x#top', DEFAULTS, LOOK_DEFAULTS, base());
  assert.equal(url, 'https://example.kz/salary/index.html?kiosk=true');
});

test('ссылка переносит настройки и оформление', () => {
  const settings = { name: 'Алмас Б', amount: 420000, currency: '₽', hour: 9, minute: 30, mode: 'nearest' };
  const look = { theme: 'day', sound: false, ticker: false, grain: false, glow: 20, anim: 'fade' };
  const url = buildKioskUrl('https://example.kz/salary/', settings, look, base(), { now: '2026-07-10T11:00:00', scale: 1.2 });
  const q = new URL(url).searchParams;
  assert.equal(q.get('kiosk'), 'true');
  assert.equal(q.get('name'), 'Алмас Б');
  assert.equal(q.get('amount'), '420000');
  assert.equal(q.get('currency'), '₽');
  assert.equal(q.get('time'), '09:30');
  assert.equal(q.get('mode'), 'nearest');
  assert.equal(q.get('theme'), 'day');
  assert.equal(q.get('anim'), 'fade');
  assert.equal(q.get('ticker'), 'false');
  assert.equal(q.get('grain'), 'false');
  assert.equal(q.get('glow'), '20');
  assert.equal(q.get('now'), '2026-07-10T11:00:00');
  assert.equal(q.get('scale'), '120');
  assert.equal(q.get('sound'), null, 'звук на телевизор не переносится');
});

test('ссылка туда-обратно восстанавливает настройки', () => {
  const settings = { name: 'Бухгалтерия', amount: 300000, currency: '€', hour: 18, minute: 45, mode: 'nearest' };
  const look = { theme: 'day', sound: true, ticker: false, grain: true, glow: 80, anim: 'slide' };
  const url = buildKioskUrl('https://example.kz/salary/index.html', settings, look, base());
  const r = parse(new URL(url).search);
  assert.deepEqual(r.settings, settings);
  assert.deepEqual(r.look, { ...look, sound: true });
  assert.equal(r.kiosk, true);
});