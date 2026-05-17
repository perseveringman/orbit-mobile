import { sha256String } from '../capture/hash';
import { loadAppSettings } from '../settings/app-settings';
import * as aiTasksRepo from '../storage/ai-tasks-repo';
import * as eventsRepo from '../storage/events-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { loadRecordingDetail } from '../recording/recording-service';
import { isoNow } from '../../utils/time';
import type { FileSystemAdapter } from '../../utils/fs';
import { getDeepSeekApiKey, getVolcengineAsrCredentials } from './api-key';
import { DeepSeekClient } from './deepseek-client';
import { writeAiRecordingNotes } from './derivative-writer';
import { generateRecordingNotes, hasUsableTranscript } from './recording-notes';
import {
  isCloudTranscriptionCandidate,
  readRecordingAudioBase64,
  recordingTranscriptionInputHash,
  writeRecordingTranscription,
} from './recording-transcription';
import {
  generateTranscriptCorrections,
  transcriptProofreadInputHash,
  writeTranscriptCorrections,
} from './transcript-proofread';
import { VolcengineAsrClient } from './volcengine-asr-client';
import type { AiTaskRow } from '../../types/ai';
import * as recordingsRepo from '../storage/recordings-repo';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;

export interface AiWorkerTickOptions {
  db?: SQLiteDatabaseLike;
  fs?: FileSystemAdapter;
  limit?: number;
  now?: Date;
}

export interface AiWorkerTickResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export async function enqueueRecordingNotesAiTask(
  db: SQLiteDatabaseLike,
  recordingId: string,
  options: { detail?: Awaited<ReturnType<typeof loadRecordingDetail>>; fs?: FileSystemAdapter } = {},
): Promise<void> {
  const settings = await loadAppSettings(db);
  if (!settings.ai.enabled || !settings.ai.autoGenerate) return;
  const detail = options.detail ?? await loadRecordingDetail(recordingId, { db, fs: options.fs });
  if (!detail) return;
  if (!hasUsableTranscript(detail)) return;
  const inputHash = await recordingInputHash(detail);
  await aiTasksRepo.enqueue(db, {
    capture_id: recordingId,
    kind: 'recording_notes',
    input_hash: inputHash,
    provider: settings.ai.provider,
    model: settings.ai.model,
  });
}

export async function enqueueRecordingProofreadAiTask(
  db: SQLiteDatabaseLike,
  recordingId: string,
  options: {
    detail?: Awaited<ReturnType<typeof loadRecordingDetail>>;
    force?: boolean;
    fs?: FileSystemAdapter;
  } = {},
): Promise<void> {
  const settings = await loadAppSettings(db);
  if (!settings.ai.enabled || (!settings.ai.autoGenerate && options.force !== true)) return;
  const detail = options.detail ?? await loadRecordingDetail(recordingId, { db, fs: options.fs });
  if (!detail) return;
  if (!hasUsableTranscript(detail)) return;
  const inputHash = await transcriptProofreadInputHash(detail, settings.aiHotwords);
  await aiTasksRepo.enqueue(db, {
    capture_id: recordingId,
    kind: 'recording_proofread',
    input_hash: inputHash,
    provider: settings.ai.provider,
    model: settings.ai.model,
  });
}

export async function enqueueRecordingTranscriptionAiTask(
  db: SQLiteDatabaseLike,
  recordingId: string,
  options: { detail?: Awaited<ReturnType<typeof loadRecordingDetail>>; force?: boolean; fs?: FileSystemAdapter } = {},
): Promise<void> {
  const settings = await loadAppSettings(db);
  if (!settings.volcengineAsr.enabled || (!settings.volcengineAsr.autoTranscribeImported && options.force !== true)) {
    return;
  }
  const detail = options.detail ?? await loadRecordingDetail(recordingId, { db, fs: options.fs });
  if (!detail || (!options.force && !isCloudTranscriptionCandidate(detail))) return;
  const inputHash = await recordingTranscriptionInputHash(detail);
  await aiTasksRepo.enqueue(db, {
    capture_id: recordingId,
    kind: 'recording_transcription',
    input_hash: inputHash,
    provider: 'volcengine',
    model: settings.volcengineAsr.resourceId,
  });
}

