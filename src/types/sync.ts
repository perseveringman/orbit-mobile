/**
 * types/sync.ts — 同步层领域类型
 *
 * SyncEventName 与 backoff 计算的输入/输出契约。
 *
 * @see docs/SYNC-PROTOCOL.md
 *
 * TODO(M3): SyncEventName / RetrySchedule / TransportResult
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
  | 'reset';
