/**
 * drafts-repo.ts — drafts 表 CRUD
 *
 * 草稿每 2s 自动保存；没有软删除字段——要么在要么不在。
 * 方法名用 `del` 避开 JS 保留字 delete。
 *
 * @see docs/DATA-MODEL.md §1.3
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 7
 *
 */

import type { CaptureKind, DraftRow } from '../../types/capture';
import type { SQLiteDatabaseLike, SQLiteValue } from './sqlite';

export interface DraftInput {
  session_id: string;
  content?: string;
  tags_json?: string | null;
  attachments_json?: string | null;
  kind_hint?: CaptureKind | null;
  created_at?: string;
  updated_at: string;
}

export async function upsert(db: SQLiteDatabaseLike, input: DraftInput): Promise<void> {
  const createdAt = input.created_at ?? input.updated_at;
  await db.runAsync(
    `INSERT INTO drafts (
       session_id, content, tags_json, attachments_json, kind_hint, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       content = excluded.content,
       tags_json = excluded.tags_json,
       attachments_json = excluded.attachments_json,
       kind_hint = excluded.kind_hint,
       updated_at = excluded.updated_at`,
    [
      input.session_id,
      input.content ?? '',
      input.tags_json ?? null,
      input.attachments_json ?? null,
      input.kind_hint ?? null,
      createdAt,
      input.updated_at,
    ],
  );
}

export async function get(db: SQLiteDatabaseLike, sessionId: string): Promise<DraftRow | null> {
  return db.getFirstAsync<DraftRow>(`SELECT * FROM drafts WHERE session_id = ?`, [sessionId]);
}

export async function list(
  db: SQLiteDatabaseLike,
  opts: { limit?: number } = {},
): Promise<DraftRow[]> {
  const params: SQLiteValue[] = [];
  let sql = `SELECT * FROM drafts ORDER BY updated_at DESC`;
  if (opts.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  return db.getAllAsync<DraftRow>(sql, params);
}

export async function del(db: SQLiteDatabaseLike, sessionId: string): Promise<void> {
  await db.runAsync(`DELETE FROM drafts WHERE session_id = ?`, [sessionId]);
}
