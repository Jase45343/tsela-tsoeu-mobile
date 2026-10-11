import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBook,
  buildPeriod,
  buildStudentAccount,
  computeLedger,
  DEFAULT_SETTINGS,
  firstPeriodAmount,
  periodsToGenerate,
  suggestFirstPeriodChoice,
  summarizeMonth,
  dailyReport,
  type BillingPeriod,
  type CreditAdjustment,
  type Payment,
  type Student,
} from '../src/index';

const M = (maloti: number) => maloti * 100;

const student = (over: Partial<Student> = {}): Student => ({
  id: 'mpho',
  name: 'Mpho Mokoena',
  parentName: "'Me Palesa",
  parentPhone: '+26658123456',
  school: 'Maseru Prep',
  pickupLocation: 'Ha Thetsane',
  dropoffLocation: 'Maseru Prep',
  monthlyFee: M(1000),
  onboardedAt: '2026-08-04',
  status: 'active',
  ...over,
});

const period = (month: number, amount = M(1000), over: Partial<BillingPeriod> = {}): BillingPeriod => ({
  ...buildPeriod({ id: `p${month}`, studentId: 'mpho', year: 2026, month, amountDue: amount, dueDay: 1, origin: 'server' }),
  ...over,
});

let seq = 0;
const pay = (amount: number, date: string, over: Partial<Payment> = {}): Payment => ({
  id: `pay${++seq}`,
  studentId: 'mpho',
  amount,
  method: 'Cash',
  paymentDate: date,
  source: 'manual',
  createdAt: `${date}T08:00:00.000Z`,
  ...over,
});

const adj = (amount: number, createdAt: string, over: Partial<CreditAdjustment> = {}): CreditAdjustment => ({
  id: `adj-${createdAt}`,
  studentId: 'mpho',
  type: 'refunded_outside_app',
  amount,
  reason: 'Returned to parent',
  createdAt,
  ...over,
});

describe('FIFO allocation', () => {
  it('allocates a partial payment to the oldest period', () => {
    const l = computeLedger({ periods: [period(9), period(8)], payments: [pay(M(600), '2026-09-10')], adjustments: [] });
    assert.equal(l.periods.get('p8')!.amountRecorded, M(600));
    assert.equal(l.periods.get('p8')!.status, 'partial');
    assert.equal(l.periods.get('p9')!.status, 'unpaid');
    assert.equal(l.credit, 0);
  });

  it('splits one payment across several periods (US-012)', () => {
    const l = computeLedger({ periods: [period(8), period(9), period(10)], payments: [pay(M(2500), '2026-08-02')], adjustments: [] });
    assert.deepEqual(
      l.allocations.map((a) => [a.targetId, a.amount]),
      [['p8', M(1000)], ['p9', M(1000)], ['p10', M(500)]],
    );
    assert.equal(l.periods.get('p10')!.status, 'partial');
  });

  it('turns an overpayment into credit and applies it to a later period', () => {
    const before = computeLedger({ periods: [period(8)], payments: [pay(M(1500), '2026-08-02')], adjustments: [] });
    assert.equal(before.credit, M(500));
    const after = computeLedger({ periods: [period(8), period(9)], payments: [pay(M(1500), '2026-08-02', { id: 'x' })], adjustments: [] });
    assert.equal(after.credit, 0);
    assert.equal(after.periods.get('p9')!.amountRecorded, M(500));
  });

  it('orders by payment date, so a late-syncing back-dated payment lands first', () => {
    const p1 = pay(M(1000), '2026-09-05', { id: 'later', createdAt: '2026-09-05T08:00:00Z' });
    const p2 = pay(M(1000), '2026-08-20', { id: 'earlier', createdAt: '2026-09-30T08:00:00Z' });
    const l = computeLedger({ periods: [period(8), period(9)], payments: [p1, p2], adjustments: [] });
    assert.equal(l.allocations.find((a) => a.targetId === 'p8')!.paymentId, 'earlier');
  });

  it('is deterministic regardless of input order', () => {
    const periods = [period(8), period(9), period(10)];
    const payments = [pay(M(700), '2026-08-03'), pay(M(900), '2026-09-01'), pay(M(1400), '2026-09-01'), pay(M(50), '2026-10-02')];
    const a = computeLedger({ periods, payments, adjustments: [] });
    const b = computeLedger({ periods: [...periods].reverse(), payments: [...payments].reverse(), adjustments: [] });
    assert.deepEqual(a.allocations, b.allocations);
    assert.deepEqual([...a.periods.entries()].sort(), [...b.periods.entries()].sort());
  });

  it('reallocates when a payment is voided', () => {
    const payments = [pay(M(1000), '2026-08-02', { id: 'a', voidedAt: '2026-08-03T10:00:00Z' }), pay(M(1000), '2026-09-02', { id: 'b' })];
    const l = computeLedger({ periods: [period(8), period(9)], payments, adjustments: [] });
    assert.equal(l.periods.get('p8')!.status, 'paid');
    assert.equal(l.periods.get('p9')!.status, 'unpaid');
    assert.equal(l.totalRecorded, M(1000));
  });

  it('marks a free first period as paid with nothing recorded', () => {
    const l = computeLedger({ periods: [period(8, 0)], payments: [], adjustments: [] });
    assert.equal(l.periods.get('p8')!.status, 'paid');
  });

  it('returns money from a cancelled period to credit (FR-010)', () => {
    const periods = [period(8), period(9, M(1000), { cancelled: true })];
    const l = computeLedger({ periods, payments: [pay(M(2000), '2026-08-01')], adjustments: [] });
    assert.equal(l.periods.get('p9')!.status, 'cancelled');
    assert.equal(l.periods.get('p9')!.balance, 0);
    assert.equal(l.credit, M(1000));
  });
});

