import { randomBytes, timingSafeEqual } from 'node:crypto';

export function createMutationToken(): string {
  return randomBytes(32).toString('hex');
}

export function hasValidMutationToken(
  provided: string | null | undefined,
  expected: string
): boolean {
  if (typeof provided !== 'string' || provided.length === 0) {
    return false;
  }

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}
