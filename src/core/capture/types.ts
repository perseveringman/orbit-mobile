/**
 * core/capture/types.ts — Capture 领域类型
 *
 * 与 src/types/capture.ts 的区别：
 * - src/types/capture.ts：持久层行类型（DB schema 的 TS 映射）
 * - 本文件：业务层类型（领域对象、UI 层消费）
 *
 * @see docs/DATA-MODEL.md
 *
 */

import type { CaptureKind } from '../../types/capture';

export type AttachmentType = 'audio' | 'image' | 'file' | 'transcript' | 'transcript-partial' | 'derivative';

export interface CaptureAttachment {
  type: AttachmentType;
  filename: string;
  localUri: string;
  mime: string;
  byte_size?: number;
  sha256?: string;
  duration_ms?: number;
  transcription?: string;
  transcription_source?: string;
  transcription_confidence?: number;
  recorded_at?: string;
  width?: number;
  height?: number;
  captured_at?: string;
  original_exif?: Record<string, unknown>;
  sync_hint?: 'wifi_only';
  schema?: string;
  derivative_kind?: string;
  template_id?: string;
}

export interface ManifestAttachment {
  type: AttachmentType;
  filename: string;
  sha256: string;
  byte_size: number;
  mime: string;
  duration_ms?: number;
  transcription?: string;
  transcription_source?: string;
  transcription_confidence?: number;
  recorded_at?: string;
  width?: number;
  height?: number;
  captured_at?: string;
  original_exif?: Record<string, unknown>;
  sync_hint?: 'wifi_only';
  schema?: string;
  derivative_kind?: string;
  template_id?: string;
}

export interface ManifestRecordingInfo {
  duration_ms: number;
  language_hints: string[];
  speakers: { id: string; label: string; color?: string }[];
  partial_provider: string;
  final_provider: string;
  diarization_provider?: string | null;
}

export interface ManifestDerivativeRef {
  kind: string;
  filename: string;
  template_id?: string;
}

export interface CaptureManifest {
  schema_version: 1;
  id: string;
  source: 'orbit-mobile-ios';
  source_version: string;
  device_id: string;
  created_at: string;
  captured_at_local: string;
  kind: CaptureKind;
  content: string;
  tags: string[];
  attachments: ManifestAttachment[];
  recording?: ManifestRecordingInfo;
  derivatives?: ManifestDerivativeRef[];
  context: {
    clipboard_hint: string | null;
    share_context: Record<string, unknown> | null;
    location: Record<string, unknown> | null;
    network: string | null;
    battery: number | null;
  };
  local_timestamps: {
    input_started_at: string | null;
    input_finished_at: string;
    total_input_duration_ms: number | null;
  };
}

export interface BuildManifestInput {
  id: string;
  sourceVersion: string;
  deviceId: string;
  createdAt: string;
  capturedAtLocal: string;
  kind: CaptureKind;
  content: string;
  tags?: string[];
  attachments?: ManifestAttachment[];
  recording?: ManifestRecordingInfo;
  derivatives?: ManifestDerivativeRef[];
  clipboardHint?: string | null;
  shareContext?: Record<string, unknown> | null;
  inputStartedAt?: string | null;
  inputFinishedAt: string;
}

export interface CreateTextCaptureInput {
  content: string;
  inputStartedAt?: string | null;
  tags?: string[];
  sessionId?: string;
}

export interface CreateCaptureInput extends CreateTextCaptureInput {
  kind?: CaptureKind;
  attachments?: CaptureAttachment[];
  recording?: ManifestRecordingInfo;
  derivatives?: ManifestDerivativeRef[];
}
