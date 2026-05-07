/**
 * events-repo.ts — sync_events 表 CRUD
 *
 * 同步生命周期事件日志。M1 仅实现 append / listByCapture / listRecent；
 * gc 的 keepPerCapture（窗口函数）留给 M3，先实现 olderThanDays 一刀。
 *
 * @see docs/DATA-MODEL.md §1.2, §5.2
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 8
 *
 * TODO(M3): gc(keepPerCapture) 窗口函数实现
 */

import type { SyncEventRow } from '../../types/capture';
import type { SQLiteDatabaseLike, SQLiteValue } from './sqlite';

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

export async function append(
  db: SQLiteDatabaseLike,
  captureId: string,
  event: SyncEventName,
  details?: Record<string, unknown>,
  timestamp = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_events (capture_id, event, timestamp, details_json)
     VALUES (?, ?, ?, ?)`,
    [captureId, event, timestamp, details === undefined ? null : JSON.stringify(details)],
  );
}

export async function listByCapture(
  db: SQLiteDatabaseLike,
  captureId: string,
  opts: { limit?: number } = {},
): Promise<SyncEventRow[]> {
  const params: SQLiteValue[] = [captureId];
  let sql = `SELECT * FROM sync_events WHERE capture_id = ? ORDER BY timestamp DESC, id DESC`;
  if (opts.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  return db.getAllAsync<SyncEventRow>(sql, params);
}

export async function listRecent(
  db: SQLiteDatabaseLike,
  opts: { limit?: number } = {},
): Promise<SyncEventRow[]> {
  const params: SQLiteValue[] = [];
  let sql = `SELECT * FROM sync_events ORDER BY timestamp DESC, id DESC`;
  if (opts.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  return db.getAllAsync<SyncEventRow>(sql, params);
}

export async function gc(
  db: SQLiteDatabaseLike,
  opts: { olderThanDays?: number; keepPerCapture?: number },
): Promise<{ deleted: number }> {
  if (opts.keepPerCapture !== undefined) {
    throw new Error('events.gc.keep_per_capture_not_implemented');
  }
  if (opts.olderThanDays === undefined) {
    return { deleted: 0 };
  }

  const cutoff = new Date(Date.now() - opts.olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.runAsync(`DELETE FROM sync_events WHERE timestamp < ?`, [cutoff]);
  return { deleted: result.changes };
}
