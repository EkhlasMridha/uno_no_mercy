import { randomBytes, timingSafeEqual } from 'node:crypto';

export function generateReconnectToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generatePlayerId(): string {
  return `p_${randomBytes(9).toString('base64url')}`;
}

/** Constant-time token comparison. */
export function tokensMatch(expected: string, provided: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
