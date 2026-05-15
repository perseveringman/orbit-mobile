import type {
  DerivativePayload,
  FinalTranscript,
  OutlineItem,
  RecordingDetail,
  RecordingTemplate,
  TranscriptSegment,
} from '../../types/recording';
import { isoNow } from '../../utils/time';
import type { DeepSeekClient, DeepSeekMessage } from './deepseek-client';

export interface AiRecordingNotes {
  outline: OutlineItem[];
  derivatives: {
    summary: DerivativePayload;
    decisions: DerivativePayload;
    risks: DerivativePayload;
    todos: DerivativePayload;
  };
}

interface AiNotesJson {
  summary_markdown?: unknown;
  outline?: unknown;
  decisions?: unknown;
  risks?: unknown;
  todos?: unknown;
}

interface AiItemJson {
  title?: unknown;
  body?: unknown;
  owner?: unknown;
  start_ms?: unknown;
  end_ms?: unknown;
}

export function hasUsableTranscript(detail: RecordingDetail): boolean {
  const text = transcriptText(detail.transcript);
  if (text.length === 0) return false;
  return !/暂无可用实时转写|暂无转写/.test(text);
}

export async function generateRecordingNotes(
  client: DeepSeekClient,
  detail: RecordingDetail,
): Promise<AiRecordingNotes> {
  const payload = await client.chatJson<AiNotesJson>(buildNotesMessages(detail));
  return coerceNotesPayload(payload, detail);
}

export async function generateCustomDerivative(
  client: DeepSeekClient,
  template: RecordingTemplate,
  detail: RecordingDetail,
): Promise<DerivativePayload> {
  const payload = await client.chatJson<{
    title?: unknown;
    body_markdown?: unknown;
    items?: unknown;
  }>(buildTemplateMessages(template, detail));
  const now = isoNow();
  return {
    schema: 'orbit.derivative@1',
    kind: 'custom',
    template_id: template.id,
    title: asString(payload.title) || template.name,
    generated_at: now,
    provider: 'deepseek-v4-flash',
    body: asString(payload.body_markdown) || `## ${template.name}\n${template.description}`,
    items: coerceItems(payload.items, detail.transcript.segments),
  };
}

export async function askRecordingQuestion(
  client: DeepSeekClient,
  detail: RecordingDetail,
  question: string,
): Promise<string> {
  return client.chatText([
    {
      role: 'system',
      content: [
        '你是 Orbit Mobile 的录音笔记助手。',
        '只根据用户给出的录音转写、时间戳和已生成笔记回答。',
        '如果上下文不足，明确说明不足，不要编造。',
        '回答要简洁、可执行，保留中文为主；用户要求英文邮件时可输出英文。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `录音标题：${detail.meta.title}`,
        `时长：${Math.round(detail.meta.duration_ms / 1000)} 秒`,
        '',
        '已生成笔记：',
        detail.derivatives.summary?.body ?? '暂无',
        '',
        '转写片段：',
        serializeTranscript(detail.transcript.segments, 18_000),
        '',
        `问题：${question}`,
      ].join('\n'),
    },
  ]);
}

function buildNotesMessages(detail: RecordingDetail): DeepSeekMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Orbit Mobile 的录音笔记结构化生成器。',
        '只根据转写文本生成，不要编造未出现的人名、时间或结论。',
        '输出必须是 JSON 对象，字段为 summary_markdown, outline, decisions, risks, todos。',
        'outline 数组项：{title,start_ms}。',
        'decisions/risks/todos 数组项：{title,body,start_ms,end_ms,owner?}。',
        'summary_markdown 使用 Markdown，包含“概述”和“关键片段”。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `标题：${detail.meta.title}`,
        `语言提示：${detail.meta.language_hints.join(', ') || 'auto'}`,
        '',
        '转写片段：',
        serializeTranscript(detail.transcript.segments, 20_000),
      ].join('\n'),
    },
  ];
}

