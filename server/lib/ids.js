import { randomBytes } from 'node:crypto';

export function createId(prefix) {
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}