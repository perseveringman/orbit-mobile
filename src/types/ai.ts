export type AiProvider = 'deepseek';

export type AiTaskKind = 'recording_notes';

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
