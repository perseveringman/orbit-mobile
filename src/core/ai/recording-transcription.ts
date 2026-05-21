import { sha256String } from '../capture/hash';
import { resolveCaptureLocalPath } from '../capture/local-path';
import { contentPreview, serializeManifest } from '../capture/manifest';
import type { CaptureManifest } from '../capture/types';
import { loadRecordingDetail } from '../recording/recording-service';
import * as capturesRepo from '../storage/captures-repo';
import * as eventsRepo from '../storage/events-repo';
import * as recordingsRepo from '../storage/recordings-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';
import { isoNow } from '../../utils/time';
import type { FinalTranscript, RecordingDetail, RecordingSpeaker, TranscriptSegment } from '../../types/recording';
import type { VolcengineAsrRecognition } from './volcengine-asr-client';

const FLASH_MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const DEFAULT_SPEAKER: RecordingSpeaker = {
  id: 'S1',
  label: '说话人',
  color: '#2563eb',
};
const SPEAKER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];

export async function recordingTranscriptionInputHash(
  detail: Pick<RecordingDetail, 'meta' | 'audio_exists' | 'audio_uri'>,
): Promise<string> {
  return sha256String(JSON.stringify({
    id: detail.meta.id,
    duration_ms: detail.meta.duration_ms,
    partial_provider: detail.meta.partial_provider,
    audio_uri: detail.audio_uri ?? null,
    audio_exists: detail.audio_exists === true,
  }));
}

export function isCloudTranscriptionCandidate(detail: RecordingDetail): boolean {
  if (detail.audio_exists !== true) return false;
  const text = detail.transcript.segments.map((segment) => segment.text).join(' ').trim();
  if (!text || /暂无可用实时转写|暂无转写/.test(text)) return true;
  return false;
}

export async function readRecordingAudioBase64(
  db: SQLiteDatabaseLike,
  recordingId: string,
  fs: FileSystemAdapter = expoFileSystem,
): Promise<{ audioBase64: string; filename: string; mime: string; byteSize: number }> {
  const capture = await capturesRepo.get(db, recordingId);
  if (!capture) {
    throw new Error(`asr.capture_missing:${recordingId}`);
  }
  const localPath = resolveCaptureLocalPath(fs, capture.local_path, capture.id);
  const manifest = JSON.parse(await fs.readString(joinPath(localPath, 'manifest.json'))) as CaptureManifest;
  const audio = manifest.attachments.find((attachment) => attachment.type === 'audio');
  if (!audio) {
    throw new Error(`asr.audio_missing:${recordingId}`);
  }
  if (audio.byte_size > FLASH_MAX_AUDIO_BYTES) {
    throw new Error(`asr.audio_too_large:${audio.byte_size}`);
  }
  return {
    audioBase64: await fs.readBase64(joinPath(localPath, audio.filename)),
    filename: audio.filename,
    mime: audio.mime,
    byteSize: audio.byte_size,
  };
}

export async function writeRecordingTranscription(
  db: SQLiteDatabaseLike,
  recordingId: string,
  recognition: VolcengineAsrRecognition,
  fs: FileSystemAdapter = expoFileSystem,
): Promise<void> {
  const capture = await capturesRepo.get(db, recordingId);
  if (!capture) {
    throw new Error(`asr.capture_missing:${recordingId}`);
  }
  const localPath = resolveCaptureLocalPath(fs, capture.local_path, capture.id);
  const manifestPath = joinPath(localPath, 'manifest.json');
  const transcriptPath = joinPath(localPath, 'final-transcript.json');
  const manifest = JSON.parse(await fs.readString(manifestPath)) as CaptureManifest;
  const previous = await readExistingTranscript(fs, transcriptPath);
  const transcript = buildTranscript(recognition, previous);
  const transcriptContents = `${JSON.stringify(transcript, null, 2)}\n`;
  await atomicWriteString(fs, transcriptPath, transcriptContents);

  const transcriptAttachment = manifest.attachments.find((item) => item.filename === 'final-transcript.json');
  if (transcriptAttachment) {
    transcriptAttachment.sha256 = await sha256String(transcriptContents);
    transcriptAttachment.byte_size = utf8ByteLength(transcriptContents);
  }

  const plainTranscript = transcript.segments.map((segment) => segment.text).join('\n');
  const title = manifest.content.split(/\n{2,}/)[0]?.trim();
  manifest.content = [title, plainTranscript].filter(Boolean).join('\n\n');
  const audio = manifest.attachments.find((item) => item.type === 'audio');
  if (audio) {
    audio.transcription = plainTranscript || undefined;
    audio.transcription_source = recognition.provider;
  }
  if (manifest.recording) {
    manifest.recording.final_provider = recognition.provider;
    manifest.recording.diarization_provider = recognition.hasSpeakerInfo ? recognition.provider : null;
    manifest.recording.speakers = transcript.speakers;
    manifest.recording.language_hints = recognition.languageDetected;
  }

  const manifestContents = serializeManifest(manifest);
  const manifestSha256 = await sha256String(manifestContents);
  await atomicWriteString(fs, manifestPath, manifestContents);
  await atomicWriteString(fs, joinPath(localPath, 'manifest.json.sha256'), manifestSha256);
  await capturesRepo.updateLocalMetadata(db, recordingId, {
    byte_size: await directorySize(fs, localPath),
    content_hash: manifestSha256,
    content_preview: contentPreview(manifest.content),
  });
  await recordingsRepo.updateFinalTranscriptionState(db, recordingId, {
    final_state: 'done',
    final_provider: recognition.provider,
    final_last_error: null,
    final_done_at: isoNow(),
    language_hints: recognition.languageDetected,
    speaker_count: transcript.speakers.length,
  });
  await eventsRepo.append(db, recordingId, 'ai_transcription_generated', {
    provider: recognition.provider,
    request_id: recognition.requestId,
    log_id: recognition.logId,
    duration_ms: recognition.durationMs,
  });
}