describe('credit adjustments (FR-039)', () => {
  it('a refund consumes credit before any later period can', () => {
    const payments = [pay(M(1500), '2026-08-02')];
    const refund = adj(M(500), '2026-08-20T09:00:00Z');
    const l = computeLedger({ periods: [period(8), period(9)], payments, adjustments: [refund] });
    assert.equal(l.adjustmentsCovered.get(refund.id), M(500));
    assert.equal(l.periods.get('p9')!.amountRecorded, 0);
    assert.equal(l.credit, 0);
    assert.deepEqual(l.unfundedAdjustmentIds, []);
  });

  it('flags an adjustment that exceeds available credit', () => {
    const l = computeLedger({ periods: [period(8)], payments: [pay(M(1200), '2026-08-02')], adjustments: [adj(M(500), '2026-08-20T09:00:00Z')] });
    assert.equal(l.adjustmentsCovered.get('adj-2026-08-20T09:00:00Z'), M(200));
    assert.equal(l.unfundedAdjustmentIds.length, 1);
  });
});

describe('periods', () => {
  it('suggests full before the 15th and half from the 15th', () => {
    assert.equal(suggestFirstPeriodChoice('2026-10-14'), 'full');
    assert.equal(suggestFirstPeriodChoice('2026-10-15'), 'half');
  });

  it('computes first-period amounts', () => {
    assert.equal(firstPeriodAmount(M(1000), 'half'), M(500));
    assert.equal(firstPeriodAmount(M(1000), 'free'), 0);
    assert.equal(firstPeriodAmount(M(1000), 'custom', M(300)), M(300));
    assert.throws(() => firstPeriodAmount(M(1000), 'custom'));
  });

  it('clamps the due day to the month', () => {
    assert.equal(buildPeriod({ id: 'x', studentId: 's', year: 2026, month: 2, amountDue: 1, dueDay: 31, origin: 'server' }).dueDate, '2026-02-28');
  });

  it('generates missing months at the current fee, skipping existing and inactive', () => {
    const students = [student(), student({ id: 'thabo', onboardedAt: '2026-10-03' }), student({ id: 'gone', status: 'inactive' })];
    const existing = [{ studentId: 'mpho', year: 2026, month: 8 }];
    const out = periodsToGenerate(students, existing, '2026-10-06');
    assert.deepEqual(
      out.map((p) => `${p.studentId}:${p.month}`),
      ['mpho:9', 'mpho:10', 'thabo:10'],
    );
  });

  it('crosses a year boundary', () => {
    const out = periodsToGenerate([student()], [{ studentId: 'mpho', year: 2026, month: 12 }], '2027-01-01');
    assert.deepEqual(out.map((p) => [p.year, p.month]), [[2027, 1]]);
  });
});

describe('accounts and status', () => {
  const settings = DEFAULT_SETTINGS; // due on the 1st, 7 grace days

  it('is not overdue inside the grace period', () => {
    const acc = buildStudentAccount({ student: student(), periods: [period(10)], payments: [], adjustments: [], today: '2026-10-08', settings });
    assert.equal(acc.arrears, 0);
    assert.equal(acc.status, 'current');
    assert.equal(acc.outstanding, M(1000));
  });

  it('is in arrears after the grace period, counting days from the end of grace', () => {
    const acc = buildStudentAccount({ student: student(), periods: [period(10)], payments: [], adjustments: [], today: '2026-10-12', settings });
    assert.equal(acc.status, 'in_arrears');
    assert.equal(acc.maxDaysOverdue, 4);
    assert.equal(acc.arrears, M(1000));
  });

  it('is in advance when credit remains and nothing is overdue', () => {
    const acc = buildStudentAccount({ student: student(), periods: [period(10)], payments: [pay(M(1600), '2026-10-01')], adjustments: [], today: '2026-10-20', settings });
    assert.equal(acc.status, 'in_advance');
    assert.equal(acc.credit, M(600));
    assert.equal(acc.net, -M(600));
  });
});

describe('reports', () => {
  it('matches the SRS dashboard shape: expected − recorded = outstanding', () => {
    const s2 = student({ id: 'lineo', name: 'Lineo' });
    const periods: BillingPeriod[] = [
      period(9),
      period(10),
      { ...period(10), id: 'l10', studentId: 'lineo' },
    ];
    const payments = [pay(M(1000), '2026-10-02'), { ...pay(M(400), '2026-10-03'), studentId: 'lineo' }];
    const accounts = buildBook({ students: [student(), s2], periods, payments, adjustments: [], today: '2026-10-20', settings: DEFAULT_SETTINGS });
    const s = summarizeMonth(accounts, 2026, 10);
    assert.equal(s.expected, M(2000));
    // Mpho's payment went FIFO to September, so October shows nothing recorded for him.
    assert.equal(s.recorded, M(400));
    assert.equal(s.outstanding, s.expected - s.recorded - s.writtenOff);
    assert.equal(s.received, M(1400));
    assert.equal(s.partial, 1);
    assert.equal(s.unpaid, 1);
    assert.equal(s.arrearsEarlier, 0);
  });

  it('breaks a day down by method, excluding voided records', () => {
    const r = dailyReport(
      [pay(M(500), '2026-10-06'), pay(M(300), '2026-10-06', { method: 'M-Pesa' }), pay(M(200), '2026-10-06', { voidedAt: '2026-10-06T10:00:00Z' }), pay(M(100), '2026-10-05')],
      '2026-10-06',
    );
    assert.equal(r.count, 2);
    assert.equal(r.total, M(800));
    assert.deepEqual(r.byMethod.map((m) => m.method), ['Cash', 'M-Pesa']);
  });
});
