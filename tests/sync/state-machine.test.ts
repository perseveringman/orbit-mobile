import { describe, expect, it } from 'vitest';

import { assertTransition, canTransition, isTerminalSyncState } from '@/core/sync/state-machine';

describe('sync state machine', () => {
  it('allows only documented transitions', () => {
    expect(canTransition('pending', 'syncing')).toBe(true);
    expect(canTransition('syncing', 'uploaded')).toBe(true);
    expect(canTransition('uploaded', 'acked')).toBe(true);
    expect(canTransition('pending', 'acked')).toBe(false);
    expect(() => assertTransition('acked', 'pending')).toThrow(
      'sync.invalid_transition:acked->pending',
    );
    expect(isTerminalSyncState('acked')).toBe(true);
  });
});
