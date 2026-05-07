import type { SyncState } from '../../types/capture';

const TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  pending: ['syncing'],
  syncing: ['uploaded', 'failed', 'pending'],
  uploaded: ['acked', 'failed', 'conflicted'],
  acked: [],
  failed: ['pending', 'syncing'],
  conflicted: ['pending'],
};

export function canTransition(from: SyncState, to: SyncState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SyncState, to: SyncState): void {
  if (!canTransition(from, to)) {
    throw new Error(`sync.invalid_transition:${from}->${to}`);
  }
}

export function isTerminalSyncState(state: SyncState): boolean {
  return state === 'acked';
}
