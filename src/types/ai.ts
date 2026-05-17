export type AiProvider = 'deepseek' | 'volcengine';

export type AiTaskKind = 'recording_notes' | 'recording_proofread' | 'recording_transcription';

export type AiTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface AiTaskRow {
  id: string;
  capture_id: string;
  kind: AiTaskKind;
  status: AiTaskStatus;
  attempts: number;
  input_hash: string;
  provider: AiProvider;
  model: string;
  last_error: string | null;
  next_retry_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiSettings {
  enabled: boolean;
  autoGenerate: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string;
}

export interface VolcengineAsrSettings {
  enabled: boolean;
  autoTranscribeImported: boolean;
  provider: 'volcengine';
  mode: 'flash';
  resourceId: string;
  baseUrl: string;
  uid: string;
  boostingTableId: string;
}
