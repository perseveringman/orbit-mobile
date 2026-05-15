/**
 * types/sync.ts — 同步层领域类型
 *
 * SyncEventName 与 backoff/transport 计算的输入/输出契约。
 *
 * @see docs/SYNC-PROTOCOL.md
 */

export type SyncEventName =
  | 'created'
  | 'enqueued'
  | 'started'
  | 'uploaded'
  | 'ack'
  | 'failed'
  | 'retried'
  | 'manual_retry'
  | 'reset'
  | 'attempts_exhausted'
  | 'ai_generated'
  | 'ai_retry'
  | 'ai_failed';

export interface RetrySchedule {
  attempts: number;
  nextRetryAt: string | null;
  delayMs: number | null;
  exhausted: boolean;
}

export interface TransportResult {
  remotePath: string;
  uploaded: boolean;
  retryable?: boolean;
  error?: string;
}

export interface SyncStatusCounts {
  pending: number;
  syncing: number;
  uploaded: number;
  acked: number;
  failed: number;
  conflicted: number;
}
