/**
 * types/capture.ts — 持久层行类型（DB schema 的 TS 映射）
 *
 * 严格对齐 DATA-MODEL.md §1.1–1.4。
 * SQLite 没 boolean，用 0/1 存 INTEGER——输入层接受 boolean，内部转换。
 *
 * @see docs/DATA-MODEL.md §1
 * @see docs/plans/2026-05-06-m1-local-storage-layer.md Step 4.1
 */

export type SyncState =
  | 'pending'
  | 'syncing'
  | 'uploaded'
  | 'acked'
  | 'failed'
  | 'conflicted';

export type CaptureKind = 'thought' | 'voice' | 'photo' | 'share' | 'mixed';

// TODO(M1): 按 DATA-MODEL §1.1 填完整 CaptureRow 字段
export interface CaptureRow {
  id: string;
  created_at: string;
  captured_at_local: string;
  kind: CaptureKind;
  content_preview: string | null;
  content_hash: string;
  byte_size: number;
  has_audio: 0 | 1;
  has_image: 0 | 1;
  attachment_count: number;
  sync_state: SyncState;
  sync_attempts: number;
  sync_last_error: string | null;
  sync_last_try_at: string | null;
  sync_next_retry_at: string | null;
  uploaded_at: string | null;
  acked_at: string | null;
  ack_vault_path: string | null;
  local_path: string;
  deleted_locally: 0 | 1;
  metadata_json: string | null;
  schema_version: number;
}

// TODO(M1): 按 DATA-MODEL §1.2 定义 SyncEventRow
export interface SyncEventRow {
  id: number;
  capture_id: string;
  event: string;
  timestamp: string;
  details_json: string | null;
}

// TODO(M1): 按 DATA-MODEL §1.3 定义 DraftRow
export interface DraftRow {
  session_id: string;
  content: string;
  tags_json: string | null;
  attachments_json: string | null;
  kind_hint: string | null;
  created_at: string;
  updated_at: string;
}

// 按 DATA-MODEL §1.4 定义 DeviceInfoRow（KV）
export interface DeviceInfoRow {
  key: string;
  value: string;
  updated_at: string;
}
