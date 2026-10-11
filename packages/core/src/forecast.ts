import type { StudentAccount } from './accounts';
import { monthlyCharge } from './charges';
import { compareMonths, nextMonth, parts } from './dates';
import type { BillingRules, ISODate, Lisente } from './types';

/**
 * Looking ahead: what each student will be charged in the coming months, and
 * how much of it their paid-ahead money already covers.
 *
 * Months that already exist (e.g. a student starting next month) use their
 * real charge and allocations. Months not created yet are estimated with the
 * driver's billing rules, exactly as they will be created on the 1st; a month
 * the holiday rule would leave for the driver to decide is estimated at the
 * full fee and flagged. Nothing here is stored — it is recomputed from the books.
 */

export interface MonthForecast {
  year: number;
  month: number;
  /** What the month costs (actual if the month exists, otherwise an estimate). */
  charge: Lisente;
  /** Paid ahead and counted toward this month. */
  covered: Lisente;
  /** Still to collect for this month. */
  toCollect: Lisente;
  /** True when the month has not been created yet, so the charge is an estimate. */
  estimate: boolean;
  /** The holiday rule will ask the driver to decide this month's charge. */
  needsDecision: boolean;
}

export const FORECAST_MONTHS = 12;

/** The coming months after today's month, for one student. Stops if the student has left. */
export function forecastStudent(account: StudentAccount, today: ISODate, rules: BillingRules, months = FORECAST_MONTHS): MonthForecast[] {
  if (account.student.status !== 'active') return [];
  const now = parts(today);
  const start = parts(account.student.onboardedAt);
  let remaining = account.credit; // paid ahead and not yet counted toward any month
  const out: MonthForecast[] = [];
  let cursor = nextMonth(now.year, now.month);
  for (let i = 0; i < months; i++, cursor = nextMonth(cursor.year, cursor.month)) {
    if (compareMonths(cursor, start) < 0) continue;
    const existing = account.periods.find((v) => v.period.year === cursor.year && v.period.month === cursor.month);
    if (existing) {
      if (existing.period.cancelled) continue;
      out.push({
        year: cursor.year,
        month: cursor.month,
        charge: existing.period.amountDue,
        covered: existing.state.amountRecorded + existing.state.writtenOff,
        toCollect: existing.state.balance,
        estimate: false,
        needsDecision: !!existing.period.needsReview,
      });
      continue;
    }
    const c = monthlyCharge(account.student.monthlyFee, cursor.year, cursor.month, account.student.school, rules);
    const covered = Math.min(c.amountDue, remaining);
    remaining -= covered;
    out.push({ year: cursor.year, month: cursor.month, charge: c.amountDue, covered, toCollect: c.amountDue - covered, estimate: true, needsDecision: c.needsReview });
  }
  return out;
}

/** The last month fully paid for, counting from next month without gaps. Null if next month is not covered. */
export function coveredUntil(forecast: MonthForecast[]): { year: number; month: number } | null {
  let last: { year: number; month: number } | null = null;
  for (const f of forecast) {
    if (f.charge > 0 && f.toCollect > 0) break;
    last = { year: f.year, month: f.month };
  }
  return last;
}

export interface MonthOutlook {
  year: number;
  month: number;
  students: number;
  expected: Lisente;
  covered: Lisente;
  toCollect: Lisente;
  fullyCovered: number;
  partlyCovered: number;
  notCovered: number;
  estimate: boolean;
  needsDecision: number;
  rows: { account: StudentAccount; forecast: MonthForecast }[];
}

/** Totals for one future month across all active students. */
export function outlookForMonth(accounts: StudentAccount[], year: number, month: number, today: ISODate, rules: BillingRules): MonthOutlook {
  const now = parts(today);
  let ahead = 0;
  for (let c = nextMonth(now.year, now.month); compareMonths(c, { year, month }) <= 0; c = nextMonth(c.year, c.month)) ahead++;
  const o: MonthOutlook = {
    year, month, students: 0, expected: 0, covered: 0, toCollect: 0, fullyCovered: 0, partlyCovered: 0, notCovered: 0,
    estimate: false, needsDecision: 0, rows: [],
  };
  if (ahead === 0) return o;
  for (const account of accounts) {
    const f = forecastStudent(account, today, rules, ahead).find((x) => x.year === year && x.month === month);
    if (!f) continue;
    o.students++;
    o.expected += f.charge;
    o.covered += f.covered;
    o.toCollect += f.toCollect;
    if (f.toCollect === 0) o.fullyCovered++;
    else if (f.covered > 0) o.partlyCovered++;
    else o.notCovered++;
    if (f.estimate) o.estimate = true;
    if (f.needsDecision) o.needsDecision++;
    o.rows.push({ account, forecast: f });
  }
  o.rows.sort((a, b) => b.forecast.covered - a.forecast.covered || a.account.student.name.localeCompare(b.account.student.name));
  return o;
}