function buildTemplateMessages(template: RecordingTemplate, detail: RecordingDetail): DeepSeekMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Orbit Mobile 的自定义录音笔记生成器。',
        '输出必须是 JSON 对象，字段为 title, body_markdown, items。',
        'items 数组项：{title,body,start_ms,end_ms,owner?}。',
        '只根据转写文本生成，不要编造。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `模板名称：${template.name}`,
        `模板说明：${template.description}`,
        `录音标题：${detail.meta.title}`,
        '',
        '转写片段：',
        serializeTranscript(detail.transcript.segments, 18_000),
      ].join('\n'),
    },
  ];
}

function coerceNotesPayload(payload: AiNotesJson, detail: RecordingDetail): AiRecordingNotes {
  const now = isoNow();
  const segments = detail.transcript.segments;
  const outline = coerceOutline(payload.outline, segments);
  return {
    outline,
    derivatives: {
      summary: {
        schema: 'orbit.derivative@1',
        kind: 'summary',
        generated_at: now,
        provider: 'deepseek-v4-flash',
        body: asString(payload.summary_markdown) || fallbackSummary(detail),
      },
      decisions: {
        schema: 'orbit.derivative@1',
        kind: 'decisions',
        generated_at: now,
        provider: 'deepseek-v4-flash',
        items: coerceItems(payload.decisions, segments),
      },
      risks: {
        schema: 'orbit.derivative@1',
        kind: 'risks',
        generated_at: now,
        provider: 'deepseek-v4-flash',
        items: coerceItems(payload.risks, segments),
      },
      todos: {
        schema: 'orbit.derivative@1',
        kind: 'todos',
        generated_at: now,
        provider: 'deepseek-v4-flash',
        items: coerceItems(payload.todos, segments).map((item) => ({ ...item, done: false })),
      },
    },
  };
}

function coerceOutline(value: unknown, segments: TranscriptSegment[]): OutlineItem[] {
  if (!Array.isArray(value)) {
    return segments.slice(0, 6).map((segment, index) => ({
      id: `outline-${index + 1}`,
      title: segment.text.slice(0, 32),
      start_ms: segment.start_ms,
    }));
  }
  return value.slice(0, 8).map((item, index) => {
    const record = asRecord(item);
    const fallback = segments[index] ?? segments[0];
    return {
      id: `outline-${index + 1}`,
      title: asString(record.title) || fallback?.text.slice(0, 32) || `片段 ${index + 1}`,
      start_ms: asNumber(record.start_ms) ?? fallback?.start_ms ?? 0,
    };
  });
}

function coerceItems(value: unknown, segments: TranscriptSegment[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item, index) => {
    const record = asRecord(item) as AiItemJson;
    const fallback = segments[index] ?? segments[0];
    const start = asNumber(record.start_ms) ?? fallback?.start_ms ?? 0;
    const end = asNumber(record.end_ms) ?? fallback?.end_ms ?? start;
    return {
      id: `ai-${index + 1}`,
      title: asString(record.title) || `条目 ${index + 1}`,
      body: asString(record.body) || asString(record.title) || '',
      owner: asString(record.owner) || undefined,
      anchors: [{ start_ms: start, end_ms: Math.max(start, end) }],
      speakers: fallback ? [fallback.speaker] : undefined,
    };
  }).filter((item) => item.body.trim().length > 0);
}

function serializeTranscript(segments: TranscriptSegment[], maxChars: number): string {
  const body = segments
    .map((segment) => `[${segment.start_ms}-${segment.end_ms}ms][${segment.speaker}] ${segment.text}`)
    .join('\n');
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars)}\n[已截断，保留前 ${maxChars} 字符]`;
}

function transcriptText(transcript: FinalTranscript): string {
  return transcript.segments.map((segment) => segment.text).join(' ').trim();
}

function fallbackSummary(detail: RecordingDetail): string {
  const text = transcriptText(detail.transcript);
  return ['## 概述', text.slice(0, 500), '', '## 关键片段'].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
