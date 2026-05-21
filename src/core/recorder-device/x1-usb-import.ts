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
}

export interface X1UsbPickedAudioFile {
  uri: string;
  filename: string;
  displayName: string;
  mime: string;
  byteSize?: number;
}

export async function importX1UsbAudioFile(
  file: X1UsbPickedAudioFile,
  options: ImportX1UsbAudioOptions = {},
): Promise<RecordingDetail> {
  const db = options.db ?? (await openDb());
  const importedAt = new Date().toISOString();
  const sourceName = x1ImportNameForPickedFile(file);
  const recordedAt = startedAtFromFilename(sourceName) ?? importedAt;
  return createRecordingCapture(
    {
      title: titleFromFilename(sourceName),
      audioUri: file.uri,
      audioFilename: audioAttachmentFilename(file.filename || sourceName),
      audioMime: file.mime || mimeFromFilename(sourceName),
      recordedAt,
      durationMs: 0,
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
