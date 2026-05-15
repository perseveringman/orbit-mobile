import { sha256String } from '../capture/hash';
import { loadAppSettings } from '../settings/app-settings';
import * as aiTasksRepo from '../storage/ai-tasks-repo';
import * as eventsRepo from '../storage/events-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { loadRecordingDetail } from '../recording/recording-service';
import { isoNow } from '../../utils/time';
import type { FileSystemAdapter } from '../../utils/fs';
import { getDeepSeekApiKey } from './api-key';
import { DeepSeekClient } from './deepseek-client';
import { writeAiRecordingNotes } from './derivative-writer';
import { generateRecordingNotes, hasUsableTranscript } from './recording-notes';

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
  const inputHash = await recordingInputHash(detail);
  await aiTasksRepo.enqueue(db, {
    capture_id: recordingId,
    kind: 'recording_notes',
    input_hash: inputHash,
    provider: settings.ai.provider,
    model: settings.ai.model,
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
      const notes = await generateRecordingNotes(client, detail);
      await writeAiRecordingNotes(db, task.capture_id, notes, options.fs);
      await aiTasksRepo.markSucceeded(db, task.id, isoNow());
      await eventsRepo.append(db, task.capture_id, 'ai_generated', {
        provider: settings.ai.provider,
        model: settings.ai.model,
      });
      result.succeeded += 1;
    } catch (error) {
      const terminal = attempts >= MAX_ATTEMPTS;
      await aiTasksRepo.markFailed(db, task.id, errorMessage(error), {
        terminal,
        nextRetryAt: terminal ? null : new Date(now.getTime() + retryDelay(attempts)).toISOString(),
        now: isoNow(),
      });
      await eventsRepo.append(db, task.capture_id, terminal ? 'ai_failed' : 'ai_retry', {
        attempt: attempts,
        error: errorMessage(error),
      });
      result.failed += 1;
    }
  }

  return result;
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
