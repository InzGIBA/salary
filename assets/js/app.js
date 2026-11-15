import {
  getSchedule, getDayInfo, getUpcomingHolidays, getYearHolidays, countWorkingDays,
  daysBetween, addDays, sameDay, startOfDay, keyOf, plural,
  WEEKDAYS_SHORT, WEEKDAYS_FULL, MONTHS_NOM, MONTHS_GEN,
} from './holidays.js';

const STORAGE_KEY = 'salary-countdown:v1';
const DEFAULTS = { name: '', amount: 0, currency: '₸', hour: 10, minute: 0, mode: 'before', theme: 'auto' };
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const DENIALS = [
  'Нет. Ещё рано. Но попытка засчитана 🫡',
  'Проверил счёт. Там грусть и прошломесячная печаль.',
  'Банк сказал: «не сегодня». Я передаю дословно.',
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

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function celebrate(big = false) {
  if (reducedMotion || typeof window.confetti !== 'function') return;
  const colors = ['#16a34a', '#22c55e', '#f59e0b', '#84cc16', '#10b981'];
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
    shapes = ['₸', '💸', '🪙'].map((t) => window.confetti.shapeFromText({ text: t, scalar: 2 }));
  } catch {
    shapes = undefined;
  }
  window.confetti({
    particleCount: 90, spread: 130, origin: { y: 0.3 }, scalar: 1.7, gravity: 0.7,
    colors: ['#16a34a', '#f59e0b', '#22c55e'], shapes, zIndex: 90, ticks: 300,
  });
}

