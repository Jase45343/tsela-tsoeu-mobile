import { compareMonths, daysInMonth, makeDate, parts } from './dates';
import { halfOf } from './money';
import type { BillingRules, FirstPeriodChoice, ISODate, Lisente, SchoolClosure } from './types';

/**
 * Charging rules for months that are not ordinary: a student's first month,
 * and months shortened by school holidays. Drivers pick the rules in settings;
 * the results are snapshotted onto each billing period when it is created, so
 * changing a rule later never rewrites months already charged.
 */

const normSchool = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function closureApplies(c: SchoolClosure, school: string | null | undefined): boolean {
  return c.school === null || normSchool(c.school) === normSchool(school);
}

function isWeekday(date: ISODate): boolean {
  const { year, month, day } = parts(date);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Monday–Friday dates in the month, optionally only from `from` onwards. */
export function weekdaysInMonth(year: number, month: number, from?: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const last = daysInMonth(year, month);
  for (let d = 1; d <= last; d++) {
    const date = makeDate(year, month, d);
    if (from && date < from) continue;
    if (isWeekday(date)) out.push(date);
  }
  return out;
}

export function isClosed(date: ISODate, school: string | null | undefined, closures: SchoolClosure[]): boolean {
  return closures.some((c) => closureApplies(c, school) && date >= c.from && date <= c.to);
}

export interface MonthDays {
  /** School days in an ordinary month: every weekday. */
  normal: number;
  /** Weekdays the bus actually runs for this school (from `from`, outside closures). */
  open: number;
}

export function monthDays(year: number, month: number, school: string | null | undefined, closures: SchoolClosure[], from?: ISODate): MonthDays {
  const normal = weekdaysInMonth(year, month).length;
  const open = weekdaysInMonth(year, month, from).filter((d) => !isClosed(d, school, closures)).length;
  return { normal, open };
}

/** Whole maloti, so parents see round figures. */
const scale = (fee: Lisente, num: number, den: number): Lisente => (den <= 0 ? fee : Math.round((fee * num) / den / 100) * 100);

export interface Charge {
  amountDue: Lisente;
  needsReview: boolean;
  note: string | null;
}

/** The charge for an ordinary (not first) month under the holiday rule. */
export function monthlyCharge(fee: Lisente, year: number, month: number, school: string | null | undefined, rules: BillingRules): Charge {
  if (rules.holidayRule === 'same') return { amountDue: fee, needsReview: false, note: null };
  const { normal, open } = monthDays(year, month, school, rules.closures);
  if (open === normal) return { amountDue: fee, needsReview: false, note: null };
  const note = `${open}/${normal}`;
  if (rules.holidayRule === 'by_days') return { amountDue: scale(fee, open, normal), needsReview: false, note };
  // half_or_ask: a full fee when the bus runs at least half the month, otherwise the driver decides.
  if (open * 2 >= normal) return { amountDue: fee, needsReview: false, note };
  return { amountDue: fee, needsReview: true, note };
}

/** The first-month choice the driver's rule suggests for a given start date. */
export function defaultFirstChoice(onboardedAt: ISODate, rules: BillingRules): FirstPeriodChoice {
  const day = parts(onboardedAt).day;
  switch (rules.firstMonthRule) {
    case 'full':
      return 'full';
    case 'prorata':
      return day === 1 ? 'full' : 'prorata';
    case 'half_after':
      return day >= rules.halfCutoffDay ? 'half' : 'full';
    case 'ask':
      return day >= 15 ? 'half' : 'full';
  }
}

/** The amount for a new student's first month under the chosen option. */
export function firstMonthCharge(
  fee: Lisente,
  onboardedAt: ISODate,
  school: string | null | undefined,
  rules: BillingRules,
  choice: FirstPeriodChoice,
  custom?: Lisente,
): Charge {
  const { year, month } = parts(onboardedAt);
  switch (choice) {
    case 'full':
      return { amountDue: fee, needsReview: false, note: null };
    case 'half':
      return { amountDue: halfOf(fee), needsReview: false, note: null };
    case 'free':
      return { amountDue: 0, needsReview: false, note: null };
    case 'prorata': {
      const { normal, open } = monthDays(year, month, school, rules.closures, onboardedAt);
      return { amountDue: scale(fee, open, normal), needsReview: false, note: `${open}/${normal}` };
    }
    case 'custom':
      if (custom === undefined || !Number.isSafeInteger(custom) || custom < 0) {
        throw new Error('Custom first-month amount must be a non-negative whole number of lisente');
      }
      return { amountDue: custom, needsReview: false, note: null };
  }
}

/** A new student's first payment falls due on their start date, or the normal due day if that is later. */
export function firstDueDate(normalDue: ISODate, onboardedAt: ISODate): ISODate {
  return normalDue < onboardedAt ? onboardedAt : normalDue;
}

/** True for a month that has not begun yet; such months are not owed. */
export function isUpcoming(period: { year: number; month: number }, today: ISODate): boolean {
  return compareMonths(period, parts(today)) > 0;
}
