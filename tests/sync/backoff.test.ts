import { describe, expect, it } from 'vitest';

import { computeNextRetryAt } from '@/core/sync/backoff';

describe('sync backoff', () => {
  it('uses the documented retry schedule and caps at one hour', () => {
    const now = new Date('2026-05-07T00:00:00.000Z');

    expect(computeNextRetryAt(1, now)).toBe('2026-05-07T00:00:00.000Z');
    expect(computeNextRetryAt(2, now)).toBe('2026-05-07T00:00:05.000Z');
    expect(computeNextRetryAt(3, now)).toBe('2026-05-07T00:00:30.000Z');
    expect(computeNextRetryAt(6, now)).toBe('2026-05-07T01:00:00.000Z');
    expect(computeNextRetryAt(99, now)).toBe('2026-05-07T01:00:00.000Z');
  });
});