export async function runAiWorkerTick(options: AiWorkerTickOptions = {}): Promise<AiWorkerTickResult> {
  const db = options.db ?? (await (await import('../storage/db')).openDb());
  const limit = options.limit ?? 2;
  const now = options.now ?? new Date();
  const result: AiWorkerTickResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  const tasks = await aiTasksRepo.listRunnable(db, { limit, dueBefore: now.toISOString() });

  for (const task of tasks) {
    result.processed += 1;
    const attempts = await aiTasksRepo.markRunning(db, task, now.toISOString());
    try {
      const settings = await loadAppSettings(db);
      if (task.kind === 'recording_transcription') {
        const handled = await runRecordingTranscriptionTask(db, task, attempts, settings, options);
        result[handled] += 1;
        continue;
      }
      if (!settings.ai.enabled) {
        await aiTasksRepo.markSkipped(db, task.id, 'ai.disabled', isoNow());
        result.skipped += 1;
        continue;
      }
      const key = await getDeepSeekApiKey();
      if (!key) {
        await aiTasksRepo.markSkipped(db, task.id, 'ai.key_missing', isoNow());
        result.skipped += 1;
        continue;
      }
      const detail = await loadRecordingDetail(task.capture_id, { db, fs: options.fs });
      if (!detail) {
        await aiTasksRepo.markSkipped(db, task.id, 'ai.recording_missing', isoNow());
        result.skipped += 1;
        continue;
      }
      if (!hasUsableTranscript(detail)) {
        await aiTasksRepo.markSkipped(db, task.id, 'ai.no_transcript', isoNow());
        result.skipped += 1;
        continue;
      }
      const client = new DeepSeekClient(settings.ai, key);
      if (task.kind === 'recording_proofread') {
        const corrections = await generateTranscriptCorrections(client, detail, settings.aiHotwords);
        await writeTranscriptCorrections(db, task.capture_id, corrections);
        await aiTasksRepo.markSucceeded(db, task.id, isoNow());
        await eventsRepo.append(db, task.capture_id, 'ai_proofread_generated', {
          provider: settings.ai.provider,
          model: settings.ai.model,
          count: corrections.length,
          hotword_count: settings.aiHotwords.length,
        });
      } else {
        const notes = await generateRecordingNotes(client, detail);
        await writeAiRecordingNotes(db, task.capture_id, notes, options.fs);
        await aiTasksRepo.markSucceeded(db, task.id, isoNow());
        await eventsRepo.append(db, task.capture_id, 'ai_generated', {
          provider: settings.ai.provider,
          model: settings.ai.model,
          semantic_title: notes.semanticTitle ?? null,
        });
      }
      result.succeeded += 1;
    } catch (error) {
      const terminal = attempts >= MAX_ATTEMPTS;
      await aiTasksRepo.markFailed(db, task.id, errorMessage(error), {
        terminal,
        nextRetryAt: terminal ? null : new Date(now.getTime() + retryDelay(attempts)).toISOString(),
        now: isoNow(),
      });
      if (task.kind === 'recording_transcription') {
        await recordingsRepo.updateFinalTranscriptionState(db, task.capture_id, {
          final_state: terminal ? 'failed' : 'offline_queued',
          final_provider: null,
          final_attempts: attempts,
          final_last_error: errorMessage(error),
          final_done_at: terminal ? isoNow() : null,
        }).catch(() => undefined);
      }
      await eventsRepo.append(db, task.capture_id, terminal ? 'ai_failed' : 'ai_retry', {
        attempt: attempts,
        error: errorMessage(error),
      });
      result.failed += 1;
    }
  }

  return result;
}

async function runRecordingTranscriptionTask(
  db: SQLiteDatabaseLike,
  task: AiTaskRow,
  attempts: number,
  settings: Awaited<ReturnType<typeof loadAppSettings>>,
  options: AiWorkerTickOptions,
): Promise<'succeeded' | 'skipped'> {
  if (!settings.volcengineAsr.enabled) {
    await aiTasksRepo.markSkipped(db, task.id, 'asr.disabled', isoNow());
    await recordingsRepo.updateFinalTranscriptionState(db, task.capture_id, {
      final_state: 'offline_queued',
      final_attempts: attempts,
      final_last_error: 'asr.disabled',
      final_done_at: null,
    });
    return 'skipped';
  }
  const credentials = await getVolcengineAsrCredentials();
  if (!credentials) {
    await aiTasksRepo.markSkipped(db, task.id, 'asr.key_missing', isoNow());
    await recordingsRepo.updateFinalTranscriptionState(db, task.capture_id, {
      final_state: 'offline_queued',
      final_attempts: attempts,
      final_last_error: 'asr.key_missing',
      final_done_at: null,
    });
    return 'skipped';
  }
  const detail = await loadRecordingDetail(task.capture_id, { db, fs: options.fs });
  if (!detail) {
    await aiTasksRepo.markSkipped(db, task.id, 'asr.recording_missing', isoNow());
    return 'skipped';
  }
  if (!isCloudTranscriptionCandidate(detail)) {
    await aiTasksRepo.markSkipped(db, task.id, 'asr.not_needed', isoNow());
    return 'skipped';
  }
  await recordingsRepo.updateFinalTranscriptionState(db, task.capture_id, {
    final_state: 'running',
    final_provider: settings.volcengineAsr.resourceId,
    final_attempts: attempts,
    final_last_error: null,
    final_done_at: null,
  });
  const audio = await readRecordingAudioBase64(db, task.capture_id, options.fs);
  const client = new VolcengineAsrClient(settings.volcengineAsr, credentials);
  const recognition = await client.recognizeBase64({
    audioBase64: audio.audioBase64,
    languageHints: detail.meta.language_hints,
  });
  await writeRecordingTranscription(db, task.capture_id, recognition, options.fs);
  await aiTasksRepo.markSucceeded(db, task.id, isoNow());
  const transcribed = await loadRecordingDetail(task.capture_id, { db, fs: options.fs });
  if (transcribed && hasUsableTranscript(transcribed)) {
    await enqueueRecordingNotesAiTask(db, task.capture_id, { detail: transcribed, fs: options.fs }).catch(() => undefined);
    await enqueueRecordingProofreadAiTask(db, task.capture_id, { detail: transcribed, fs: options.fs }).catch(() => undefined);
  }
  return 'succeeded';
}

export async function recordingInputHash(detail: {
  meta: { title: string; duration_ms: number };
  transcript: { segments: { start_ms: number; end_ms: number; speaker: string; text: string }[] };
}): Promise<string> {
  return sha256String(JSON.stringify({
    title: detail.meta.title,
    duration_ms: detail.meta.duration_ms,
    segments: detail.transcript.segments.map((segment) => ({
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      speaker: segment.speaker,
      text: segment.text,
    })),
  }));
}

function retryDelay(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 600_000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
