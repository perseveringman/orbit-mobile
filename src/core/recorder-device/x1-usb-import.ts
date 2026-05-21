import { createRecordingCapture } from '../recording/recording-service';
import { recordingTimestampTitle } from '../recording/title';
import { openDb } from '../storage/db';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import type { FileSystemAdapter } from '../../utils/fs';
import type { RecordingDetail } from '../../types/recording';

export interface ImportX1UsbAudioOptions {
  db?: SQLiteDatabaseLike;
  fs?: FileSystemAdapter;
  sourceVersion?: string;
  detectDurationMs?: (uri: string) => Promise<number | null>;
}

export interface X1UsbPickedAudioFile {
  uri: string;
  filename: string;
  displayName: string;
  mime: string;
  byteSize?: number;
}

export interface X1UsbImportedAudioFile {
  recordingId: string;
  name: string;
  title: string;
  byteSize?: number;
  durationMs: number;
  importedAt: string;
  transferMode?: string;
}

export async function importX1UsbAudioFile(
  file: X1UsbPickedAudioFile,
  options: ImportX1UsbAudioOptions = {},
): Promise<RecordingDetail> {
  const db = options.db ?? (await openDb());
  const importedAt = new Date().toISOString();
  const sourceName = x1ImportNameForPickedFile(file);
  const recordedAt = startedAtFromFilename(sourceName) ?? importedAt;
  const durationMs = await detectAudioDurationMs(file.uri, options.detectDurationMs) ?? 0;
  return createRecordingCapture(
    {
      title: titleFromFilename(sourceName),
      audioUri: file.uri,
      audioFilename: audioAttachmentFilename(file.filename || sourceName),
      audioMime: file.mime || mimeFromFilename(sourceName),
      recordedAt,
      durationMs,
      startedAt: importedAt,
      languageHints: [],
      partials: [],
      transcriptText: '',
      partialProvider: 'x1-import',
      waveformSamples: [],
      source: {
        kind: 'x1_file',
        device_model: 'newman-x1',
        file_name: sourceName,
        byte_size: file.byteSize,
        duration_ms: durationMs || undefined,
        imported_at: importedAt,
        transfer_mode: 'usb_disk',
      },
    },
    {
      db,
      fs: options.fs,
      sourceVersion: options.sourceVersion ?? '0.0.0',
    },
  );
}

export async function listImportedX1UsbAudioFiles(
  options: { db?: SQLiteDatabaseLike } = {},
): Promise<X1UsbImportedAudioFile[]> {
  const db = options.db ?? (await openDb());
  const rows = await db.getAllAsync<{
    recording_id: string;
    title: string;
    duration_ms: number;
    name: string | null;
    payload_json: string;
    imported_at: string;
  }>(
    `SELECT recording_annotations.recording_id AS recording_id,
            recordings.title AS title,
            recordings.duration_ms AS duration_ms,
            recording_annotations.target_id AS name,
            recording_annotations.payload_json AS payload_json,
            recording_annotations.updated_at AS imported_at
     FROM recording_annotations
     JOIN recordings ON recordings.id = recording_annotations.recording_id
     JOIN captures ON captures.id = recording_annotations.recording_id
     WHERE recording_annotations.kind = ?
       AND captures.deleted_locally = 0
     ORDER BY recording_annotations.updated_at DESC, captures.created_at DESC`,
    ['x1_import'],
  );
  return rows.map((row) => {
    const payload = parsePayload(row.payload_json);
    const payloadName = stringPayloadValue(payload, 'file_name');
    const name = row.name || payloadName || inferX1FilenameFromTitle(row.title) || row.title;
    return {
      recordingId: row.recording_id,
      name,
      title: row.title,
      byteSize: numberPayloadValue(payload, 'byte_size'),
      durationMs: numberPayloadValue(payload, 'duration_ms') ?? row.duration_ms,
      importedAt: stringPayloadValue(payload, 'imported_at') ?? row.imported_at,
      transferMode: stringPayloadValue(payload, 'transfer_mode') ?? undefined,
    };
  });
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

export function x1ImportNameForPickedFile(file: X1UsbPickedAudioFile): string {
  return file.displayName.trim() || file.filename.trim() || 'x1-audio.mp3';
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

async function detectAudioDurationMs(
  uri: string,
  detector?: (uri: string) => Promise<number | null>,
): Promise<number | null> {
  try {
    if (detector) {
      return positiveMs(await detector(uri));
    }
    const playback = await import('../audio/playback');
    return positiveMs(await playback.readAudioDurationMs(uri));
  } catch {
    return null;
  }
}

function positiveMs(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberPayloadValue(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
