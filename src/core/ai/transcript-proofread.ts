import { sha256String } from '../capture/hash';
import { contentPreview, serializeManifest } from '../capture/manifest';
import type { CaptureManifest } from '../capture/types';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import * as annotationsRepo from '../storage/recording-annotations-repo';
import * as capturesRepo from '../storage/captures-repo';
import * as eventsRepo from '../storage/events-repo';
import { expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';
import { isoNow } from '../../utils/time';
import type {
  RecordingDetail,
  TranscriptCorrection,
  TranscriptSegment,
} from '../../types/recording';
import type { DeepSeekClient, DeepSeekMessage } from './deepseek-client';

interface ProofreadJson {
  corrections?: unknown;
}

interface CorrectionJson {
  segment_id?: unknown;
  original_text?: unknown;
  corrected_text?: unknown;
  reason?: unknown;
  confidence?: unknown;
  hotword?: unknown;
}

export async function generateTranscriptCorrections(
  client: DeepSeekClient,
  detail: RecordingDetail,
  hotwords: readonly string[],
): Promise<TranscriptCorrection[]> {
  const payload = await client.chatJson<ProofreadJson>(buildProofreadMessages(detail, hotwords), {
    temperature: 0,
  });
  return coerceProofreadPayload(payload, detail);
}

export async function writeTranscriptCorrections(
  db: SQLiteDatabaseLike,
  recordingId: string,
  corrections: readonly TranscriptCorrection[],
): Promise<void> {
  const now = isoNow();
  const existing = await listPendingTranscriptCorrections(db, recordingId);
  for (const correction of existing) {
    await annotationsRepo.del(db, recordingId, 'transcript_correction', correction.id);
  }
  for (const correction of corrections) {
    await annotationsRepo.upsert(db, {
      recording_id: recordingId,
      kind: 'transcript_correction',
      target_id: correction.id,
      payload: {
        ...correction,
        status: 'pending',
        created_at: correction.created_at || now,
      },
      now,
    });
  }
}

export async function listPendingTranscriptCorrections(
  db: SQLiteDatabaseLike,
  recordingId: string,
): Promise<TranscriptCorrection[]> {
  const rows = await annotationsRepo.listByRecording(db, recordingId, 'transcript_correction');
  return rows
    .map((row) => annotationsRepo.parsePayload<TranscriptCorrection>(row))
    .filter((payload): payload is TranscriptCorrection => payload !== null)
    .filter((correction) => correction.status === 'pending')
    .sort((a, b) => a.start_ms - b.start_ms || a.id.localeCompare(b.id));
}

export async function acceptTranscriptCorrections(
  db: SQLiteDatabaseLike,
  recordingId: string,
  correctionIds?: readonly string[],
  fs: FileSystemAdapter = expoFileSystem,
): Promise<{ accepted: number; skipped: number }> {
  const capture = await capturesRepo.get(db, recordingId);
  if (!capture) {
    throw new Error(`proofread.capture_missing:${recordingId}`);
  }
  const selected = correctionIds ? new Set(correctionIds) : null;
  const corrections = (await listPendingTranscriptCorrections(db, recordingId))
    .filter((correction) => selected === null || selected.has(correction.id));
  if (corrections.length === 0) {
    return { accepted: 0, skipped: 0 };
  }

  const manifestPath = joinPath(capture.local_path, 'manifest.json');
  const transcriptPath = joinPath(capture.local_path, 'final-transcript.json');
  const manifest = JSON.parse(await fs.readString(manifestPath)) as CaptureManifest;
  const transcript = JSON.parse(await fs.readString(transcriptPath)) as RecordingDetail['transcript'];
  const bySegment = new Map<number, TranscriptSegment>(
    transcript.segments.map((segment) => [segment.id, segment]),
  );
  const acceptedCorrections: TranscriptCorrection[] = [];
  let accepted = 0;
  let skipped = 0;

  for (const correction of corrections) {
    const segment = bySegment.get(correction.segment_id);
    if (!segment) {
      skipped += 1;
      continue;
    }
    const nextText = replaceOnce(segment.text, correction.original_text, correction.corrected_text);
    if (nextText === segment.text) {
      skipped += 1;
      continue;
    }
    segment.text = nextText;
    accepted += 1;
    acceptedCorrections.push(correction);
  }

  if (accepted === 0) {
    return { accepted, skipped };
  }

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
  }

  const manifestContents = serializeManifest(manifest);
  const manifestSha256 = await sha256String(manifestContents);
  await atomicWriteString(fs, manifestPath, manifestContents);
  await atomicWriteString(fs, joinPath(capture.local_path, 'manifest.json.sha256'), manifestSha256);
  await capturesRepo.updateLocalMetadata(db, recordingId, {
    byte_size: await directorySize(fs, capture.local_path),
    content_hash: manifestSha256,
    content_preview: contentPreview(manifest.content),
  });
  const acceptedAt = isoNow();
  for (const correction of acceptedCorrections) {
    await annotationsRepo.upsert(db, {
      recording_id: recordingId,
      kind: 'transcript_correction',
      target_id: correction.id,
      payload: {
        ...correction,
        status: 'accepted',
        accepted_at: acceptedAt,
      },
    });
  }
  await eventsRepo.append(db, recordingId, 'ai_proofread_accepted', {
    accepted,
    skipped,
  });
  return { accepted, skipped };
}

