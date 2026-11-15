import {
  getSchedule, getDayInfo, getUpcomingHolidays, getYearHolidays, countWorkingDays,
  daysBetween, addDays, sameDay, startOfDay, keyOf, plural,
  WEEKDAYS_SHORT, WEEKDAYS_FULL, MONTHS_NOM, MONTHS_GEN,
} from './holidays.js';
import { parseQuery, buildKioskUrl } from './params.js';

const SETTINGS_KEY = 'salary-countdown:v1';
const LOOK_KEY = 'salary-look:v1';
const DEFAULTS = { name: '', amount: 0, currency: '₸', hour: 10, minute: 0, mode: 'before' };
const LOOK_DEFAULTS = { theme: 'night', sound: true, ticker: true, grain: true, glow: 60, anim: 'flap' };
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Параметры ссылки важнее localStorage: телевизор настраивается одной ссылкой.
const QUERY = parseQuery(location.search, {
  settings: loadJson(SETTINGS_KEY, DEFAULTS),
  look: loadJson(LOOK_KEY, LOOK_DEFAULTS),
});

const DENIALS = [
  'Нет. Ещё рано. Но попытка засчитана 🫡',
  'Проверил счёт. Там грусть и прошломесячная печаль.',
  'Банк сказал: «не сегодня». Передаю дословно.',
  'Бухгалтерия в курсе твоих надежд. Ответ: нет.',
  'Деньги ещё в пути. Как и твоя мотивация.',
  'Отказано. Причина: календарь.',
  'Не ЗП. Но ты молодец, что проверяешь так часто.',
  'На карте всё ещё старый баланс. Держись.',
  'ЗП покинула чат. Вернётся по расписанию.',
  'Если долго смотреть на счёт, ЗП не появится. Проверено.',
];

const WISDOM = [
  'Деньги любят тишину. И 10-е число.',
  'Работа не волк, а зарплата — заяц: убегает быстро.',
  'Не имей сто рублей, а имей стабильную ЗП 10-го числа.',
  'Терпение и труд всё перетрут. Особенно до получки.',
  'Зарплата — это магия: появилась и исчезла.',
  'Самый короткий месяц — от ЗП до ЗП.',
  'Богат не тот, у кого много денег, а тот, кому до ЗП осталось 0 дней.',
  'Кто рано встаёт, тому весь день хочется спать до ЗП.',
  'Деньги — зло. Приезжайте ко мне, я приму весь удар.',
  'Живи так, чтобы каждый день был как день ЗП. Но без трат.',
];

const SPEED_TOASTS = [
  'Запрос на ускорение времени отправлен в отдел кадров… 📨',
  'Отдел кадров отклонил запрос. Формулировка: «ха-ха».',
  'Минфин сообщил: время не ускоряется. Придётся жить.',
];

const TICKER_JOKES = [
  'денег нет, но вы держитесь',
  'бухгалтерия просит не звонить 9-го числа',
  'кофе — валюта ожидания',
  'экватор месяца отмечается молча',
  'карта проверяется чаще, чем почта',
  'наурыз переносит рейсы бесплатно',
  '10-е число — единственный стабильный праздник',
  'пассажирам зала ожидания приготовиться',
];

const METRICS = [
  { emoji: '☕', label: 'чашек кофе выпить', value: (a) => Math.max(1, Math.ceil(a.hoursLeft * (16 / 24) / 3)) },
  { emoji: '🍜', label: 'обедов пережить', value: (a) => Math.max(1, Math.ceil(a.hoursLeft * (16 / 24) / 8)) },
  { emoji: '😴', label: 'ночей поспать', value: (a) => Math.max(0, a.daysLeft) },
  { emoji: '📺', label: 'серий посмотреть', value: (a) => Math.floor(a.hoursLeft * (16 / 24) * 60 / 45) },
  { emoji: '🌇', label: 'закатов увидеть', value: (a) => Math.max(0, a.daysLeft) },
  { emoji: '🥲', label: 'созвонов перетерпеть', value: (a) => a.workingDaysLeft * 3 },
  { emoji: '📱', label: 'проверок банка', value: (a) => Math.ceil(a.hoursLeft * 2) },
  { emoji: '😮‍💨', label: 'тяжёлых вздохов', value: (a) => Math.ceil(a.hoursLeft * 6) },
];

function loadJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return { ...fallback };
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Синтезированный звук табло: только дискретные видимые события */
const Sound = {
  ctx: null,
  enabled: true,
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* без звука */ }
  },
  tone(freq, dur, type = 'square', gain = 0.04, delay = 0) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* без звука */ }
  },
  key() { this.tone(320, 0.05, 'square', 0.03); },
  tick() { this.tone(1200, 0.03, 'square', 0.02); },
  flap() { this.tone(180, 0.09, 'sawtooth', 0.03); this.tone(90, 0.12, 'sine', 0.04, 0.05); },
  deny() { this.tone(140, 0.12, 'sawtooth', 0.04); this.tone(110, 0.14, 'sawtooth', 0.035, 0.09); },
  ching() { [880, 1108.7, 1318.5, 1760].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.05, i * 0.07)); },
  coin() { [1318.5, 1760].forEach((f, i) => this.tone(f, 0.09, 'square', 0.035, i * 0.08)); },
};

/* Сплит-флап: четыре половинки на цифру, лопасть откидывается сверху вниз */
class FlipClock {
  constructor(root) {
    this.tiles = [...root.querySelectorAll('.flip')];
    this.chars = this.tiles.map(() => '0');
    this.timers = new Map();
  }
  update(str) {
    for (let i = 0; i < this.tiles.length; i++) {
      const ch = str[i] || '0';
      if (ch === this.chars[i]) continue;
      const old = this.chars[i];
      this.chars[i] = ch;
      this.flip(this.tiles[i], old, ch);
    }
  }
  flip(tile, oldCh, newCh) {
    const top = tile.querySelector('.flip-top > span');
    const bottom = tile.querySelector('.flip-bottom > span');
    const flapTop = tile.querySelector('.flip-flap-top > span');
    const flapBottom = tile.querySelector('.flip-flap-bottom > span');
    clearTimeout(this.timers.get(tile));
    tile.classList.remove('flipping');
    void tile.offsetWidth;
    top.textContent = newCh;
    flapTop.textContent = oldCh;
    flapBottom.textContent = newCh;
    bottom.textContent = oldCh;
    tile.classList.add('flipping');
    this.timers.set(tile, setTimeout(() => {
      bottom.textContent = newCh;
      tile.classList.remove('flipping');
    }, 330));
  }
}

