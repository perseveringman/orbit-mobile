/**
 * captures-repo.ts — captures 表 CRUD
 *
 * 所有函数第一参数是 db: SQLiteDatabase（便于测试注入 in-memory 库）。
 * updateSyncState 的动态 SQL 必须用列名白名单防注入。
 *
 * @see docs/DATA-MODEL.md §1.1
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 6
 *
 */

import type { CaptureKind, CaptureRow, SyncState } from '../../types/capture';
import type { SQLiteDatabaseLike, SQLiteValue } from './sqlite';

export interface InsertCaptureInput {
  id: string;
  created_at: string;
  captured_at_local: string;
  kind: CaptureKind;
  content_preview?: string | null;
  content_hash: string;
  byte_size: number;
  has_audio?: boolean;
  has_image?: boolean;
  attachment_count?: number;
  sync_state?: SyncState;
  sync_attempts?: number;
  sync_last_error?: string | null;
  sync_last_try_at?: string | null;
  sync_next_retry_at?: string | null;
  uploaded_at?: string | null;
  acked_at?: string | null;
  ack_vault_path?: string | null;
  local_path: string;
  deleted_locally?: boolean;
  metadata_json?: string | null;
  schema_version?: number;
}

export type SyncStatePatch = Partial<
  Pick<
    CaptureRow,
    | 'sync_state'
    | 'sync_attempts'
    | 'sync_last_error'
    | 'sync_last_try_at'
    | 'sync_next_retry_at'
    | 'uploaded_at'
    | 'acked_at'
    | 'ack_vault_path'
  >
>;

