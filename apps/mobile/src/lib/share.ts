import { Linking } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import {
  acknowledgementLines, acknowledgementText, creditAdjustmentsCsv, paymentsCsv, studentsCsv, whatsappLink,
  type AcknowledgementData, type Lang, type StudentAccount,
} from '@busledger/core';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** FR-024: share the acknowledgement as a PDF through the system share sheet (WhatsApp included). */
export async function shareAcknowledgementPdf(d: AcknowledgementData, lang: Lang): Promise<void> {
  const { title, rows, footer } = acknowledgementLines(d, lang);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:sans-serif;color:#0E1726;margin:40px;font-size:15px}
    h1{font-size:22px;margin:0 0 4px} .biz{font-size:16px;margin:0 0 24px;color:#3D4A5C}
    table{border-collapse:collapse;width:100%} td{padding:10px 0;border-bottom:1px solid #C9D1DB;vertical-align:top}
    td.v{text-align:right;font-weight:bold} .foot{margin-top:28px;font-size:13px;color:#3D4A5C}
  </style></head><body><h1>${esc(title)}</h1><p class="biz">${esc(d.businessName)}</p><table>
  ${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')}
  </table><p class="foot">${esc(footer)}</p></body></html>`;
  const { uri } = await Print.printToFileAsync({ html, width: 420, height: 595 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
}

/** Opens WhatsApp with the text filled in; the operator presses send (FR-024, FR-025). */
export async function openWhatsApp(phone: string, text: string): Promise<void> {
  await Linking.openURL(whatsappLink(phone, text));
}

export function acknowledgementPlainText(d: AcknowledgementData, lang: Lang): string {
  return acknowledgementText(d, lang);
}

/** FR-029: export works offline from the data on the phone. */
export async function shareCsv(kind: 'students' | 'payments' | 'returned', accounts: StudentAccount[]): Promise<void> {
  const csv = kind === 'students' ? studentsCsv(accounts) : kind === 'payments' ? paymentsCsv(accounts) : creditAdjustmentsCsv(accounts);
  const file = new File(Paths.cache, `tsela-tsoeu-${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: kind });
}