export async function transcriptProofreadInputHash(
  detail: {
    transcript: { segments: { id: number; start_ms: number; end_ms: number; speaker: string; text: string }[] };
  },
  hotwords: readonly string[],
): Promise<string> {
  return sha256String(JSON.stringify({
    segments: detail.transcript.segments.map((segment) => ({
      id: segment.id,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      speaker: segment.speaker,
      text: segment.text,
    })),
    hotwords: hotwords.map((word) => word.trim()).filter(Boolean).sort(),
  }));
}

function buildProofreadMessages(detail: RecordingDetail, hotwords: readonly string[]): DeepSeekMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Orbit Mobile 的录音转写校对器。',
        '只校对转写文本里的识别错误、错别字、同音误识别、专有名词和英文/中文大小写。',
        '不要改写表达风格，不要总结，不要补充原文没有的信息。',
        '热词列表是用户事先配置的专用名词；如果原文疑似误识别为热词，优先建议改成热词。',
        '输出必须是 JSON 对象，字段 corrections 为数组。',
        'corrections 数组项：{segment_id, original_text, corrected_text, reason, confidence, hotword?}。',
        'original_text 必须是对应 segment 文本里连续出现的一段原文。',
        '没有需要修改的地方时输出 {"corrections":[] }。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `录音标题：${detail.meta.title}`,
        `语言提示：${detail.meta.language_hints.join(', ') || 'auto'}`,
        '',
        '热词列表：',
        hotwords.length ? hotwords.map((word) => `- ${word}`).join('\n') : '（无）',
        '',
        '转写片段：',
        detail.transcript.segments
          .map((segment) => `[segment_id=${segment.id}][${segment.start_ms}-${segment.end_ms}ms][${segment.speaker}] ${segment.text}`)
          .join('\n')
          .slice(0, 22_000),
      ].join('\n'),
    },
  ];
}

function coerceProofreadPayload(payload: ProofreadJson, detail: RecordingDetail): TranscriptCorrection[] {
  if (!Array.isArray(payload.corrections)) return [];
  const now = isoNow();
  const segments = new Map(detail.transcript.segments.map((segment) => [segment.id, segment]));
  const out: TranscriptCorrection[] = [];
  const seen = new Set<string>();
  for (const item of payload.corrections.slice(0, 80)) {
    const record = asRecord(item) as CorrectionJson;
    const segmentId = asNumber(record.segment_id);
    const original = normalizeInlineText(asString(record.original_text));
    const corrected = normalizeInlineText(asString(record.corrected_text));
    if (segmentId === null || !original || !corrected || original === corrected) continue;
    const segment = segments.get(segmentId);
    if (!segment || !segment.text.includes(original)) continue;
    const id = correctionId(segmentId, original, corrected);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      segment_id: segmentId,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      original_text: original,
      corrected_text: corrected,
      reason: asString(record.reason) || 'AI 建议校正这段转写。',
      confidence: asNumber(record.confidence) ?? undefined,
      hotword: asString(record.hotword) || undefined,
      status: 'pending',
      created_at: now,
    });
  }
  return out;
}

function replaceOnce(source: string, original: string, corrected: string): string {
  const index = source.indexOf(original);
  if (index < 0 || original === corrected) return source;
  return `${source.slice(0, index)}${corrected}${source.slice(index + original.length)}`;
}

async function atomicWriteString(
  fs: FileSystemAdapter,
  path: string,
  contents: string,
): Promise<void> {
  const tmp = `${path}.tmp-${correctionId(0, path, String(contents.length))}`;
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

function correctionId(segmentId: number, original: string, corrected: string): string {
  return `proof-${segmentId}-${simpleHash(`${original}\n${corrected}`)}`;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
