import type {
  RecordingFinalState,
  RecordingMeta,
  RecordingPartialState,
  RecordingSpeaker,
} from '../../types/recording';
import type { SQLiteDatabaseLike } from './sqlite';

export interface RecordingRow {
  id: string;
  title: string;
  duration_ms: number;
  channels: number;
  sample_rate: number;
  language_hints: string | null;
  speaker_count: number | null;
  partial_state: RecordingPartialState;
  final_state: RecordingFinalState;
  partial_provider: string;
  final_provider: string | null;
  final_attempts: number;
  final_last_error: string | null;
  final_done_at: string | null;
  created_at: string;
}

export interface InsertRecordingInput {
  id: string;
  title: string;
  duration_ms: number;
  channels?: number;
  sample_rate?: number;
  language_hints?: string[];
  speaker_count?: number | null;
  partial_state?: RecordingPartialState;
  final_state?: RecordingFinalState;
  partial_provider?: string;
  final_provider?: string | null;
  final_attempts?: number;
  final_last_error?: string | null;
  final_done_at?: string | null;
  created_at: string;
}

export async function insert(db: SQLiteDatabaseLike, input: InsertRecordingInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO recordings (
       id, title, duration_ms, channels, sample_rate, language_hints, speaker_count,
       partial_state, final_state, partial_provider, final_provider, final_attempts,
       final_last_error, final_done_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.title,
      input.duration_ms,
      input.channels ?? 1,
      input.sample_rate ?? 48000,
      JSON.stringify(input.language_hints ?? []),
      input.speaker_count ?? null,
      input.partial_state ?? 'finished',
      input.final_state ?? 'done',
      input.partial_provider ?? 'unavailable',
      input.final_provider ?? null,
      input.final_attempts ?? 0,
      input.final_last_error ?? null,
      input.final_done_at ?? null,
      input.created_at,
    ],
  );
}

export async function get(db: SQLiteDatabaseLike, id: string): Promise<RecordingRow | null> {
  return db.getFirstAsync<RecordingRow>(`SELECT * FROM recordings WHERE id = ?`, [id]);
}

export async function list(db: SQLiteDatabaseLike, limit = 100): Promise<RecordingRow[]> {
  return db.getAllAsync<RecordingRow>(
    `SELECT recordings.*
     FROM recordings
     JOIN captures ON captures.id = recordings.id
     WHERE captures.deleted_locally = 0
     ORDER BY captures.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

export function toRecordingMeta(row: RecordingRow, speakers?: RecordingSpeaker[]): RecordingMeta {
  const languageHints = parseStringArray(row.language_hints);
  const speakerList = speakers ?? Array.from({ length: row.speaker_count ?? 0 }, (_, index) => ({
    id: `S${index + 1}`,
    label: `说话人 ${index + 1}`,
    color: '#64748b',
  }));
  return {
    id: row.id,
    title: row.title,
    started_at: row.created_at,
    duration_ms: row.duration_ms,
    language_hints: languageHints,
    speakers: speakerList,
    partial_state: row.partial_state,
    final_state: row.final_state,
    partial_provider: row.partial_provider,
    final_provider: row.final_provider ?? 'local',
  };
}

export function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}
