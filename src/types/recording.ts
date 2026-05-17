/**
 * types/recording.ts — 长录音 / 双线转写 / 派生笔记的领域类型
 *
 * 设计来源：docs/plans/2026-05-13-long-recording-and-transcript.md
 *
 * 这一层只描述"领域形状"，持久化由 recordings 表 + capture 附件文件承载。
 */

export type RecordingPartialState = 'idle' | 'live' | 'finished' | 'failed';
export type RecordingFinalState =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'offline_queued';

export interface RecordingSpeaker {
  id: string;            // 'S1', 'S2', ...
  label: string;         // 'Carlin'
  color: string;         // 用于 UI 区分
}

export interface TranscriptWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
}

export interface TranscriptSegment {
  id: number;
  speaker: string;       // 对应 RecordingSpeaker.id
  start_ms: number;
  end_ms: number;
  text: string;
  confidence?: number;
  words?: TranscriptWord[];
  is_partial?: boolean;  // partial 流里临时段会带这个
}

export type TranscriptCorrectionStatus = 'pending' | 'accepted' | 'dismissed';

export interface TranscriptCorrection {
  id: string;
  segment_id: number;
  start_ms: number;
  end_ms: number;
  original_text: string;
  corrected_text: string;
  reason: string;
  confidence?: number;
  hotword?: string;
  status: TranscriptCorrectionStatus;
  created_at: string;
  accepted_at?: string;
}

export interface FinalTranscript {
  schema: 'orbit.transcript@1';
  language_detected: string[];          // ['zh-CN','en-US']
  speakers: RecordingSpeaker[];
  segments: TranscriptSegment[];
}

export interface OutlineItem {
  id: string;
  title: string;
  start_ms: number;
}

export interface DerivativeAnchor {
  start_ms: number;
  end_ms: number;
}

export interface DerivativeItem {
  id: string;
  title: string;
  body: string;
  anchors?: DerivativeAnchor[];
  speakers?: string[];
  done?: boolean;        // 仅 todos
  owner?: string;        // 仅 todos
}

export type DerivativeKind =
  | 'summary'
  | 'decisions'
  | 'risks'
  | 'todos'
  | 'outline'
  | 'custom';

export interface DerivativePayload {
  schema: 'orbit.derivative@1';
  kind: DerivativeKind;
  generated_at: string;
  provider: string;
  template_id?: string;
  title?: string;
  body?: string;          // markdown — summary 用
  items?: DerivativeItem[];
}

export interface RecordingTemplate {
  id: string;
  name: string;
  author: string;
  description: string;
  uses: number;            // 内置模板使用量；本地模板默认为 0
  accent: string;          // 卡片配色
}

export interface RecordingMeta {
  id: string;
  title: string;
  /** 录制开始的 ISO 时间 */
  started_at: string;
  /** 总时长（毫秒） */
  duration_ms: number;
  language_hints: string[];
  speakers: RecordingSpeaker[];
  partial_state: RecordingPartialState;
  final_state: RecordingFinalState;
  partial_provider: string;
  final_provider: string;
  participants?: string[];
  location?: string;
  tags?: string[];
  waveform_samples?: number[];
}

export type DerivativeMap = {
  summary?: DerivativePayload;
  decisions?: DerivativePayload;
  risks?: DerivativePayload;
  todos?: DerivativePayload;
  outline?: DerivativePayload;
  custom?: DerivativePayload[];
};

export interface RecordingDetail {
  meta: RecordingMeta;
  audio_uri?: string;
  audio_exists?: boolean;
  waveform_samples: number[];
  outline: OutlineItem[];
  transcript: FinalTranscript;
  derivatives: DerivativeMap;
}
