// Light PII masking for display. Spec §46/§68 (be careful with PII).
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.slice(0, 2) + "•••••" + phone.slice(-4);
}
