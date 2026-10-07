import type { ISODate } from './types';

/**
 * Africa/Maseru is a fixed UTC+2 zone with no daylight saving, so local dates
 * are computed by offset rather than Intl time-zone data (which Hermes on
 * older Android devices does not always ship).
 */
const MASERU_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function todayInMaseru(now: Date = new Date()): ISODate {
  return new Date(now.getTime() + MASERU_OFFSET_MS).toISOString().slice(0, 10);
}

export function toUTCms(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function fromUTCms(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTCms(toUTCms(date) + days * DAY_MS);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTCms(b) - toUTCms(a)) / DAY_MS);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Compare (year, month) pairs: negative if a is earlier. */
export function compareMonths(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

export type Lang = 'en' | 'st';

const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  st: ['Pherekgong', 'Hlakola', 'Hlakubele', 'Mmesa', 'Motsheanong', 'Phupjane', 'Phupu', 'Phato', 'Loetse', 'Mphalane', 'Pudungwana', 'Tshitwe'],
};

export function monthName(month: number, lang: Lang = 'en'): string {
  return MONTHS[lang][month - 1] ?? String(month);
}

/** "6 October 2026" */
export function formatDateLong(date: ISODate, lang: Lang = 'en'): string {
  const { year, month, day } = parts(date);
  return `${day} ${monthName(month, lang)} ${year}`;
}

/** "October 2026" */
export function formatMonth(year: number, month: number, lang: Lang = 'en'): string {
  return `${monthName(month, lang)} ${year}`;
}
