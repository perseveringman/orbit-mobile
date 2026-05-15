import { createCapture } from '../capture/atomic-write';
import { enqueueRecordingNotesAiTask } from '../ai/worker';
import type { CaptureAttachment, CaptureManifest } from '../capture/types';
import * as capturesRepo from '../storage/captures-repo';
import * as recordingsRepo from '../storage/recordings-repo';
import type { SQLiteDatabaseLike } from '../storage/sqlite';
import { expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';
import { generateSessionId } from '../../utils/id';
import type {
  DerivativeKind,
  DerivativePayload,
  FinalTranscript,
  OutlineItem,
  RecordingDetail,
  RecordingMeta,
  RecordingSpeaker,
  TranscriptSegment,
} from '../../types/recording';

const DEFAULT_SPEAKER: RecordingSpeaker = {
  id: 'S1',
  label: '说话人',
  color: '#2563eb',
};

export interface LivePartialInput {
  elapsed_ms: number;
  text: string;
  speaker?: string;
  is_final?: boolean;
}

interface WaveformPayload {
  schema: 'orbit.waveform@1';
  duration_ms: number;
  sample_count: number;
  samples: number[];
}

export interface CreateRecordingInput {
  title: string;
  audioUri: string;
  durationMs: number;
  startedAt: string;
  languageHints: string[];
  partials: LivePartialInput[];
  transcriptText: string;
  partialProvider: string;
  waveformSamples?: number[];
}

export interface RecordingServiceOptions {
  db?: SQLiteDatabaseLike;
  fs?: FileSystemAdapter;
  sourceVersion?: string;
}

export async function createRecordingCapture(
  input: CreateRecordingInput,
  options: RecordingServiceOptions = {},
): Promise<RecordingDetail> {
  const db = options.db ?? (await openDb());
  const fs = options.fs ?? expoFileSystem;
  const startedAt = new Date(input.startedAt);
  const now = Number.isNaN(startedAt.getTime()) ? new Date() : startedAt;
  const safeTitle = input.title.trim() || defaultTitle(now);
  const transcript = buildFinalTranscript(input);
  const outline = buildOutline(transcript);
  const derivatives = buildDerivatives(transcript, outline, now);
  const tmpDir = joinPath(fs.documentDirectory, 'tmp', `recording-${generateSessionId()}`);
  await fs.ensureDir(tmpDir);

  const transcriptPath = joinPath(tmpDir, 'final-transcript.json');
  const partialPath = joinPath(tmpDir, 'partial-transcript.ndjson');
  const waveformPath = joinPath(tmpDir, 'waveform.json');
  const waveform = buildWaveformPayload(input.waveformSamples ?? [], input.durationMs);
  await fs.writeString(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
  await fs.writeString(partialPath, serializePartials(input.partials));
  await fs.writeString(waveformPath, `${JSON.stringify(waveform, null, 2)}\n`);
  await fs.fsync(transcriptPath);
  await fs.fsync(partialPath);
  await fs.fsync(waveformPath);

  const derivativeAttachments: CaptureAttachment[] = [];
  const derivativeRefs: CaptureManifest['derivatives'] = [];
  const outlinePath = joinPath(tmpDir, 'outline.json');
  await fs.writeString(outlinePath, `${JSON.stringify(outline, null, 2)}\n`);
  await fs.fsync(outlinePath);
  derivativeAttachments.push({
    type: 'derivative',
    filename: 'outline.json',
    localUri: outlinePath,
    mime: 'application/json',
    derivative_kind: 'outline',
    schema: 'orbit.outline@1',
  });
  derivativeRefs.push({ kind: 'outline', filename: 'outline.json' });

  for (const payload of Object.values(derivatives)) {
    if (!payload || Array.isArray(payload)) continue;
    const filename = `${payload.kind}.json`;
    const path = joinPath(tmpDir, filename);
    await fs.writeString(path, `${JSON.stringify(payload, null, 2)}\n`);
    await fs.fsync(path);
    derivativeAttachments.push({
      type: 'derivative',
      filename,
      localUri: path,
      mime: 'application/json',
      derivative_kind: payload.kind,
      schema: payload.schema,
    });
    derivativeRefs.push({ kind: payload.kind, filename });
  }

  const plainTranscript = transcript.segments.map((segment) => segment.text).join('\n');
  const content = [safeTitle, plainTranscript].filter(Boolean).join('\n\n');
  const audioAttachment: CaptureAttachment = {
    type: 'audio',
    filename: 'audio.m4a',
    localUri: input.audioUri,
    mime: 'audio/m4a',
    duration_ms: input.durationMs,
    recorded_at: input.startedAt,
    transcription: plainTranscript || undefined,
    transcription_source: input.partialProvider,
  };

  const result = await createCapture(
    {
      kind: 'recording',
      content,
      attachments: [
        audioAttachment,
        {
          type: 'transcript-partial',
          filename: 'partial-transcript.ndjson',
          localUri: partialPath,
          mime: 'application/x-ndjson',
          schema: 'orbit.transcript-partial@1',
        },
        {
          type: 'transcript',
          filename: 'final-transcript.json',
          localUri: transcriptPath,
          mime: 'application/json',
          schema: transcript.schema,
        },
        {
          type: 'derivative',
          filename: 'waveform.json',
          localUri: waveformPath,
          mime: 'application/json',
          schema: waveform.schema,
          derivative_kind: 'waveform',
        },
        ...derivativeAttachments,
      ],
      recording: {
        duration_ms: input.durationMs,
        language_hints: input.languageHints,
        speakers: transcript.speakers,
        partial_provider: input.partialProvider,
        final_provider: 'local-live-transcript',
        diarization_provider: null,
      },
      derivatives: derivativeRefs,
      inputStartedAt: input.startedAt,
    },
    {
      db,
      fs,
      sourceVersion: options.sourceVersion ?? '0.0.0',
      afterCaptureInsert: async ({ db: txn, id }) => {
        await recordingsRepo.insert(txn, {
          id,
          title: safeTitle,
          duration_ms: input.durationMs,
          language_hints: input.languageHints,
          speaker_count: transcript.speakers.length,
          partial_state: input.partialProvider === 'unavailable' ? 'failed' : 'finished',
          final_state: 'done',
          partial_provider: input.partialProvider,
          final_provider: 'local-live-transcript',
          final_done_at: new Date().toISOString(),
          created_at: input.startedAt,
        });
      },
    },
  );

  await fs.delete(tmpDir, { idempotent: true });
  const detail = await loadRecordingDetail(result.id, { db, fs });
  if (!detail) {
    throw new Error(`recording.create_missing_detail:${result.id}`);
  }
  await enqueueRecordingNotesAiTask(db, result.id, { detail, fs }).catch(() => undefined);
  return detail;
}

export async function listRecordingMetas(
  options: RecordingServiceOptions & { limit?: number } = {},
): Promise<RecordingMeta[]> {
  const db = options.db ?? (await openDb());
  const fs = options.fs ?? expoFileSystem;
  const rows = await recordingsRepo.list(db, options.limit ?? 100);
  return Promise.all(rows.map(async (row) => {
    const meta = recordingsRepo.toRecordingMeta(row);
    const capture = await capturesRepo.get(db, row.id);
    if (!capture) return meta;
    return {
      ...meta,
      waveform_samples: await readWaveformSamples(fs, capture.local_path),
    };
  }));
}

export async function loadRecordingDetail(
  id: string,
  options: RecordingServiceOptions = {},
): Promise<RecordingDetail | null> {
  const db = options.db ?? (await openDb());
  const fs = options.fs ?? expoFileSystem;
  const [recording, capture] = await Promise.all([
    recordingsRepo.get(db, id),
    capturesRepo.get(db, id),
  ]);
  if (!recording || !capture) return null;

  const manifest = JSON.parse(
    await fs.readString(joinPath(capture.local_path, 'manifest.json')),
  ) as CaptureManifest;
  const transcript = await readJsonAttachment<FinalTranscript>(
    fs,
    capture.local_path,
    manifest,
    'final-transcript.json',
  ) ?? fallbackTranscript(manifest.content, recording.duration_ms);
  const outline = await readJsonAttachment<OutlineItem[]>(
    fs,
    capture.local_path,
    manifest,
    'outline.json',
  ) ?? buildOutline(transcript);
  const derivatives = await readDerivativeMap(fs, capture.local_path, manifest);
  const waveformSamples = await readWaveformSamples(fs, capture.local_path, manifest);
  const audio = manifest.attachments.find((attachment) => attachment.type === 'audio');
  const audioPath = audio ? joinPath(capture.local_path, audio.filename) : null;
  const audioInfo = audioPath ? await fs.getInfo(audioPath) : null;

  return {
    meta: {
      ...recordingsRepo.toRecordingMeta(recording, transcript.speakers),
      started_at: recording.created_at,
      participants: transcript.speakers.map((speaker) => speaker.label),
    },
    audio_uri: audioPath ? fileUri(audioPath) : undefined,
    audio_exists: audioInfo?.exists === true && audioInfo.isDirectory !== true,
    waveform_samples: waveformSamples,
    outline,
    transcript,
    derivatives,
  };
}

function buildFinalTranscript(input: CreateRecordingInput): FinalTranscript {
  const sourceText = normalizeTranscript(input.transcriptText)
    || normalizeTranscript(input.partials.map((partial) => partial.text).join(' '))
    || `语音录制 ${formatDuration(input.durationMs)}，暂无可用实时转写。`;
  const sentences = splitSentences(sourceText);
  const segmentDuration = Math.max(1000, Math.floor(input.durationMs / Math.max(1, sentences.length)));
  const segments: TranscriptSegment[] = sentences.map((text, index) => ({
    id: index,
    speaker: DEFAULT_SPEAKER.id,
    start_ms: Math.min(input.durationMs, index * segmentDuration),
    end_ms: Math.min(input.durationMs, (index + 1) * segmentDuration),
    text,
    confidence: input.partialProvider === 'ios-speech' ? 0.75 : undefined,
  }));

  return {
    schema: 'orbit.transcript@1',
    language_detected: input.languageHints.filter((hint) => hint !== 'auto'),
    speakers: [DEFAULT_SPEAKER],
    segments,
  };
}

function buildOutline(transcript: FinalTranscript): OutlineItem[] {
  return transcript.segments.slice(0, 6).map((segment, index) => ({
    id: `outline-${index + 1}`,
    title: segment.text.slice(0, 32) || `片段 ${index + 1}`,
    start_ms: segment.start_ms,
  }));
}

function buildDerivatives(
  transcript: FinalTranscript,
  outline: OutlineItem[],
  now: Date,
): {
  summary: DerivativePayload;
  decisions: DerivativePayload;
  risks: DerivativePayload;
  todos: DerivativePayload;
} {
  const text = transcript.segments.map((segment) => segment.text).join(' ');
  const generatedAt = now.toISOString();
  return {
    summary: {
      schema: 'orbit.derivative@1',
      kind: 'summary',
      generated_at: generatedAt,
      provider: 'local-heuristic',
      body: [
        '## 概述',
        text.length > 0 ? summarizeText(text) : '暂无转写文本；原始录音已完整保存。',
        '',
        '## 关键片段',
        ...outline.slice(0, 3).map((item) => `- ${item.title}`),
      ].join('\n'),
    },
    decisions: buildKeywordDerivative('decisions', generatedAt, transcript, ['决定', '确认', '锁定', '同意']),
    risks: buildKeywordDerivative('risks', generatedAt, transcript, ['风险', '担心', '阻塞', '问题']),
    todos: buildKeywordDerivative('todos', generatedAt, transcript, ['需要', '待办', '行动', '跟进', '负责']),
  };
}

function buildKeywordDerivative(
  kind: Extract<DerivativeKind, 'decisions' | 'risks' | 'todos'>,
  generatedAt: string,
  transcript: FinalTranscript,
  keywords: string[],
): DerivativePayload {
  const items = transcript.segments
    .filter((segment) => keywords.some((keyword) => segment.text.includes(keyword)))
    .slice(0, 6)
    .map((segment, index) => ({
      id: `${kind}-${index + 1}`,
      title: `${labelForKind(kind)} ${index + 1}`,
      body: segment.text,
      anchors: [{ start_ms: segment.start_ms, end_ms: segment.end_ms }],
      speakers: [segment.speaker],
      done: kind === 'todos' ? false : undefined,
    }));
  return {
    schema: 'orbit.derivative@1',
    kind,
    generated_at: generatedAt,
    provider: 'local-heuristic',
    items,
  };
}

async function readDerivativeMap(
  fs: FileSystemAdapter,
  localPath: string,
  manifest: CaptureManifest,
): Promise<RecordingDetail['derivatives']> {
  const derivatives: RecordingDetail['derivatives'] = { custom: [] };
  for (const ref of manifest.derivatives ?? []) {
    if (ref.kind === 'outline') continue;
    const payload = await readJsonFile<DerivativePayload>(fs, joinPath(localPath, ref.filename));
    if (!payload) continue;
    if (payload.kind === 'custom') {
      derivatives.custom = [...(derivatives.custom ?? []), payload];
    } else {
      derivatives[payload.kind] = payload;
    }
  }
  return derivatives;
}

async function readWaveformSamples(
  fs: FileSystemAdapter,
  localPath: string,
  manifest?: CaptureManifest,
): Promise<number[]> {
  const payload = manifest
    ? await readJsonAttachment<WaveformPayload>(fs, localPath, manifest, 'waveform.json')
    : await readJsonFile<WaveformPayload>(fs, joinPath(localPath, 'waveform.json'));
  return sanitizeWaveformSamples(payload?.samples ?? []);
}

async function readJsonAttachment<T>(
  fs: FileSystemAdapter,
  localPath: string,
  manifest: CaptureManifest,
  filename: string,
): Promise<T | null> {
  const attachment = manifest.attachments.find((item) => item.filename === filename);
  if (!attachment) return null;
  return readJsonFile<T>(fs, joinPath(localPath, attachment.filename));
}

async function readJsonFile<T>(fs: FileSystemAdapter, path: string): Promise<T | null> {
  const info = await fs.getInfo(path);
  if (!info.exists || info.isDirectory) return null;
  return JSON.parse(await fs.readString(path)) as T;
}

function fallbackTranscript(content: string, durationMs: number): FinalTranscript {
  return {
    schema: 'orbit.transcript@1',
    language_detected: [],
    speakers: [DEFAULT_SPEAKER],
    segments: [
      {
        id: 0,
        speaker: DEFAULT_SPEAKER.id,
        start_ms: 0,
        end_ms: durationMs,
        text: content.trim() || `语音录制 ${formatDuration(durationMs)}，暂无转写。`,
      },
    ],
  };
}

function serializePartials(partials: LivePartialInput[]): string {
  return partials
    .map((partial) =>
      JSON.stringify({
        ts: partial.elapsed_ms,
        speaker: partial.speaker ?? DEFAULT_SPEAKER.id,
        text: partial.text,
        isFinal: partial.is_final ?? false,
      }),
    )
    .join('\n');
}

function buildWaveformPayload(samples: number[], durationMs: number): WaveformPayload {
  const normalized = downsampleWaveform(sanitizeWaveformSamples(samples), 1_200);
  return {
    schema: 'orbit.waveform@1',
    duration_ms: durationMs,
    sample_count: normalized.length,
    samples: normalized,
  };
}

function sanitizeWaveformSamples(samples: number[]): number[] {
  return samples
    .map((sample) => Number(sample))
    .filter((sample) => Number.isFinite(sample))
    .map((sample) => Math.max(0, Math.min(1, sample)));
}

function downsampleWaveform(samples: number[], maxSamples: number): number[] {
  if (samples.length <= maxSamples) return samples;
  const out: number[] = [];
  for (let i = 0; i < maxSamples; i += 1) {
    const start = Math.floor((i * samples.length) / maxSamples);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / maxSamples));
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      peak = Math.max(peak, samples[j] ?? 0);
    }
    out.push(peak);
  }
  return out;
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^。！？.!?\n]+[。！？.!?]?/g) ?? [text];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function summarizeText(text: string): string {
  const normalized = normalizeTranscript(text);
  if (normalized.length <= 260) return normalized;
  return `${normalized.slice(0, 260)}…`;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function labelForKind(kind: 'decisions' | 'risks' | 'todos'): string {
  if (kind === 'decisions') return '决策';
  if (kind === 'risks') return '风险';
  return '待办';
}

function defaultTitle(date: Date): string {
  return `录音 ${date.toLocaleString('zh-Hans-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function fileUri(path: string): string {
  if (/^(file|content|data|https?):\/\//.test(path)) return path;
  return `file://${path}`;
}

async function openDb(): Promise<SQLiteDatabaseLike> {
  const dbModule = await import('../storage/db');
  return dbModule.openDb();
}
