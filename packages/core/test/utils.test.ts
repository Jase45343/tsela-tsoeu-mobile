import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acknowledgementText,
  addDays,
  formatAckNumber,
  formatMaloti,
  isISODate,
  normalizeLesothoPhone,
  parseAmount,
  reminderText,
  todayInMaseru,
  toCsv,
  whatsappLink,
} from '../src/index';

describe('money', () => {
  it('parses typed amounts, treating Rand at par', () => {
    assert.equal(parseAmount('500'), 50000);
    assert.equal(parseAmount('M1,200.5'), 120050);
    assert.equal(parseAmount('R 300'), 30000);
    assert.equal(parseAmount('0'), null);
    assert.equal(parseAmount('12.345'), null);
    assert.equal(parseAmount('abc'), null);
  });
  it('formats maloti', () => {
    assert.equal(formatMaloti(3200000), 'M32,000');
    assert.equal(formatMaloti(50050), 'M500.50');
    assert.equal(formatMaloti(-60000), '−M600');
  });
});

describe('phones', () => {
  it('normalises Lesotho numbers to +266', () => {
    assert.equal(normalizeLesothoPhone('5812 3456'), '+26658123456');
    assert.equal(normalizeLesothoPhone('+266 5812-3456'), '+26658123456');
    assert.equal(normalizeLesothoPhone('0026658123456'), '+26658123456');
    assert.equal(normalizeLesothoPhone('5812345'), null);
  });
});

describe('dates', () => {
  it('uses Maseru local date (UTC+2)', () => {
    assert.equal(todayInMaseru(new Date('2026-10-05T22:30:00Z')), '2026-10-06');
    assert.equal(todayInMaseru(new Date('2026-10-05T21:30:00Z')), '2026-10-05');
  });
  it('adds days and validates', () => {
    assert.equal(addDays('2026-12-28', 7), '2027-01-04');
    assert.equal(isISODate('2026-02-29'), false);
    assert.equal(isISODate('2028-02-29'), true);
  });
});

describe('messages', () => {
  const data = {
    number: formatAckNumber('DEV3', 142),
    businessName: 'Thabo Transport',
    studentName: 'Mpho',
    amount: 50000,
    paymentDate: '2026-10-06',
    method: 'M-Pesa',
    balance: -20000,
    balanceAsOf: '6 October 2026, 14:05',
    balanceProvisional: true,
  };
  it('states it is not a fiscal receipt and shows the balance basis', () => {
    const t = acknowledgementText(data);
    assert.match(t, /DEV3-000142/);
    assert.match(t, /not a tax or fiscal receipt/);
    assert.match(t, /Paid ahead \(credit\) as of 6 October 2026, 14:05 \(not yet confirmed online\): M200/);
  });
  it('builds reminders with no payment link', () => {
    const t = reminderText({ parentName: 'Palesa', studentName: 'Mpho', businessName: 'Thabo Transport', periods: [{ year: 2026, month: 9, balance: 40000 }], total: 40000 });
    assert.match(t, /September 2026 \(M400\)/);
    assert.doesNotMatch(t, /http/);
    assert.match(whatsappLink('+26658123456', 'hi there'), /^https:\/\/wa\.me\/26658123456\?text=hi%20there$/);
  });
});

describe('csv', () => {
  it('escapes and neutralises formulas', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=SUM(A1)' }], [{ header: 'a', value: (r) => r.a }, { header: 'b', value: (r) => r.b }]);
    assert.equal(csv, 'a,b\r\n"x,""y""",\'=SUM(A1)\r\n');
  });
});
