import { importAudio, type X1AudioFile, type X1ImportResult, type X1RealtimeImportResult } from 'orbit-recorder-device';

import { createRecordingCapture, type LivePartialInput } from '../recording/recording-service';
import { recordingTimestampTitle } from '../recording/title';
import { openDb } from '../storage/db';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { expoFileSystem } from '../../utils/fs';
import type { RecordingDetail } from '../../types/recording';

export interface ImportX1AudioOptions {
  db?: SQLiteDatabaseLike;
  sourceVersion?: string;
  transcriptText?: string;
  partials?: LivePartialInput[];
}

export async function importX1AudioFile(
  file: X1AudioFile,
  options: ImportX1AudioOptions = {},
): Promise<RecordingDetail> {
  const startedAtMs = Date.now();
  logImportTiming('native-start', {
    durationMs: file.durationMs,
    expectedSize: file.byteSize,
    name: file.name,
  });
  const imported = await importAudio(file, 0);
  logImportTiming('native-complete', {
    byteSize: imported.byteSize,
    chunksReceived: imported.chunksReceived,
    elapsedMs: Date.now() - startedAtMs,
    expectedSize: imported.expectedSize,
    firstByteAt: imported.firstByteAt,
    maxChunkBytes: imported.maxChunkBytes,
    name: imported.name || file.name,
    nativeEndedAt: imported.nativeEndedAt,
    nativeStartedAt: imported.nativeStartedAt,
    status: imported.status,
    success: imported.success,
  });
  const saved = await saveImportedX1Audio(file, imported, options);
  logImportTiming('total-complete', {
    elapsedMs: Date.now() - startedAtMs,
    id: saved.meta.id,
    name: file.name,
  });
  return saved;
}

export async function saveImportedX1Audio(
  file: X1AudioFile,
  imported: X1ImportResult,
  options: ImportX1AudioOptions = {},
): Promise<RecordingDetail> {
  if (!imported.success) {
    throw new Error(`x1.import_failed_status:${imported.status}`);
  }

  const captureStartedAtMs = Date.now();
  logImportTiming('capture-start', {
    byteSize: imported.byteSize,
    expectedSize: imported.expectedSize,
    name: imported.name || file.name,
  });
  const db = options.db ?? (await openDb());
  const startedAt = new Date().toISOString();
  const recordedAt = startedAtFromFilename(file.name) ?? startedAt;
  const detail = await createRecordingCapture(
    {
      title: titleFromFilename(file.name),
      audioUri: imported.uri,
      audioFilename: audioAttachmentFilename(imported.name || file.name),
      audioMime: imported.mime || mimeFromFilename(imported.name || file.name),
      recordedAt,
      durationMs: file.durationMs || imported.durationMs || 0,
      startedAt,
      languageHints: [],
      partials: [],
      transcriptText: '',
      partialProvider: 'x1-import',
      waveformSamples: [],
      source: {
        kind: 'x1_file',
        device_model: 'newman-x1',
        file_name: file.name,
        byte_size: file.byteSize || imported.byteSize,
        duration_ms: file.durationMs || imported.durationMs,
        imported_at: startedAt,
      },
    },
    {
      db,
      sourceVersion: options.sourceVersion ?? '0.0.0',
    },
  );
  logImportTiming('capture-complete', {
    elapsedMs: Date.now() - captureStartedAtMs,
    id: detail.meta.id,
    name: file.name,
  });
  await expoFileSystem.delete(imported.uri, { idempotent: true }).catch(() => undefined);
  return detail;
}

export async function saveRealtimeX1Audio(
  imported: X1RealtimeImportResult,
  options: ImportX1AudioOptions = {},
): Promise<RecordingDetail> {
  const success = imported.success || (imported.status === 2 && imported.byteSize > 0);
  if (!success) {
    throw new Error(`x1.realtime_failed_status:${imported.status}`);
  }

  const db = options.db ?? (await openDb());
  const startedAt = normalizeIsoDate(imported.startedAt) ?? new Date().toISOString();
  const transcriptText = options.transcriptText?.trim() ?? '';
  const detail = await createRecordingCapture(
    {
      title: titleFromFilename(imported.name),
      audioUri: imported.uri,
      audioFilename: audioAttachmentFilename(imported.name),
      audioMime: imported.mime || mimeFromFilename(imported.name),
      recordedAt: startedAt,
      durationMs: imported.durationMs,
      startedAt,
      languageHints: [],
      partials: options.partials ?? [],
      transcriptText,
      partialProvider: transcriptText ? 'x1-realtime-ios-speech' : 'x1-realtime',
      waveformSamples: [],
      source: {
        kind: 'x1_realtime',
        device_model: 'newman-x1',
        file_name: imported.name,
        byte_size: imported.byteSize,
        duration_ms: imported.durationMs,
        imported_at: new Date().toISOString(),
      },
    },
    {
      db,
      sourceVersion: options.sourceVersion ?? '0.0.0',
    },
  );
  await expoFileSystem.delete(imported.uri, { idempotent: true }).catch(() => undefined);
  return detail;
}

export async function listImportedX1AudioFileNames(
  options: { db?: SQLiteDatabaseLike } = {},
): Promise<Set<string>> {
  const db = options.db ?? (await openDb());
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT recording_annotations.target_id AS name
     FROM recording_annotations
     JOIN captures ON captures.id = recording_annotations.recording_id
     WHERE recording_annotations.kind = ?
       AND recording_annotations.target_id IS NOT NULL
       AND captures.deleted_locally = 0`,
    ['x1_import'],
  );
  const legacyRows = await db.getAllAsync<{ title: string }>(
    `SELECT recordings.title AS title
     FROM recordings
     JOIN captures ON captures.id = recordings.id
     WHERE recordings.partial_provider = ?
       AND captures.deleted_locally = 0`,
    ['x1-import'],
  );
  const names = rows.map((row) => row.name).filter((name) => name.length > 0);
  for (const row of legacyRows) {
    const inferred = inferX1FilenameFromTitle(row.title);
    if (inferred) names.push(inferred);
  }
  return new Set(names);
}

function titleFromFilename(filename: string): string {
  const startedAt = startedAtFromFilename(filename);
  return recordingTimestampTitle(startedAt ? new Date(startedAt) : new Date(), 'x1');
}

function inferX1FilenameFromTitle(title: string): string | null {
  const match = title.match(/^录音卡-(\d{14})$/);
  return match?.[1] ? `${match[1]}.mp3` : null;
}

function audioAttachmentFilename(filename: string): string {
  const ext = extensionFromFilename(filename);
  return `audio.${ext || 'mp3'}`;
}

function mimeFromFilename(filename: string): string {
  switch (extensionFromFilename(filename)) {
    case 'm4a':
      return 'audio/m4a';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    default:
      return 'audio/mpeg';
  }
}

function extensionFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? 'mp3';
}

function startedAtFromFilename(filename: string): string | null {
  const match = filename.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_ ]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})?/);
  if (!match) return null;
  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6] ?? '00';
  if (!year || !month || !day || !hour || !minute) return null;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function logImportTiming(phase: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') return;
  console.info('[x1-import-timing]', {
    at: new Date().toISOString(),
    phase,
    ...payload,
  });
}
