export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Local-time ISO date (YYYY-MM-DD). Never uses toISOString — that shifts across UTC. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Monday-based week start for the given date. */
export function startOfWeek(d: Date = new Date()): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(copy, diff);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayOf(d: Date): number {
  const dow = d.getDay();
  return dow === 0 ? 6 : dow - 1;
}

export function dateForWeekday(weekStart: string, weekday: number): Date {
  return addDays(fromISODate(weekStart), weekday);
}

export function fmtTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function fmtRange(startMin: number, endMin: number): string {
  return `${fmtTime(startMin)} to ${fmtTime(endMin)}`;
}

export function fmtHours(min: number): string {
  if (min <= 0) return '0h';
  const h = min / 60;
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1)}h`;
}

export function fmtMoney(value: number): string {
  // Thousands separators by hand: toLocaleString is not dependable on every phone engine.
  const [whole, cents] = value.toFixed(2).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}

export function fmtDateShort(iso: string): string {
  const d = fromISODate(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function fmtWeekLabel(weekStart: string): string {
  const start = fromISODate(weekStart);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`;
  const right = sameMonth
    ? `${end.getDate()}`
    : `${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;
  return `${left} – ${right}`;
}

export function fmtDayDate(weekStart: string, weekday: number): string {
  const d = dateForWeekday(weekStart, weekday);
  return `${DAY_SHORT[weekday]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Build a local Date at a given minute-of-day on a given calendar date. */
export function dateAtMinutes(base: Date, minutes: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
}

export function daysBetween(a: Date, b: Date): number {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  return Math.round(ms / 86400000);
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${DAY_SHORT[weekdayOf(d)]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${fmtTime(
    d.getHours() * 60 + d.getMinutes(),
  )}`;
}

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  return fmtTime(d.getHours() * 60 + d.getMinutes());
}

/**
 * When availability for a planned week is due: the chosen weekday of the week *before*
 * it (e.g. Wednesday before the week starts), at the chosen time.
 */
export function availabilityDueDate(weekStart: string, dueWeekday: number, dueMin: number): Date {
  return dateAtMinutes(addDays(fromISODate(weekStart), dueWeekday - 7), dueMin);
}

/** "Wednesday, Nov 11 at 8 PM", or "as soon as you can" once that has passed. */
export function fmtDue(due: Date, now: Date = new Date()): string {
  if (due.getTime() <= now.getTime()) return 'as soon as you can';
  return `${DAY_LONG[weekdayOf(due)]}, ${MONTH_SHORT[due.getMonth()]} ${due.getDate()} at ${fmtTime(
    due.getHours() * 60 + due.getMinutes(),
  )}`;
}
