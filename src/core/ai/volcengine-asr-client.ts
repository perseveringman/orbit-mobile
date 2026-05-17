import type { VolcengineAsrCredentials } from './api-key';
import type { VolcengineAsrSettings } from '../../types/ai';
import type { TranscriptSegment, TranscriptWord } from '../../types/recording';
import { generateSessionId } from '../../utils/id';

type HeadersLike = {
  get(name: string): string | null;
};

type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{
  ok: boolean;
  status: number;
  headers?: HeadersLike;
  text(): Promise<string>;
}>;

export interface VolcengineAsrRecognition {
  provider: string;
  requestId: string;
  logId: string | null;
  durationMs: number | null;
  text: string;
  segments: TranscriptSegment[];
  languageDetected: string[];
  hasSpeakerInfo: boolean;
}

interface VolcengineAsrResponse {
  audio_info?: {
    duration?: unknown;
  };
  result?: {
    text?: unknown;
    utterances?: unknown;
  };
}

interface VolcengineUtterance {
  text?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  words?: unknown;
  additions?: unknown;
  speaker?: unknown;
}

interface VolcengineWord {
  text?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  confidence?: unknown;
}

export class VolcengineAsrClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly settings: VolcengineAsrSettings,
    private readonly credentials: VolcengineAsrCredentials,
    fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async recognizeBase64(input: {
    audioBase64: string;
    languageHints?: readonly string[];
  }): Promise<VolcengineAsrRecognition> {
    const requestId = generateSessionId();
    const response = await this.fetchImpl(
      `${this.settings.baseUrl.replace(/\/+$/g, '')}/api/v3/auc/bigmodel/recognize/flash`,
      {
        method: 'POST',
        headers: {
          ...this.authHeaders(requestId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: {
            uid: this.settings.uid || this.credentials.appKey || this.credentials.apiKey || 'orbit-mobile',
          },
          audio: {
            data: input.audioBase64,
          },
          request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: true,
            show_utterances: true,
            enable_speaker_info: true,
            ssd_version: '200',
            ...(firstLanguageHint(input.languageHints) ? { language: firstLanguageHint(input.languageHints) } : {}),
            ...(this.settings.boostingTableId
              ? { boosting_table_id: this.settings.boostingTableId }
              : {}),
          },
        }),
      },
    );
    const raw = await response.text();
    const statusCode = response.headers?.get('X-Api-Status-Code') ?? null;
    const message = response.headers?.get('X-Api-Message') ?? null;
    const logId = response.headers?.get('X-Tt-Logid') ?? null;

    if (!response.ok) {
      throw new Error(`volcengine_asr.http_${response.status}:${raw.slice(0, 240)}`);
    }
    if (statusCode && statusCode !== '20000000') {
      throw new Error(`volcengine_asr.status_${statusCode}:${message ?? raw.slice(0, 240)}`);
    }

    let payload: VolcengineAsrResponse;
    try {
      payload = JSON.parse(raw) as VolcengineAsrResponse;
    } catch (error) {
      throw new Error(
        `volcengine_asr.invalid_response:${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const text = asString(payload.result?.text);
    if (!text) {
      throw new Error('volcengine_asr.empty_text');
    }
    const durationMs = asNumber(payload.audio_info?.duration);
    return {
      provider: `volcengine:${this.settings.resourceId}`,
      requestId,
      logId,
      durationMs,
      text,
      ...coerceSegments(payload, durationMs, text),
      languageDetected: firstLanguageHint(input.languageHints) ? [firstLanguageHint(input.languageHints) as string] : [],
    };
  }

  private authHeaders(requestId: string): Record<string, string> {
    const common = {
      'X-Api-Resource-Id': this.settings.resourceId,
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
    };
    if (this.credentials.apiKey) {
      return {
        ...common,
        'X-Api-Key': this.credentials.apiKey,
      };
    }
    if (this.credentials.appKey && this.credentials.accessKey) {
      return {
        ...common,
        'X-Api-App-Key': this.credentials.appKey,
        'X-Api-Access-Key': this.credentials.accessKey,
      };
    }
    throw new Error('volcengine_asr.credentials_missing');
  }
}

function coerceSegments(
  payload: VolcengineAsrResponse,
  durationMs: number | null,
  fallbackText: string,
): { segments: TranscriptSegment[]; hasSpeakerInfo: boolean } {
  const utterances = Array.isArray(payload.result?.utterances)
    ? payload.result.utterances
    : [];
  const speakerIds = new Map<string, string>();
  let hasSpeakerInfo = false;
  const segments = utterances
    .slice(0, 500)
    .map((item, index): TranscriptSegment | null => {
      const record = asRecord(item) as VolcengineUtterance;
      const text = asString(record.text);
      if (!text) return null;
      const speaker = speakerIdFor(rawSpeakerId(record), speakerIds);
      if (speaker !== 'S1' || rawSpeakerId(record) !== null) {
        hasSpeakerInfo = true;
      }
      const start = Math.max(0, asNumber(record.start_time) ?? 0);
      const end = Math.max(start, asNumber(record.end_time) ?? start);
      const words = coerceWords(record.words, end);
      return {
        id: index,
        speaker,
        start_ms: start,
        end_ms: end,
        text,
        words: words.length > 0 ? words : undefined,
      };
    })
    .filter((segment): segment is TranscriptSegment => segment !== null);
  if (segments.length > 0) return { segments, hasSpeakerInfo };
  return {
    segments: [{
      id: 0,
      speaker: 'S1',
      start_ms: 0,
      end_ms: durationMs ?? 0,
      text: fallbackText,
    }],
    hasSpeakerInfo: false,
  };
}

function coerceWords(value: unknown, segmentEndMs: number): TranscriptWord[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2000)
    .map((item): TranscriptWord | null => {
      const record = asRecord(item) as VolcengineWord;
      const text = asString(record.text);
      if (!text) return null;
      const start = Math.max(0, asNumber(record.start_time) ?? 0);
      const end = Math.max(start, asNumber(record.end_time) ?? segmentEndMs);
      const confidence = asNumber(record.confidence);
      return {
        text,
        start_ms: start,
        end_ms: end,
        confidence: confidence ?? undefined,
      };
    })
    .filter((word): word is TranscriptWord => word !== null);
}

function firstLanguageHint(languageHints: readonly string[] | undefined): string | null {
  return languageHints?.find((hint) => hint && hint !== 'auto') ?? null;
}

function rawSpeakerId(utterance: VolcengineUtterance): string | null {
  const additions = asRecord(utterance.additions);
  const candidate = asString(additions.speaker) || asString(utterance.speaker);
  return candidate || null;
}

function speakerIdFor(raw: string | null, seen: Map<string, string>): string {
  if (!raw) return 'S1';
  const existing = seen.get(raw);
  if (existing) return existing;
  const next = `S${seen.size + 1}`;
  seen.set(raw, next);
  return next;
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