function celebrate(big = false) {
  if (reducedMotion || typeof window.confetti !== 'function') return;
  const colors = ['#ffb020', '#22c55e', '#ece9df', '#4cc3ff'];
  const base = { colors, zIndex: 90, ticks: 240, gravity: 0.9, spread: 70 };
  if (!big) {
    window.confetti({ ...base, particleCount: 100, origin: { y: 0.6 } });
    return;
  }
  const end = Date.now() + 1400;
  (function frame() {
    window.confetti({ ...base, particleCount: 6, angle: 60, origin: { x: 0, y: 0.75 } });
    window.confetti({ ...base, particleCount: 6, angle: 120, origin: { x: 1, y: 0.75 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function moneyRain() {
  if (reducedMotion || typeof window.confetti !== 'function') return;
  let shapes;
  try {
    shapes = ['₸', '💸', ''].map((t) => window.confetti.shapeFromText({ text: t, scalar: 2 }));
  } catch {
    shapes = undefined;
  }
  window.confetti({
    particleCount: 90, spread: 130, origin: { y: 0.3 }, scalar: 1.7, gravity: 0.7,
    colors: ['#ffb020', '#22c55e', '#ece9df'], shapes, zIndex: 90, ticks: 300,
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

window.salaryApp = () => ({
  now: new Date(),
  kiosk: QUERY.kiosk,
  scale: QUERY.scale,
  settings: QUERY.settings,
  look: QUERY.look,
  timeOffset: QUERY.timeOffset,
  demo: null,
  clock: null,
  wakeLock: null,
  idleTimer: null,
  kioskMetric: 0,
  kioskMetricPop: false,
  toasts: [],
  toastSeq: 0,
  settingsOpen: false,
  draft: { ...DEFAULTS, time: '10:00' },
  showAllHolidays: false,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  wisdom: WISDOM[Math.floor(Math.random() * WISDOM.length)],
  wisdomPop: false,
  statusPop: false,
  checkCount: 0,
  speedClicks: 0,
  speedLockedUntil: 0,
  logoClicks: 0,
  logoPop: false,
  stats: [0, 1, 3, 5],
  statPop: [false, false, false, false],
  celebratedKey: null,

  init() {
    this.applyLook();
    if (!this.kiosk) {
      const unlock = () => Sound.unlock();
      document.addEventListener('pointerdown', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
    }
    this.tick();
    setInterval(() => this.tick(), 250);
    if (this.kiosk) this.initKiosk();
  },

  // Счётчик живёт в двух разных разметках: обычная страница и киоск.
  bindClock(el) {
    this.clock = new FlipClock(el);
    this.clock.update(this.clockString);
  },

  initKiosk() {
    this.requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.requestWakeLock();
    });
    const wake = () => {
      document.documentElement.classList.remove('idle');
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => document.documentElement.classList.add('idle'), 3000);
    };
    document.addEventListener('pointermove', wake);
    wake();
    setInterval(() => this.newWisdom(), 15000);
    if (!(this.settings.amount > 0)) setInterval(() => this.cycleKioskMetric(), 9000);
  },

  // ---- время ----
  effectiveNow() {
    if (this.demo) {
      const elapsed = Date.now() - this.demo.start;
      if (elapsed > 12000) {
        this.demo = null;
        this.toast('Демо закончилось. Возвращаемся в реальность 😮‍💨', 'info');
      } else {
        return new Date(this.demo.base + elapsed);
      }
    }
    return new Date(Date.now() + this.timeOffset);
  },

  tick() {
    const prevStr = this.clockString;
    const prevPhase = this.phase;
    this.now = this.effectiveNow();
    const str = this.clockString;
    if (str !== prevStr) {
      if (this.clock) this.clock.update(str);
      if (str.slice(4, 6) !== prevStr.slice(4, 6)) Sound.tick();
      if (str.slice(0, 2) !== prevStr.slice(0, 2)) Sound.flap();
    }
    if (this.phase !== prevPhase) {
      this.statusPop = true;
      setTimeout(() => (this.statusPop = false), 500);
      Sound.flap();
    }
    if (this.phase === 'paid' && !this.demo) {
      const key = keyOf(this.target.date);
      if (this.celebratedKey !== key) {
        this.celebratedKey = key;
        try {
          if (!sessionStorage.getItem('salary-celebrated:' + key)) {
            sessionStorage.setItem('salary-celebrated:' + key, '1');
            celebrate(true);
            Sound.ching();
            this.toast('РЕЙС ПРИБЫЛ! 🎉 Сегодня можно всё (в пределах суммы).', 'success');
          }
        } catch { /* приватный режим */ }
      }
    }
    const d = this.precise.d;
    document.title = this.phase === 'paid'
      ? '💸 ЗП пришла!'
      : this.phase === 'today'
        ? '🚀 ЗП сегодня!'
        : `${d} ${plural(d, 'день', 'дня', 'дней')} до ЗП 💸`;
  },

  // ---- производные ----
  get schedule() {
    return getSchedule(this.now, { hour: this.settings.hour, minute: this.settings.minute, mode: this.settings.mode });
  },
  get phase() { return this.schedule.phase; },
  get target() { return this.schedule.target; },
  get focus() { return this.phase === 'paid' ? this.schedule.next : this.target; },
  get daysLeft() { return daysBetween(this.now, this.focus.date); },
  get msLeft() { return Math.max(0, this.focus.moment - this.now); },
  get hoursLeft() { return this.msLeft / 36e5; },
  get precise() {
    const t = this.msLeft;
    return { d: Math.floor(t / 864e5), h: Math.floor(t / 36e5) % 24, m: Math.floor(t / 6e4) % 60, s: Math.floor(t / 1e3) % 60 };
  },
  get clockString() {
    const p = this.precise;
    return pad(p.d) + pad(p.h) + pad(p.m) + pad(p.s);
  },
  get localTime() {
    return `${pad(this.now.getHours())}:${pad(this.now.getMinutes())}:${pad(this.now.getSeconds())}`;
  },
  get statusWord() {
    return { waiting: 'ОЖИДАНИЕ', today: 'ПОСАДКА', paid: 'ПРИБЫЛ' }[this.phase];
  },
  get statusTone() { return this.phase === 'waiting' ? 'text-amber' : 'text-ok'; },
  get statusTagClass() {
    if (this.phase === 'waiting') return 'border-amber/50 text-amber';
    return this.phase === 'today' ? 'border-ok/50 text-ok animate-pulse' : 'border-ok/50 text-ok';
  },
  get moodLine() {
    const name = this.settings.name ? this.settings.name + ', ' : '';
    return name + this.mood;
  },
  get mood() {
    if (this.phase === 'paid') return 'гуляем. бюджет позволяет примерно всё до 10-го';
    if (this.phase === 'today') return 'деньги уже в пути. держите карту наготове';
    const d = this.precise.d;
    if (d <= 2) return 'финишная прямая. дышите ровно';
    if (d <= 5) return 'уже видно свет в конце тоннеля';
    if (d <= 9) return 'терпение. только терпение';
    if (d <= 19) return 'режим экономии на кофе';
    return 'денег нет, но вы держитесь';
  },
  get progress() {
    if (this.phase === 'paid') return 1;
    const { prev, target } = this.schedule;
    return Math.min(1, Math.max(0, (this.now - prev.moment) / (target.moment - prev.moment)));
  },
  get progressPct() { return Math.round(this.progress * 100); },
  get segsOn() { return Math.round(this.progress * 24); },
  get milestone() {
    const p = this.progress;
    if (this.phase === 'paid') return 'месяц закрыт';
    if (p < 0.25) return 'только начали';
    if (p < 0.5) return 'четверть позади';
    if (p < 0.75) return 'экватор близко';
    if (p < 0.9) return 'последний рывок';
    return 'финишная прямая';
  },
  get paydayFull() {
    const d = this.target.date;
    return `${cap(WEEKDAYS_FULL[d.getDay()])}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  },
  get payTime() { return `${pad(this.settings.hour)}:${pad(this.settings.minute)}`; },
  get shiftNote() {
    if (!this.target.shifted) return '';
    const reason = this.target.reason;
    const pretty = reason.charAt(0).toLowerCase() + reason.slice(1);
    const how = this.settings.mode === 'before' ? 'накануне' : 'в ближайший рабочий день';
    return `ПЕРЕНОС РЕЙСА: 10-е — ${pretty} → вылет ${how}: ${this.fmtDate(this.target.date)}`;
  },
  get workingDaysLeft() { return countWorkingDays(this.now, addDays(this.focus.date, 1)); },
  get earned() { return this.settings.amount > 0 ? this.settings.amount * this.progress : 0; },
  get perSecond() {
    const { prev, target } = this.schedule;
    return this.settings.amount / Math.max(1, (target.moment - prev.moment) / 1000);
  },
  get upcoming() { return getUpcomingHolidays(this.now, 4); },
  get yearHolidays() {
    const y = this.now.getFullYear();
    return [{ year: y, list: getYearHolidays(y) }, { year: y + 1, list: getYearHolidays(y + 1) }];
  },
  get tickerText() {
    const next = this.upcoming[0];
    const facts = [
      `до рейса ZP-${pad(this.focus.date.getMonth() + 1)}: ${this.precise.d} ${plural(this.precise.d, 'день', 'дня', 'дней')}`,
      next ? `ближайшая задержка: ${next.name} — ${this.fmtDate(next.date)}` : 'праздников впереди нет',
      `перенос рейсов: ${this.settings.mode === 'before' ? 'накануне выходного' : 'ближайший рабочий день'}`,
    ];
    return [...facts, ...TICKER_JOKES].join('  ✦  ');
  },
  get checkLabel() { return this.phase === 'paid' ? '🎉 да! пришла!' : '💳 проверить карту'; },
  get speedLocked() { return Date.now() < this.speedLockedUntil; },
  get speedLabel() {
    if (this.speedLocked) return `🚫 разблокировка через ${Math.ceil((this.speedLockedUntil - Date.now()) / 1000)}с`;
    return '⏩ ускорить время';
  },
  get demoSecondsLeft() {
    return this.demo ? Math.max(0, Math.ceil((12000 - (Date.now() - this.demo.start)) / 1000)) : 0;
  },
  get calendarTitle() { return `${cap(MONTHS_NOM[this.viewMonth])} ${this.viewYear}`; },
  get calendarCells() {
    const first = new Date(this.viewYear, this.viewMonth, 1);
    const lead = (first.getDay() + 6) % 7;
    const dim = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const cells = Array(lead).fill(null);
    const today = startOfDay(this.now);
    for (let d = 1; d <= dim; d++) {
      const date = new Date(this.viewYear, this.viewMonth, d);
      cells.push({
        date, day: d,
        info: getDayInfo(date),
        isToday: sameDay(date, this.now),
        isPayday: sameDay(date, this.target.date),
        isPrevPay: sameDay(date, this.schedule.prev.date),
        isPast: date < today,
      });
    }
    return cells;
  },

  // ---- киоск ----
  get flightCode() { return 'ZP-' + pad(this.target.date.getMonth() + 1); },
  get kioskToday() {
    const d = this.now;
    return `${cap(WEEKDAYS_FULL[d.getDay()])}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  },
  get kioskPayDate() {
    const d = this.target.date;
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} · ${WEEKDAYS_SHORT[d.getDay()]}`;
  },
  get heroLabel() {
    if (this.phase === 'paid') return 'рейс прибыл · до следующего зачисления';
    if (this.phase === 'today') return `посадка · зачисление сегодня в ${this.payTime}`;
    return `до зачисления · рейс ${this.flightCode}`;
  },
  get daysLabel() {
    const d = this.precise.d;
    return `${d} ${plural(d, 'день', 'дня', 'дней')} до рейса`;
  },
  get nextHoliday() { return this.upcoming[0] || null; },
  get kioskShiftNote() {
    return this.target.shifted
      ? `перенос рейса: 10-е → ${this.fmtDate(this.target.date)}`
      : 'вылет по расписанию · 10-е число';
  },
  get kioskUrl() {
    return buildKioskUrl(
      location.href, this.settings, this.look,
      { settings: DEFAULTS, look: LOOK_DEFAULTS },
      { now: QUERY.nowParam, scale: QUERY.scale },
    );
  },

  // ---- форматирование ----
  pad,
  fmtDate(d) { return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; },
  monthShort(d) { return MONTHS_SHORT[d.getMonth()]; },
  weekdayFull(d) { return WEEKDAYS_FULL[d.getDay()]; },
  keyOf,
  fmtMoney(n, digits = 0) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n) + ' ' + this.settings.currency;
  },
  untilLabel(date) {
    const n = daysBetween(this.now, date);
    if (n <= 0) return 'сегодня 🎉';
    if (n === 1) return 'завтра';
    return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
  },
  metric(i) { return METRICS[i]; },
  metricValue(i) { return METRICS[i].value(this); },

  // ---- календарь ----
  dayClasses(cell) {
    let c = '';
    if (cell.isPayday) c += ' bg-amber text-board font-bold';
    else if (cell.isPrevPay) c += ' border border-amber/50 text-amber font-semibold';
    if (cell.isToday && !cell.isPayday) c += ' ring-2 ring-info font-bold';
    if (!cell.isPayday && cell.info.holiday) c += ' text-amber font-semibold holiday-dot';
    else if (!cell.isPayday && cell.info.weekend) c += ' text-danger/80';
    if (cell.isPast && !cell.isToday && !cell.isPayday) c += ' opacity-40';
    return c;
  },
  dayTitle(cell) {
    const parts = [`${cell.day} ${MONTHS_GEN[cell.date.getMonth()]}, ${WEEKDAYS_FULL[cell.date.getDay()]}`];
    if (cell.info.holiday) parts.push(cell.info.holiday.name);
    else if (cell.info.weekend) parts.push('выходной');
    else parts.push('рабочий день');
    if (cell.isPayday) parts.push('💸 ЗАРПЛАТА');
    return parts.join(' · ');
  },
  dayClick(cell) {
    const d = daysBetween(this.now, cell.date);
    let msg = `${this.fmtDate(cell.date)} — ${WEEKDAYS_FULL[cell.date.getDay()]}`;
    if (cell.info.holiday) msg += `, ${cell.info.holiday.name} 🎉`;
    else if (cell.info.weekend) msg += ', выходной';
    else msg += ', рабочий день';
    if (cell.isPayday) msg += '. 💸 Это день ЗП!';
    else if (d > 0) msg += `. До ЗП ещё ${d} ${plural(d, 'день', 'дня', 'дней')}`;
    Sound.key();
    this.toast(msg, 'info');
  },
  prevMonth() {
    this.viewMonth--;
    if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
    Sound.key();
  },
  nextMonth() {
    this.viewMonth++;
    if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
    Sound.key();
  },
  goToday() {
    this.viewYear = this.now.getFullYear();
    this.viewMonth = this.now.getMonth();
    Sound.key();
  },

  // ---- действия ----
  toast(msg, type = 'default') {
    const id = ++this.toastSeq;
    this.toasts.push({ id, msg, type });
    if (this.toasts.length > 4) this.toasts.shift();
    setTimeout(() => this.dismissToast(id), 4500);
  },
  dismissToast(id) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  },
  checkSalary() {
    if (this.phase === 'paid') {
      celebrate(true);
      Sound.ching();
      this.toast('ДА! 💸 Проверяй карту и ни в чём себе не отказывай (до 10-го).', 'success');
      return;
    }
    if (this.phase === 'today') {
      Sound.key();
      this.toast(`Почти! Зачисление в ${this.payTime} — осталось ${this.precise.h} ч ${this.precise.m} м ⏳`, 'warning');
      return;
    }
    this.checkCount++;
    Sound.deny();
    if (this.checkCount % 5 === 0) {
      this.toast(`Ты проверил уже ${this.checkCount} раз. ЗП от этого не ускорится 🙃`, 'warning');
    } else {
      this.toast(DENIALS[Math.floor(Math.random() * DENIALS.length)], 'default');
    }
  },
  speedUp() {
    if (this.speedLocked) return;
    this.speedClicks++;
    if (this.speedClicks >= 3) {
      this.speedClicks = 0;
      this.speedLockedUntil = Date.now() + 10000;
      Sound.deny();
      this.toast('HR заблокировал кнопку за подозрительную активность 🚫 (10 секунд)', 'warning');
    } else {
      Sound.key();
      this.toast(SPEED_TOASTS[(this.speedClicks - 1) % SPEED_TOASTS.length], 'info');
    }
  },
  newWisdom() {
    let next = this.wisdom;
    while (next === this.wisdom) next = WISDOM[Math.floor(Math.random() * WISDOM.length)];
    this.wisdom = next;
    this.wisdomPop = true;
    setTimeout(() => (this.wisdomPop = false), 450);
    Sound.flap();
  },
  cycleStat(i) {
    this.stats[i] = (this.stats[i] + 1) % METRICS.length;
    this.statPop[i] = true;
    setTimeout(() => (this.statPop[i] = false), 450);
    Sound.tick();
  },
  logoClick() {
    this.logoClicks++;
    this.logoPop = true;
    setTimeout(() => (this.logoPop = false), 450);
    if (this.logoClicks >= 5) {
      this.logoClicks = 0;
      moneyRain();
      Sound.coin();
      this.toast('Пасхалка! 🎉 Денег больше не стало, но настроение — да.', 'success');
    } else {
      Sound.key();
    }
  },
  startDemo() {
    if (this.demo) {
      this.demo = null;
      this.toast('Демо остановлено. Реальность возвращена.', 'info');
      return;
    }
    this.demo = { start: Date.now(), base: this.target.moment.getTime() + 60000 };
    celebrate(true);
    Sound.ching();
    this.toast('Демо-режим: так выглядит день ЗП 🎬 (12 секунд)', 'success');
  },
  async share() {
    const url = location.href.split('?')[0];
    const text = this.phase === 'paid'
      ? `ЗП пришла! 🤑 Я гуляю. А ты сколько ещё ждёшь? ${url}`
      : `До зарплаты осталось ${this.precise.d} ${plural(this.precise.d, 'день', 'дня', 'дней')} 😮‍💨 Держусь. А ты? ${url}`;
    Sound.key();
    const ok = await copyText(text);
    this.toast(
      ok ? 'Скопировано! Отправь тому, кто тоже ждёт 📋' : 'Не удалось скопировать. Но ты держись 😢',
      ok ? 'success' : 'warning',
    );
  },

  // ---- пульт табло ----
  applyLook() {
    document.documentElement.classList.toggle('dark', this.look.theme === 'night');
    document.body.classList.toggle('no-grain', !this.look.grain);
    document.documentElement.style.setProperty('--glow', String(this.look.glow / 100));
    Sound.enabled = this.look.sound && !this.kiosk;
  },
  persistLook() {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(this.look)); } catch { /* приватный режим */ }
  },
  toggleTheme() {
    this.look.theme = this.look.theme === 'night' ? 'day' : 'night';
    this.applyLook();
    this.persistLook();
    Sound.key();
  },
  toggleSound() {
    this.look.sound = !this.look.sound;
    Sound.enabled = this.look.sound;
    if (this.look.sound) {
      Sound.unlock();
      Sound.key();
    }
    this.persistLook();
  },
  resetLook() {
    this.look = { ...LOOK_DEFAULTS };
    this.applyLook();
    this.persistLook();
    Sound.key();
    this.toast('Пульт сброшен к заводским настройкам.', 'info');
  },

  // ---- киоск ----
  openKiosk() {
    Sound.key();
    window.open(this.kioskUrl, '_blank', 'noopener');
  },
  async copyKioskUrl() {
    Sound.key();
    const ok = await copyText(this.kioskUrl);
    this.toast(
      ok ? 'Ссылка скопирована 📋 Открой её на телевизоре и нажми F.' : 'Не удалось скопировать ссылку 😢',
      ok ? 'success' : 'warning',
    );
  },
  cycleKioskMetric() {
    this.kioskMetric = (this.kioskMetric + 1) % METRICS.length;
    this.kioskMetricPop = true;
    setTimeout(() => (this.kioskMetricPop = false), 450);
  },
  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* браузер телевизора отказал */ });
  },
  async requestWakeLock() {
    if (!('wakeLock' in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { /* телевизор сам решает, гасить ли экран */ }
  },

  // ---- личные настройки ----
  openSettings() {
    this.draft = { ...this.settings, time: `${pad(this.settings.hour)}:${pad(this.settings.minute)}` };
    this.settingsOpen = true;
    document.body.style.overflow = 'hidden';
    Sound.key();
    this.$nextTick(() => document.getElementById('s-name')?.focus());
  },
  closeSettings() {
    this.settingsOpen = false;
    document.body.style.overflow = '';
  },
  saveSettings() {
    const amount = Math.max(0, Number(this.draft.amount) || 0);
    const [h, m] = String(this.draft.time || '10:00').split(':').map(Number);
    this.settings = {
      name: String(this.draft.name || '').trim().slice(0, 30),
      amount,
      currency: this.draft.currency || '₸',
      hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 10,
      minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
      mode: this.draft.mode === 'nearest' ? 'nearest' : 'before',
    };
    this.persist();
    this.closeSettings();
    Sound.key();
    this.toast('Настройки сохранены ✓', 'success');
  },
  resetDraft() {
    this.draft = { ...DEFAULTS, time: '10:00' };
    this.toast('Значения сброшены. Не забудь сохранить.', 'info');
  },
  persist() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* приватный режим */ }
  },
});