/**
 * schema.ts — 建表 SQL 字符串常量
 *
 * DATA-MODEL.md §1 是数据契约的唯一来源，本文件把那份 SQL 原文搬进代码。
 * 所有 CREATE TABLE / CREATE INDEX 都加 IF NOT EXISTS（幂等）。
 *
 * @see docs/DATA-MODEL.md §1.1–1.4
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 4
 *
 */

export const SCHEMA_VERSION = 4;

export const CREATE_CAPTURES = `
CREATE TABLE IF NOT EXISTS captures (
  id                   TEXT PRIMARY KEY,
  created_at           TEXT NOT NULL,
  captured_at_local    TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  content_preview      TEXT,
  content_hash         TEXT NOT NULL,
  byte_size            INTEGER NOT NULL,
  has_audio            INTEGER NOT NULL DEFAULT 0,
  has_image            INTEGER NOT NULL DEFAULT 0,
  attachment_count     INTEGER NOT NULL DEFAULT 0,
  sync_state           TEXT NOT NULL DEFAULT 'pending',
  sync_attempts        INTEGER NOT NULL DEFAULT 0,
  sync_last_error      TEXT,
  sync_last_try_at     TEXT,
  sync_next_retry_at   TEXT,
  uploaded_at          TEXT,
  acked_at             TEXT,
  ack_vault_path       TEXT,
  local_path           TEXT NOT NULL,
  deleted_locally      INTEGER NOT NULL DEFAULT 0,
  metadata_json        TEXT,
  schema_version       INTEGER NOT NULL DEFAULT 1
);`;

export const CREATE_CAPTURES_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_captures_sync_state
     ON captures(sync_state, sync_next_retry_at);`,
  `CREATE INDEX IF NOT EXISTS idx_captures_created
     ON captures(created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_captures_kind
     ON captures(kind);`,
];

export const CREATE_SYNC_EVENTS = `
CREATE TABLE IF NOT EXISTS sync_events (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id           TEXT NOT NULL,
  event                TEXT NOT NULL,
  timestamp            TEXT NOT NULL,
  details_json         TEXT,
  FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_events_capture
  ON sync_events(capture_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sync_events_time
  ON sync_events(timestamp DESC);`;

export const CREATE_DRAFTS = `
CREATE TABLE IF NOT EXISTS drafts (
  session_id           TEXT PRIMARY KEY,
  content              TEXT NOT NULL DEFAULT '',
  tags_json            TEXT,
  attachments_json     TEXT,
  kind_hint            TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_updated
  ON drafts(updated_at DESC);`;

export const CREATE_DEVICE_INFO = `
CREATE TABLE IF NOT EXISTS device_info (
  key                  TEXT PRIMARY KEY,
  value                TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);`;

export const CREATE_RECORDINGS = `
CREATE TABLE IF NOT EXISTS recordings (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  duration_ms          INTEGER NOT NULL,
  channels             INTEGER NOT NULL DEFAULT 1,
  sample_rate          INTEGER NOT NULL DEFAULT 48000,
  language_hints       TEXT,
  speaker_count        INTEGER,
  partial_state        TEXT NOT NULL DEFAULT 'idle',
  final_state          TEXT NOT NULL DEFAULT 'pending',
  partial_provider     TEXT NOT NULL DEFAULT 'unavailable',
  final_provider       TEXT,
  final_attempts       INTEGER NOT NULL DEFAULT 0,
  final_last_error     TEXT,
  final_done_at        TEXT,
  created_at           TEXT NOT NULL,
  FOREIGN KEY (id) REFERENCES captures(id) ON DELETE CASCADE
);`;

export const CREATE_RECORDINGS_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_recordings_final_state
     ON recordings(final_state);`,
  `CREATE INDEX IF NOT EXISTS idx_recordings_created
     ON recordings(created_at DESC);`,
];

export const CREATE_RECORDING_ANNOTATIONS = `
CREATE TABLE IF NOT EXISTS recording_annotations (
  id                   TEXT PRIMARY KEY,
  recording_id         TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  target_id            TEXT,
  payload_json         TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
  UNIQUE(recording_id, kind, target_id)
);`;

export const CREATE_RECORDING_ANNOTATIONS_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_recording_annotations_recording
     ON recording_annotations(recording_id, kind);`,
];

export const CREATE_AI_TASKS = `
CREATE TABLE IF NOT EXISTS ai_tasks (
  id                   TEXT PRIMARY KEY,
  capture_id           TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  status               TEXT NOT NULL,
  attempts             INTEGER NOT NULL DEFAULT 0,
  input_hash           TEXT NOT NULL,
  provider             TEXT NOT NULL,
  model                TEXT NOT NULL,
  last_error           TEXT,
  next_retry_at        TEXT,
  completed_at         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE,
  UNIQUE(capture_id, kind)
);`;

export const CREATE_AI_TASKS_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_ai_tasks_status
     ON ai_tasks(status, next_retry_at);`,
  `CREATE INDEX IF NOT EXISTS idx_ai_tasks_capture
     ON ai_tasks(capture_id, kind);`,
];
