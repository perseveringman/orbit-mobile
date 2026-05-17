import Constants from 'expo-constants';

import type { PickedFile } from '../file/picker';
import { createRecordingCapture } from './recording-service';
import { recordingTimestampTitle } from './title';
import { openDb } from '../storage/db';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import type { RecordingDetail } from '../../types/recording';

export interface ImportAudioFileOptions {
  db?: SQLiteDatabaseLike;
  sourceVersion?: string;
}

export async function createImportedAudioRecording(
  file: PickedFile,
  options: ImportAudioFileOptions = {},
): Promise<RecordingDetail> {
  const db = options.db ?? (await openDb());
  const importedAt = new Date().toISOString();
  return createRecordingCapture(
    {
      title: titleFromFile(file.displayName, importedAt),
      audioUri: file.uri,
      audioFilename: audioAttachmentFilename(file.filename),
      audioMime: file.mime,
      durationMs: 0,
      startedAt: importedAt,
      recordedAt: importedAt,
      languageHints: [],
      partials: [],
      transcriptText: '',
      partialProvider: 'audio-import',
      waveformSamples: [],
      source: {
        kind: 'file_import',
        file_name: file.displayName || file.filename,
        byte_size: file.byteSize,
        imported_at: importedAt,
      },
    },
    {
      db,
      sourceVersion: options.sourceVersion ?? Constants.expoConfig?.version ?? '0.0.0',
    },
  );
}

function titleFromFile(displayName: string, importedAt: string): string {
  const stem = displayName.replace(/\.[a-z0-9]+$/i, '').trim();
  if (stem && !/^audio-\d+$/i.test(stem)) return stem.slice(0, 48);
  return recordingTimestampTitle(new Date(importedAt), 'iphone');
}

function audioAttachmentFilename(filename: string): string {
  const ext = extensionFromFilename(filename);
  return `audio.${ext || 'mp3'}`;
}

function extensionFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? 'mp3';
}
