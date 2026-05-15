import type { AiProvider, AiTaskKind, AiTaskRow, AiTaskStatus } from '../../types/ai';
import { generateSessionId } from '../../utils/id';
import { isoNow } from '../../utils/time';
import type { SQLiteDatabaseLike, SQLiteValue } from './sqlite';

export interface EnqueueAiTaskInput {
  capture_id: string;
  kind: AiTaskKind;
  input_hash: string;
  provider: AiProvider;
  model: string;
  now?: string;
}

export async function enqueue(db: SQLiteDatabaseLike, input: EnqueueAiTaskInput): Promise<void> {
  const now = input.now ?? isoNow();
  await db.runAsync(
    `INSERT INTO ai_tasks (
       id, capture_id, kind, status, attempts, input_hash, provider, model,
       last_error, next_retry_at, completed_at, created_at, updated_at
     ) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT(capture_id, kind) DO UPDATE SET
       status = 'queued',
       attempts = CASE
         WHEN ai_tasks.input_hash = excluded.input_hash THEN ai_tasks.attempts
         ELSE 0
       END,
       input_hash = excluded.input_hash,
       provider = excluded.provider,
       model = excluded.model,
       last_error = NULL,
       next_retry_at = NULL,
       completed_at = NULL,
       updated_at = excluded.updated_at`,
    [
      generateSessionId(),
      input.capture_id,
      input.kind,
      input.input_hash,
      input.provider,
      input.model,
      now,
      now,
    ],
  );
}

export async function getByCapture(
  db: SQLiteDatabaseLike,
  captureId: string,
  kind: AiTaskKind = 'recording_notes',
): Promise<AiTaskRow | null> {
  return db.getFirstAsync<AiTaskRow>(
    `SELECT * FROM ai_tasks WHERE capture_id = ? AND kind = ?`,
    [captureId, kind],
  );
}

export async function listRunnable(
  db: SQLiteDatabaseLike,
  opts: { limit?: number; dueBefore?: string } = {},
): Promise<AiTaskRow[]> {
  const params: SQLiteValue[] = [opts.dueBefore ?? isoNow()];
  let sql = `SELECT * FROM ai_tasks
    WHERE status IN ('queued', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY created_at ASC`;
  if (opts.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  return db.getAllAsync<AiTaskRow>(sql, params);
}

export async function hasBlockingTask(db: SQLiteDatabaseLike, captureId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM ai_tasks
     WHERE capture_id = ?
       AND (
         status IN ('queued', 'running')
         OR (status = 'failed' AND next_retry_at IS NOT NULL)
       )`,
    [captureId],
  );
  return (row?.count ?? 0) > 0;
}

export async function markRunning(
  db: SQLiteDatabaseLike,
  task: AiTaskRow,
  now = isoNow(),
): Promise<number> {
  const attempts = task.attempts + 1;
  await db.runAsync(
    `UPDATE ai_tasks
     SET status = 'running',
         attempts = ?,
         last_error = NULL,
         next_retry_at = NULL,
         updated_at = ?
     WHERE id = ?`,
    [attempts, now, task.id],
  );
  return attempts;
}

export async function markSucceeded(
  db: SQLiteDatabaseLike,
  taskId: string,
  now = isoNow(),
): Promise<void> {
  await updateStatus(db, taskId, {
    status: 'succeeded',
    last_error: null,
    next_retry_at: null,
    completed_at: now,
    updated_at: now,
  });
}

export async function markSkipped(
  db: SQLiteDatabaseLike,
  taskId: string,
  reason: string,
  now = isoNow(),
): Promise<void> {
  await updateStatus(db, taskId, {
    status: 'skipped',
    last_error: reason,
    next_retry_at: null,
    completed_at: now,
    updated_at: now,
  });
}

export async function markFailed(
  db: SQLiteDatabaseLike,
  taskId: string,
  error: string,
  opts: { nextRetryAt?: string | null; terminal?: boolean; now?: string } = {},
): Promise<void> {
  const now = opts.now ?? isoNow();
  await updateStatus(db, taskId, {
    status: 'failed',
    last_error: error,
    next_retry_at: opts.terminal ? null : (opts.nextRetryAt ?? null),
    completed_at: opts.terminal ? now : null,
    updated_at: now,
  });
}

async function updateStatus(
  db: SQLiteDatabaseLike,
  taskId: string,
  patch: {
    status: AiTaskStatus;
    last_error: string | null;
    next_retry_at: string | null;
    completed_at: string | null;
    updated_at: string;
  },
): Promise<void> {
  await db.runAsync(
    `UPDATE ai_tasks
     SET status = ?,
         last_error = ?,
         next_retry_at = ?,
         completed_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      patch.status,
      patch.last_error,
      patch.next_retry_at,
      patch.completed_at,
      patch.updated_at,
      taskId,
    ],
  );
}