export async function loadTranscribableRecordingDetail(
  db: SQLiteDatabaseLike,
  recordingId: string,
  fs?: FileSystemAdapter,
): Promise<RecordingDetail | null> {
  return loadRecordingDetail(recordingId, { db, fs });
}

function buildTranscript(
  recognition: VolcengineAsrRecognition,
  previous: FinalTranscript | null,
): FinalTranscript {
  const speakers = speakersFromRecognition(recognition, previous);
  const speakerIds = new Set(speakers.map((speaker) => speaker.id));
  const fallbackSpeaker = speakers[0]?.id ?? DEFAULT_SPEAKER.id;
  const segments = recognition.segments.map((segment, index): TranscriptSegment => ({
    ...segment,
    id: index,
    speaker: speakerIds.has(segment.speaker) ? segment.speaker : fallbackSpeaker,
  }));
  return {
    schema: 'orbit.transcript@1',
    language_detected: recognition.languageDetected,
    speakers,
    segments,
  };
}

function speakersFromRecognition(
  recognition: VolcengineAsrRecognition,
  previous: FinalTranscript | null,
): RecordingSpeaker[] {
  const previousById = new Map((previous?.speakers ?? []).map((speaker) => [speaker.id, speaker]));
  const orderedIds: string[] = [];
  for (const segment of recognition.segments) {
    if (!orderedIds.includes(segment.speaker)) {
      orderedIds.push(segment.speaker);
    }
  }
  const ids = orderedIds.length > 0 ? orderedIds : [DEFAULT_SPEAKER.id];
  return ids.map((id, index) => previousById.get(id) ?? {
    id,
    label: recognition.hasSpeakerInfo ? `说话人 ${index + 1}` : DEFAULT_SPEAKER.label,
    color: SPEAKER_COLORS[index % SPEAKER_COLORS.length] ?? DEFAULT_SPEAKER.color,
  });
}

async function readExistingTranscript(fs: FileSystemAdapter, path: string): Promise<FinalTranscript | null> {
  try {
    return JSON.parse(await fs.readString(path)) as FinalTranscript;
  } catch {
    return null;
  }
}

async function atomicWriteString(
  fs: FileSystemAdapter,
  path: string,
  contents: string,
): Promise<void> {
  const tmp = `${path}.tmp-${simpleHash(`${path}\n${contents.length}\n${Date.now()}`)}`;
  await fs.writeString(tmp, contents);
  await fs.fsync(tmp);
  await fs.move(tmp, path);
  await fs.fsync(path);
}

function utf8ByteLength(value: string): number {
  return unescape(encodeURIComponent(value)).length;
}

async function directorySize(fs: FileSystemAdapter, path: string): Promise<number> {
  const info = await fs.getInfo(path);
  if (!info.exists) return 0;
  if (!info.isDirectory) return info.size ?? 0;
  const children = await fs.readDir(path);
  let total = 0;
  for (const child of children) {
    total += await directorySize(fs, joinPath(path, child));
  }
  return total;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