export interface LocalMetadataPatch {
  byte_size?: number;
  content_hash?: string;
  content_preview?: string | null;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface ListByStateOptions {
  limit?: number;
  dueBefore?: string;
}

const SYNC_STATES: readonly SyncState[] = [
  'pending',
  'syncing',
  'uploaded',
  'acked',
  'failed',
  'conflicted',
];

const ALLOWED_SYNC_PATCH_COLUMNS = new Set<keyof SyncStatePatch>([
  'sync_state',
  'sync_attempts',
  'sync_last_error',
  'sync_last_try_at',
  'sync_next_retry_at',
  'uploaded_at',
  'acked_at',
  'ack_vault_path',
]);

function boolToInt(value: boolean | undefined): 0 | 1 {
  return value ? 1 : 0;
}

function appendLimitOffset(sql: string, params: SQLiteValue[], opts: ListOptions): string {
  let nextSql = sql;
  if (opts.limit !== undefined) {
    nextSql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  if (opts.offset !== undefined) {
    nextSql += ` OFFSET ?`;
    params.push(opts.offset);
  }
  return nextSql;
}

export async function insert(db: SQLiteDatabaseLike, input: InsertCaptureInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO captures (
       id, created_at, captured_at_local, kind, content_preview, content_hash, byte_size,
       has_audio, has_image, attachment_count, sync_state, sync_attempts, sync_last_error,
       sync_last_try_at, sync_next_retry_at, uploaded_at, acked_at, ack_vault_path,
       local_path, deleted_locally, metadata_json, schema_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.created_at,
      input.captured_at_local,
      input.kind,
      input.content_preview ?? null,
      input.content_hash,
      input.byte_size,
      boolToInt(input.has_audio),
      boolToInt(input.has_image),
      input.attachment_count ?? 0,
      input.sync_state ?? 'pending',
      input.sync_attempts ?? 0,
      input.sync_last_error ?? null,
      input.sync_last_try_at ?? null,
      input.sync_next_retry_at ?? null,
      input.uploaded_at ?? null,
      input.acked_at ?? null,
      input.ack_vault_path ?? null,
      input.local_path,
      boolToInt(input.deleted_locally),
      input.metadata_json ?? null,
      input.schema_version ?? 1,
    ],
  );
}

export async function get(db: SQLiteDatabaseLike, id: string): Promise<CaptureRow | null> {
  return db.getFirstAsync<CaptureRow>(`SELECT * FROM captures WHERE id = ?`, [id]);
}

export async function list(
  db: SQLiteDatabaseLike,
  opts: ListOptions = {},
): Promise<CaptureRow[]> {
  const params: SQLiteValue[] = [];
  let sql = `SELECT * FROM captures`;
  if (!opts.includeDeleted) {
    sql += ` WHERE deleted_locally = 0`;
  }
  sql += ` ORDER BY created_at DESC`;
  sql = appendLimitOffset(sql, params, opts);
  return db.getAllAsync<CaptureRow>(sql, params);
}

export async function listByState(
  db: SQLiteDatabaseLike,
  state: SyncState,
  opts: ListByStateOptions = {},
): Promise<CaptureRow[]> {
  const params: SQLiteValue[] = [state];
  let sql = `SELECT * FROM captures
    WHERE deleted_locally = 0 AND sync_state = ?`;
  if (opts.dueBefore !== undefined) {
    sql += ` AND (sync_next_retry_at IS NULL OR sync_next_retry_at <= ?)`;
    params.push(opts.dueBefore);
  }
  sql += ` ORDER BY created_at ASC`;
  if (opts.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  return db.getAllAsync<CaptureRow>(sql, params);
}

export async function updateSyncState(
  db: SQLiteDatabaseLike,
  id: string,
  patch: SyncStatePatch,
): Promise<void> {
  const entries = Object.entries(patch) as [keyof SyncStatePatch, SQLiteValue | undefined][];
  if (entries.length === 0) {
    throw new Error('captures.update_sync_state.empty_patch');
  }

  const assignments: string[] = [];
  const params: SQLiteValue[] = [];
  for (const [column, value] of entries) {
    if (!ALLOWED_SYNC_PATCH_COLUMNS.has(column)) {
      throw new Error(`captures.update_sync_state.invalid_column:${String(column)}`);
    }
    assignments.push(`${column} = ?`);
    params.push(value ?? null);
  }
  params.push(id);

  await db.runAsync(`UPDATE captures SET ${assignments.join(', ')} WHERE id = ?`, params);
}

export async function updateLocalMetadata(
  db: SQLiteDatabaseLike,
  id: string,
  patch: LocalMetadataPatch,
): Promise<void> {
  const entries = Object.entries(patch) as [keyof LocalMetadataPatch, SQLiteValue | undefined][];
  if (entries.length === 0) {
    throw new Error('captures.update_local_metadata.empty_patch');
  }
  const allowed = new Set<keyof LocalMetadataPatch>(['byte_size', 'content_hash', 'content_preview']);
  const assignments: string[] = [];
  const params: SQLiteValue[] = [];
  for (const [column, value] of entries) {
    if (!allowed.has(column)) {
      throw new Error(`captures.update_local_metadata.invalid_column:${String(column)}`);
    }
    assignments.push(`${column} = ?`);
    params.push(value ?? null);
  }
  params.push(id);
  await db.runAsync(`UPDATE captures SET ${assignments.join(', ')} WHERE id = ?`, params);
}

export async function updateLocalPath(
  db: SQLiteDatabaseLike,
  id: string,
  localPath: string,
): Promise<void> {
  await db.runAsync(`UPDATE captures SET local_path = ? WHERE id = ?`, [localPath, id]);
}

export async function markDeleted(db: SQLiteDatabaseLike, id: string): Promise<void> {
  await db.runAsync(`UPDATE captures SET deleted_locally = 1 WHERE id = ?`, [id]);
}

export async function countByState(
  db: SQLiteDatabaseLike,
): Promise<Record<SyncState, number>> {
  const counts: Record<SyncState, number> = {
    pending: 0,
    syncing: 0,
    uploaded: 0,
    acked: 0,
    failed: 0,
    conflicted: 0,
  };
  const rows = await db.getAllAsync<{ sync_state: SyncState; count: number }>(
    `SELECT sync_state, COUNT(*) AS count
     FROM captures
     WHERE deleted_locally = 0
     GROUP BY sync_state`,
  );

  for (const row of rows) {
    if (SYNC_STATES.includes(row.sync_state)) {
      counts[row.sync_state] = row.count;
    }
  }
  return counts;
}
