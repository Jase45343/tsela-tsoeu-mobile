import { formatDateLong, formatMonth, type Lang } from './dates';
import { formatMaloti } from './money';
import { whatsappNumber } from './phone';
import type { ISODate, Lisente } from './types';

/**
 * Sesotho strings in this file are a first draft and must be reviewed by a
 * native speaker before release (see README, "Translations").
 */

export function formatAckNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}

export interface AcknowledgementData {
  number: string;
  businessName: string;
  studentName: string;
  amount: Lisente;
  paymentDate: ISODate;
  method: string;
  reference?: string | null;
  balance: Lisente;
  /** When the balance figure was computed, e.g. "6 October 2026, 14:05". */
  balanceAsOf: string;
  /** True when the balance has not yet been confirmed by the server. */
  balanceProvisional: boolean;
}

const ACK: Record<Lang, {
  title: string; student: string; amount: string; date: string; method: string; reference: string;
  balance: (asOf: string) => string; credit: (asOf: string) => string; pending: string; footer: (b: string) => string;
}> = {
  en: {
    title: 'Payment acknowledgement',
    student: 'Student',
    amount: 'Amount',
    date: 'Date paid',
    method: 'Method',
    reference: 'Reference',
    balance: (asOf) => `Balance still owed as of ${asOf}`,
    credit: (asOf) => `Paid ahead as of ${asOf}`,
    pending: 'not yet confirmed online',
    footer: (b) => `${b} has recorded this payment. This is an acknowledgement for your reference, not a tax or fiscal receipt.`,
  },
  st: {
    title: 'Netefatso ea tefo',
    student: 'Seithuti',
    amount: 'Chelete',
    date: 'Letsatsi la tefo',
    method: 'Mokhoa',
    reference: 'Nomoro ea tšupiso',
    balance: (asOf) => `Chelete e ntseng e kolotoa ho tloha ka ${asOf}`,
    credit: (asOf) => `E lefetsoe esale pele ho tloha ka ${asOf}`,
    pending: 'ha e so netefatsoe inthaneteng',
    footer: (b) => `${b} e ngolisitse tefo ena. Ena ke netefatso bakeng sa hau, ha se rasiti ea lekhetho.`,
  },
};

export function acknowledgementLines(d: AcknowledgementData, lang: Lang = 'en'): { title: string; rows: [string, string][]; footer: string } {
  const t = ACK[lang];
  const rows: [string, string][] = [
    [t.student, d.studentName],
    [t.amount, formatMaloti(d.amount)],
    [t.date, formatDateLong(d.paymentDate, lang)],
    [t.method, d.method],
  ];
  if (d.reference) rows.push([t.reference, d.reference]);
  const pending = d.balanceProvisional ? ` (${t.pending})` : '';
  if (d.balance < 0) rows.push([t.credit(d.balanceAsOf) + pending, formatMaloti(-d.balance)]);
  else rows.push([t.balance(d.balanceAsOf) + pending, formatMaloti(d.balance)]);
  return { title: `${t.title} ${d.number}`, rows, footer: t.footer(d.businessName) };
}

export function acknowledgementText(d: AcknowledgementData, lang: Lang = 'en'): string {
  const { title, rows, footer } = acknowledgementLines(d, lang);
  return [title, d.businessName, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', footer].join('\n');
}

export interface ReminderData {
  parentName: string;
  studentName: string;
  businessName: string;
  periods: { year: number; month: number; balance: Lisente }[];
  total: Lisente;
  /** Free text typed by the operator, e.g. how they prefer to be paid. */
  instructions?: string;
}

/** FR-025: informational only — no payment links, never sent automatically. */
export function reminderText(d: ReminderData, lang: Lang = 'en'): string {
  const months = d.periods.map((p) => `${formatMonth(p.year, p.month, lang)} (${formatMaloti(p.balance)})`).join(', ');
  const extra = d.instructions?.trim() ? `\n\n${d.instructions.trim()}` : '';
  if (lang === 'st') {
    return `Lumela ${d.parentName}. Sena ke khopotso e tsoang ho ${d.businessName}: chelete ea leeto la sekolo la ${d.studentName} e sa lefuoa bakeng sa ${months}. Kakaretso ke ${formatMaloti(d.total)}.${extra}\n\nKea leboha.`;
  }
  return `Hello ${d.parentName}. This is a reminder from ${d.businessName} that ${d.studentName}'s school transport fees are outstanding for ${months}. Total owed: ${formatMaloti(d.total)}.${extra}\n\nThank you.`;
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
}
