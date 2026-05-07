/**
 * events-repo.ts — sync_events 表 CRUD
 *
 * 同步生命周期事件日志。支持 append / listByCapture / listRecent / gc。
 *
 * @see docs/DATA-MODEL.md §1.2, §5.2
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 8
 *
 */

import type { SyncEventRow } from '../../types/capture';
import type { SyncEventName } from '../../types/sync';
import type { SQLiteDatabaseLike, SQLiteValue } from './sqlite';

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
  if (opts.keepPerCapture === undefined && opts.olderThanDays === undefined) {
    return { deleted: 0 };
  }

  const where: string[] = [];
  const params: SQLiteValue[] = [];
  if (opts.olderThanDays !== undefined) {
    where.push(`timestamp < ?`);
    params.push(new Date(Date.now() - opts.olderThanDays * 24 * 60 * 60 * 1000).toISOString());
  }
  if (opts.keepPerCapture !== undefined) {
    where.push(`id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY capture_id
            ORDER BY timestamp DESC, id DESC
          ) AS rank
        FROM sync_events
      )
      WHERE rank > ?
    )`);
    params.push(opts.keepPerCapture);
  }

  const result = await db.runAsync(`DELETE FROM sync_events WHERE ${where.join(' OR ')}`, params);
  return { deleted: result.changes };
}
