import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildStudentAccount,
  buildPeriod,
  DEFAULT_BILLING_RULES,
  DEFAULT_SETTINGS,
  defaultFirstChoice,
  firstDueDate,
  firstMonthCharge,
  monthDays,
  monthlyCharge,
  periodsToGenerate,
  type BillingRules,
  type SchoolClosure,
  type Student,
} from '../src/index';

const M = (m: number) => m * 100;

// A school that closes on 4 December 2026 and reopens on 19 January 2027.
const summer: SchoolClosure = { id: 'c1', school: 'Maseru Prep', from: '2026-12-05', to: '2027-01-18', label: 'Summer holidays' };
const rules = (over: Partial<BillingRules> = {}): BillingRules => ({ ...DEFAULT_BILLING_RULES, closures: [summer], ...over });

describe('school days', () => {
  it('counts weekdays the bus runs for that school only', () => {
    assert.deepEqual(monthDays(2026, 12, 'Maseru Prep', [summer]), { normal: 23, open: 4 });
    assert.deepEqual(monthDays(2027, 1, '  maseru  PREP ', [summer]), { normal: 21, open: 9 });
    assert.deepEqual(monthDays(2026, 12, 'Other School', [summer]), { normal: 23, open: 23 });
  });

  it('applies an all-schools closure to everyone', () => {
    const publicHoliday: SchoolClosure = { id: 'p', school: null, from: '2026-10-05', to: '2026-10-05', label: 'Public holiday' };
    assert.equal(monthDays(2026, 10, 'Anything', [publicHoliday]).open, 21);
  });
});

describe('holiday rule', () => {
  it('same fee: holidays change nothing (the default)', () => {
    assert.deepEqual(monthlyCharge(M(1000), 2026, 12, 'Maseru Prep', rules()), { amountDue: M(1000), needsReview: false, note: null });
  });

  it('by days: scales to whole maloti', () => {
    const c = monthlyCharge(M(1000), 2026, 12, 'Maseru Prep', rules({ holidayRule: 'by_days' }));
    assert.equal(c.amountDue, M(174)); // 4/23 of M1000 = 173.9
    assert.equal(c.note, '4/23');
  });

  it('half or ask: full when at least half the month runs, otherwise flagged for the driver', () => {
    const r = rules({ holidayRule: 'half_or_ask' });
    assert.deepEqual(monthlyCharge(M(1000), 2026, 12, 'Maseru Prep', r), { amountDue: M(1000), needsReview: true, note: '4/23' });
    assert.equal(monthlyCharge(M(1000), 2027, 1, 'Maseru Prep', r).needsReview, true); // 9 of 21
    const shortBreak: SchoolClosure = { id: 'b', school: null, from: '2026-10-26', to: '2026-10-30', label: 'Mid-term' };
    assert.deepEqual(monthlyCharge(M(1000), 2026, 10, 'X', rules({ holidayRule: 'half_or_ask', closures: [shortBreak] })), { amountDue: M(1000), needsReview: false, note: '17/22' });
  });

  it('is applied when months are generated', () => {
    const s: Pick<Student, 'id' | 'status' | 'monthlyFee' | 'onboardedAt' | 'school'> = { id: 's', status: 'active', monthlyFee: M(1000), onboardedAt: '2026-11-03', school: 'Maseru Prep' };
    const out = periodsToGenerate([s], [{ studentId: 's', year: 2026, month: 11 }], '2027-01-05', rules({ holidayRule: 'by_days' }));
    assert.deepEqual(out.map((p) => [p.month, p.amountDue]), [[12, M(174)], [1, M(429)]]);
  });
});

describe('first month rule', () => {
  it('suggests a choice from the rule', () => {
    assert.equal(defaultFirstChoice('2026-10-20', rules()), 'full');
    assert.equal(defaultFirstChoice('2026-10-20', rules({ firstMonthRule: 'half_after', halfCutoffDay: 20 })), 'half');
    assert.equal(defaultFirstChoice('2026-10-19', rules({ firstMonthRule: 'half_after', halfCutoffDay: 20 })), 'full');
    assert.equal(defaultFirstChoice('2026-10-15', rules({ firstMonthRule: 'prorata' })), 'prorata');
    assert.equal(defaultFirstChoice('2026-10-01', rules({ firstMonthRule: 'prorata' })), 'full');
  });

  it('pro-rata counts school days left, respecting closures', () => {
    assert.equal(firstMonthCharge(M(1000), '2026-10-15', 'X', rules(), 'prorata').amountDue, M(545)); // 12/22
    assert.equal(firstMonthCharge(M(1000), '2026-12-01', 'Maseru Prep', rules(), 'prorata').amountDue, M(174)); // 4/23
  });

  it('first payment falls due on the start date', () => {
    assert.equal(firstDueDate('2026-10-01', '2026-10-09'), '2026-10-09');
    assert.equal(firstDueDate('2026-11-01', '2026-10-28'), '2026-11-01');
  });
});

