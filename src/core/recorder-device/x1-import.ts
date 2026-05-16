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
  const imported = await importAudio(file, 0);
  return saveImportedX1Audio(file, imported, options);
}

export async function saveImportedX1Audio(
  file: X1AudioFile,
  imported: X1ImportResult,
  options: ImportX1AudioOptions = {},
): Promise<RecordingDetail> {
  if (!imported.success) {
    throw new Error(`x1.import_failed_status:${imported.status}`);
  }

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
    },
    {
      db,
      sourceVersion: options.sourceVersion ?? '0.0.0',
    },
  );
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
    },
    {
      db,
      sourceVersion: options.sourceVersion ?? '0.0.0',
    },
  );
  await expoFileSystem.delete(imported.uri, { idempotent: true }).catch(() => undefined);
  return detail;
}

function titleFromFilename(filename: string): string {
  const startedAt = startedAtFromFilename(filename);
  return recordingTimestampTitle(startedAt ? new Date(startedAt) : new Date(), 'x1');
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
