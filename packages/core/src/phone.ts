/**
 * Lesotho numbers are 8 digits after the +266 country code.
 * Accepts "5812 3456", "+266 5812 3456", "26658123456", "0026658123456".
 */
export function normalizeLesothoPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('266')) digits = digits.slice(3);
  if (!/^\d{8}$/.test(digits)) return null;
  return `+266${digits}`;
}

/** Digits-only form used by wa.me links: "26658123456". */
export function whatsappNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** "+266 5812 3456" for display. */
export function formatPhone(phone: string): string {
  const m = /^\+266(\d{4})(\d{4})$/.exec(phone);
  return m ? `+266 ${m[1]} ${m[2]}` : phone;
}