describe('months that have not begun', () => {
  const student: Student = {
    id: 's', name: 'Thabo', parentName: 'P', parentPhone: '+26658123456', school: 'X', pickupLocation: '', dropoffLocation: '',
    monthlyFee: M(1000), onboardedAt: '2026-11-03', status: 'active',
  };
  const nov = { ...buildPeriod({ id: 'nov', studentId: 's', year: 2026, month: 11, amountDue: M(1000), dueDay: 1, origin: 'onboarding' }), dueDate: '2026-11-03' };

  it('are not owed before they begin', () => {
    const acc = buildStudentAccount({ student, periods: [nov], payments: [], adjustments: [], today: '2026-10-09', settings: DEFAULT_SETTINGS });
    assert.equal(acc.outstanding, 0);
    assert.equal(acc.status, 'current');
    assert.equal(acc.periods[0]!.upcoming, true);
  });

  it('show money paid early as paid ahead', () => {
    const pay = { id: 'p', studentId: 's', amount: M(1000), method: 'Cash', paymentDate: '2026-10-09', source: 'manual' as const, createdAt: '2026-10-09T08:00:00Z' };
    const acc = buildStudentAccount({ student, periods: [nov], payments: [pay], adjustments: [], today: '2026-10-09', settings: DEFAULT_SETTINGS });
    assert.equal(acc.prepaid, M(1000));
    assert.equal(acc.net, -M(1000));
    assert.equal(acc.status, 'in_advance');
  });

  it('become owed once they begin, from the start date plus grace', () => {
    const acc = buildStudentAccount({ student, periods: [nov], payments: [], adjustments: [], today: '2026-11-10', settings: DEFAULT_SETTINGS });
    assert.equal(acc.outstanding, M(1000));
    assert.equal(acc.arrears, 0); // due 3 Nov + 7 days grace = overdue from 11 Nov
    const later = buildStudentAccount({ student, periods: [nov], payments: [], adjustments: [], today: '2026-11-11', settings: DEFAULT_SETTINGS });
    assert.equal(later.maxDaysOverdue, 1);
  });
});

describe('write-offs', () => {
  const student: Student = {
    id: 's', name: 'Lineo', parentName: 'P', parentPhone: '+26658123456', school: 'X', pickupLocation: '', dropoffLocation: '',
    monthlyFee: M(1000), onboardedAt: '2026-08-01', status: 'active',
  };
  const per = (m: number) => buildPeriod({ id: `p${m}`, studentId: 's', year: 2026, month: m, amountDue: M(1000), dueDay: 1, origin: 'server' });
  const cash = (amount: number, date: string, id = `c-${date}`) => ({ id, studentId: 's', amount, method: 'Cash', paymentDate: date, source: 'manual' as const, createdAt: `${date}T08:00:00Z` });
  const writeOff = (amount: number, periodId: string, over: Record<string, unknown> = {}) => ({
    id: `w-${periodId}`, studentId: 's', amount, method: 'Write-off', paymentDate: '2026-10-10', source: 'write_off' as const,
    createdAt: '2026-10-10T08:00:00Z', writeOffPeriodId: periodId, note: 'Family hardship', ...over,
  });

  it('forgives one specific month, not the oldest', () => {
    const acc = buildStudentAccount({ student, periods: [per(8), per(9), per(10)], payments: [writeOff(M(1000), 'p9')], adjustments: [], today: '2026-10-20', settings: DEFAULT_SETTINGS });
    const sep = acc.periods.find((v) => v.period.id === 'p9')!;
    assert.equal(sep.state.writtenOff, M(1000));
    assert.equal(sep.state.balance, 0);
    assert.equal(acc.outstanding, M(2000)); // August and October still owed
    assert.equal(acc.writtenOff, M(1000));
  });

  it('never becomes paid-ahead money, and is not money received', () => {
    const acc = buildStudentAccount({ student, periods: [per(10)], payments: [cash(M(600), '2026-10-02'), writeOff(M(900), 'p10')], adjustments: [], today: '2026-10-20', settings: DEFAULT_SETTINGS });
    const oct = acc.periods[0]!.state;
    assert.equal(oct.writtenOff, M(900)); // applied first, capped by the month's charge
    assert.equal(oct.amountRecorded, M(100));
    assert.equal(acc.paidAhead, M(500)); // the real cash beyond what was still owed
    assert.equal(acc.ledger.totalRecorded, M(600));
  });

  it('can be undone by voiding it', () => {
    const acc = buildStudentAccount({ student, periods: [per(10)], payments: [writeOff(M(1000), 'p10', { voidedAt: '2026-10-11T08:00:00Z' })], adjustments: [], today: '2026-10-20', settings: DEFAULT_SETTINGS });
    assert.equal(acc.outstanding, M(1000));
    assert.equal(acc.writtenOff, 0);
  });
});