window.salaryApp = () => ({
  now: new Date(),
  settings: loadSettings(),
  timeOffset: 0,
  demo: null,
  toasts: [],
  toastSeq: 0,
  settingsOpen: false,
  draft: { ...DEFAULTS, time: '10:00' },
  showAllHolidays: false,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  wisdom: WISDOM[Math.floor(Math.random() * WISDOM.length)],
  wisdomPop: false,
  checkCount: 0,
  speedClicks: 0,
  speedLockedUntil: 0,
  logoClicks: 0,
  logoPop: false,
  heroPop: false,
  heroShake: false,
  stats: [0, 1, 3, 5],
  statPop: [false, false, false, false],
  themeRev: 0,
  celebratedKey: null,

  init() {
    const p = new URLSearchParams(location.search).get('now');
    if (p) {
      const d = new Date(p);
      if (!isNaN(d)) this.timeOffset = d.getTime() - Date.now();
    }
    this.applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.settings.theme === 'auto') this.applyTheme();
    });
    this.tick();
    setInterval(() => this.tick(), 250);
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
    const prevDays = this.daysLeft;
    this.now = this.effectiveNow();
    if (this.daysLeft !== prevDays) {
      this.heroPop = true;
      setTimeout(() => (this.heroPop = false), 400);
    }
    if (this.phase === 'paid' && !this.demo) {
      const key = keyOf(this.target.date);
      if (this.celebratedKey !== key) {
        this.celebratedKey = key;
        try {
          if (!sessionStorage.getItem('salary-celebrated:' + key)) {
            sessionStorage.setItem('salary-celebrated:' + key, '1');
            celebrate(true);
            this.toast('ЗА-АР-ПЛА-ТА! 🎉 Сегодня можно всё (в пределах суммы).', 'success');
          }
        } catch { /* приватный режим */ }
      }
    }
    document.title = this.phase === 'paid'
      ? '💸 ЗП пришла!'
      : this.phase === 'today'
        ? '🚀 ЗП сегодня!'
        : `${this.daysLeft} ${plural(this.daysLeft, 'день', 'дня', 'дней')} до ЗП 💸`;
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
  get progress() {
    if (this.phase === 'paid') return 1;
    const { prev, target } = this.schedule;
    return Math.min(1, Math.max(0, (this.now - prev.moment) / (target.moment - prev.moment)));
  },
  get progressPct() { return Math.round(this.progress * 100); },
  get milestone() {
    const p = this.progress;
    if (this.phase === 'paid') return 'месяц закрыт 🎉';
    if (p < 0.25) return 'только начали 🐣';
    if (p < 0.5) return 'четверть позади 🚶';
    if (p < 0.75) return 'экватор близко ⛰️';
    if (p < 0.9) return 'последний рывок 🏃';
    return 'финишная прямая 🏁';
  },
  get mood() {
    if (this.phase === 'paid') return '🤑 Гуляем!';
    if (this.phase === 'today') return '🚀 Деньги уже в пути';
    const d = this.daysLeft;
    if (d <= 2) return '🔥 Финишная прямая';
    if (d <= 5) return '🌅 Уже видно свет';
    if (d <= 9) return '⏳ Терпение. Только терпение';
    if (d <= 19) return '☕ Режим экономии';
    return '🧘 Денег нет, но вы держитесь';
  },
  get greeting() {
    if (this.phase === 'paid') return 'Можно гулять!';
    if (this.phase === 'today') return 'Дождались!';
    return this.settings.name ? `${this.settings.name}, осталось` : 'Осталось';
  },
  get heroSub() {
    if (this.phase === 'today') return `деньги придут в ${this.payTime}`;
    if (this.phase === 'paid') return `следующая — ${this.fmtDate(this.focus.date)}, через ${this.daysLeft} ${plural(this.daysLeft, 'день', 'дня', 'дней')}`;
    return `${plural(this.daysLeft, 'день', 'дня', 'дней')} до зарплаты`;
  },
  get todayLabel() {
    return `сегодня: ${WEEKDAYS_SHORT[this.now.getDay()]}, ${this.now.getDate()} ${MONTHS_GEN[this.now.getMonth()]}`;
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
    return `10-е — ${pretty} → платят ${how}: ${this.fmtDate(this.target.date)}`;
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
  get isDark() {
    void this.themeRev;
    return document.documentElement.classList.contains('dark');
  },
  get checkLabel() { return this.phase === 'paid' ? '🎉 ДА! Пришла!' : '💸 ЗП уже пришла?'; },
  get speedLocked() { return Date.now() < this.speedLockedUntil; },
  get speedLabel() {
    if (this.speedLocked) return `🚫 разблокировка через ${Math.ceil((this.speedLockedUntil - Date.now()) / 1000)}с`;
    return '⏩ Ускорить время';
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
    if (cell.isPayday) c += ' bg-primary text-primary-foreground font-bold shadow-glow hover:bg-primary';
    else if (cell.isPrevPay) c += ' border border-primary/40 text-primary font-semibold';
    if (cell.isToday && !cell.isPayday) c += ' ring-2 ring-info font-bold';
    if (!cell.isPayday && cell.info.holiday) c += ' text-warning font-semibold holiday-dot';
    else if (!cell.isPayday && cell.info.weekend) c += ' text-destructive/80';
    if (cell.isPast && !cell.isToday && !cell.isPayday) c += ' opacity-45';
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
    this.toast(msg, 'info');
  },
  prevMonth() {
    this.viewMonth--;
    if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
  },
  nextMonth() {
    this.viewMonth++;
    if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
  },
  goToday() {
    this.viewYear = this.now.getFullYear();
    this.viewMonth = this.now.getMonth();
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
      this.toast('ДА! 💸 Проверяй карту и ни в чём себе не отказывай (до 10-го).', 'success');
      return;
    }
    if (this.phase === 'today') {
      this.toast(`Почти! Зачисление в ${this.payTime} — осталось ${this.precise.h} ч ${this.precise.m} м ⏳`, 'warning');
      return;
    }
    this.checkCount++;
    this.heroShake = true;
    setTimeout(() => (this.heroShake = false), 450);
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
      this.toast('HR заблокировал кнопку за подозрительную активность 🚫 (10 секунд)', 'warning');
    } else {
      this.toast(SPEED_TOASTS[(this.speedClicks - 1) % SPEED_TOASTS.length], 'info');
    }
  },
  newWisdom() {
    let next = this.wisdom;
    while (next === this.wisdom) next = WISDOM[Math.floor(Math.random() * WISDOM.length)];
    this.wisdom = next;
    this.wisdomPop = true;
    setTimeout(() => (this.wisdomPop = false), 350);
  },
  cycleStat(i) {
    this.stats[i] = (this.stats[i] + 1) % METRICS.length;
    this.statPop[i] = true;
    setTimeout(() => (this.statPop[i] = false), 350);
  },
  logoClick() {
    this.logoClicks++;
    this.logoPop = true;
    setTimeout(() => (this.logoPop = false), 350);
    if (this.logoClicks >= 5) {
      this.logoClicks = 0;
      moneyRain();
      this.toast('Пасхалка! 🎉 Денег больше не стало, но настроение — да.', 'success');
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
    this.toast('Демо-режим: так выглядит день ЗП 🎬 (12 секунд)', 'success');
  },
  async share() {
    const url = location.href.split('?')[0];
    const text = this.phase === 'paid'
      ? `ЗП пришла! 🤑 Я гуляю. А ты сколько ещё ждёшь? ${url}`
      : `До зарплаты осталось ${this.daysLeft} ${plural(this.daysLeft, 'день', 'дня', 'дней')} 😮‍💨 Держусь. А ты? ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Скопировано! Отправь тому, кто тоже ждёт 📋', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        this.toast('Скопировано! Отправь тому, кто тоже ждёт 📋', 'success');
      } catch {
        this.toast('Не удалось скопировать. Но ты держись 😢', 'warning');
      }
      ta.remove();
    }
  },

  // ---- настройки и тема ----
  openSettings() {
    this.draft = { ...this.settings, time: `${pad(this.settings.hour)}:${pad(this.settings.minute)}` };
    this.settingsOpen = true;
    document.body.style.overflow = 'hidden';
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
      theme: ['auto', 'light', 'dark'].includes(this.draft.theme) ? this.draft.theme : 'auto',
    };
    this.persist();
    this.applyTheme();
    this.closeSettings();
    this.toast('Настройки сохранены ✓', 'success');
  },
  resetDraft() {
    this.draft = { ...DEFAULTS, time: '10:00' };
    this.toast('Значения сброшены. Не забудь сохранить.', 'info');
  },
  persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* приватный режим */ }
  },
  applyTheme() {
    const t = this.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    this.themeRev++;
  },
  toggleTheme() {
    this.settings.theme = this.isDark ? 'light' : 'dark';
    this.persist();
    this.applyTheme();
  },
});