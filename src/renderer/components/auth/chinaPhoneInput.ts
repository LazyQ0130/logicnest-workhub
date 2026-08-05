export const CHINA_CALLING_CODE = '+86';

export function normalizeChinaMobileInput(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00861')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('861')) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

export function formatChinaMobileE164(value: string): string {
  return `${CHINA_CALLING_CODE}${normalizeChinaMobileInput(value)}`;
}
