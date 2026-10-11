import { compareMonths, daysInMonth, makeDate, monthKey, nextMonth, parts } from './dates';
import { halfOf } from './money';
import { monthlyCharge } from './charges';
import type {
  BillingPeriod,
  BillingRules,
  FirstPeriodChoice,
  ISODate,
  Lisente,
  PeriodOrigin,
  Student,
} from './types';

export function periodBounds(year: number, month: number): { periodStart: ISODate; periodEnd: ISODate } {
  return {
    periodStart: makeDate(year, month, 1),
    periodEnd: makeDate(year, month, daysInMonth(year, month)),
  };
}

export function dueDateFor(year: number, month: number, dueDay: number): ISODate {
  const day = Math.min(Math.max(1, Math.floor(dueDay)), daysInMonth(year, month));
  return makeDate(year, month, day);
}

export function buildPeriod(args: {
  id: string;
  studentId: string;
  year: number;
  month: number;
  amountDue: Lisente;
  dueDay: number;
  origin: PeriodOrigin;
}): BillingPeriod {
  return {
    id: args.id,
    studentId: args.studentId,
    year: args.year,
    month: args.month,
    ...periodBounds(args.year, args.month),
    dueDate: dueDateFor(args.year, args.month, args.dueDay),
    amountDue: args.amountDue,
    cancelled: false,
    origin: args.origin,
  };
}

/** FR-005 default: full fee before the 15th, half fee on or after it. */
export function suggestFirstPeriodChoice(onboardedAt: ISODate): FirstPeriodChoice {
  return parts(onboardedAt).day < 15 ? 'full' : 'half';
}

export function firstPeriodAmount(monthlyFee: Lisente, choice: FirstPeriodChoice, custom?: Lisente): Lisente {
  switch (choice) {
    case 'full':
      return monthlyFee;
    case 'half':
      return halfOf(monthlyFee);
    case 'free':
      return 0;
    case 'prorata':
      throw new Error('Use firstMonthCharge for pro-rata amounts; it needs the start date and school calendar');
    case 'custom':
      if (custom === undefined || !Number.isSafeInteger(custom) || custom < 0) {
        throw new Error('Custom first-period amount must be a non-negative whole number of lisente');
      }
      return custom;
  }
}

export function periodKey(studentId: string, year: number, month: number): string {
  return `${studentId}:${monthKey(year, month)}`;
}

export interface PeriodToGenerate {
  studentId: string;
  year: number;
  month: number;
  amountDue: Lisente;
  needsReview: boolean;
  chargeNote: string | null;
}

/**
 * Which monthly periods are missing, up to and including the month of `today`.
 *
 * For each active student, starts at the month after their latest existing
 * period (or their onboarding month if they have none) and fills every month
 * through today's month at the student's current monthly fee. Months already
 * present are never touched, so past amounts are never recalculated (BR-4).
 * Used by the server (origin "server") and by an offline device (origin "provisional").
 */
export function periodsToGenerate(
  students: Pick<Student, 'id' | 'status' | 'monthlyFee' | 'onboardedAt' | 'school'>[],
  existing: Pick<BillingPeriod, 'studentId' | 'year' | 'month'>[],
  today: ISODate,
  rules?: BillingRules,
): PeriodToGenerate[] {
  const latest = new Map<string, { year: number; month: number }>();
  const present = new Set<string>();
  for (const p of existing) {
    present.add(periodKey(p.studentId, p.year, p.month));
    const cur = latest.get(p.studentId);
    if (!cur || compareMonths(p, cur) > 0) latest.set(p.studentId, { year: p.year, month: p.month });
  }

  const now = parts(today);
  const out: PeriodToGenerate[] = [];
  for (const s of students) {
    if (s.status !== 'active') continue;
    const onboard = parts(s.onboardedAt);
    if (compareMonths(onboard, now) > 0) continue; // onboarded in the future
    const last = latest.get(s.id);
    let cursor = last ? nextMonth(last.year, last.month) : { year: onboard.year, month: onboard.month };
    while (compareMonths(cursor, now) <= 0) {
      if (!present.has(periodKey(s.id, cursor.year, cursor.month))) {
        const c = rules
          ? monthlyCharge(s.monthlyFee, cursor.year, cursor.month, s.school, rules)
          : { amountDue: s.monthlyFee, needsReview: false, note: null };
        out.push({ studentId: s.id, year: cursor.year, month: cursor.month, amountDue: c.amountDue, needsReview: c.needsReview, chargeNote: c.note });
      }
      cursor = nextMonth(cursor.year, cursor.month);
    }
  }
  return out;
}
