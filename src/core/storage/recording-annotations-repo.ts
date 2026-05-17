import type { SQLiteDatabaseLike } from './sqlite';
import { generateSessionId } from '../../utils/id';
import { isoNow } from '../../utils/time';

export type RecordingAnnotationKind =
  | 'segment_feedback'
  | 'bookmark'
  | 'session_event'
  | 'todo_state'
  | 'custom_derivative'
  | 'x1_import'
  | 'transcript_correction';

export interface RecordingAnnotationRow {
  id: string;
  recording_id: string;
  kind: RecordingAnnotationKind;
  target_id: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export async function upsert(
  db: SQLiteDatabaseLike,
  input: {
    recording_id: string;
    kind: RecordingAnnotationKind;
    target_id?: string | null;
    payload: Record<string, unknown>;
    now?: string;
  },
): Promise<void> {
  const now = input.now ?? isoNow();
  await db.runAsync(
    `INSERT INTO recording_annotations (
       id, recording_id, kind, target_id, payload_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(recording_id, kind, target_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [
      generateSessionId(),
      input.recording_id,
      input.kind,
      input.target_id ?? null,
      JSON.stringify(input.payload),
      now,
      now,
    ],
  );
}

export async function listByRecording(
  db: SQLiteDatabaseLike,
  recordingId: string,
  kind?: RecordingAnnotationKind,
): Promise<RecordingAnnotationRow[]> {
  if (kind) {
    return db.getAllAsync<RecordingAnnotationRow>(
      `SELECT * FROM recording_annotations
       WHERE recording_id = ? AND kind = ?
       ORDER BY created_at ASC`,
      [recordingId, kind],
    );
  }
  return db.getAllAsync<RecordingAnnotationRow>(
    `SELECT * FROM recording_annotations
     WHERE recording_id = ?
     ORDER BY created_at ASC`,
    [recordingId],
  );
}

export async function del(
  db: SQLiteDatabaseLike,
  recordingId: string,
  kind: RecordingAnnotationKind,
  targetId: string | null,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM recording_annotations
     WHERE recording_id = ? AND kind = ? AND (
       (target_id IS NULL AND ? IS NULL) OR target_id = ?
     )`,
    [recordingId, kind, targetId, targetId],
  );
}

export function parsePayload<T>(row: RecordingAnnotationRow): T | null {
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}
