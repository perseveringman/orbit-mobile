const SILENCE_BREAK_MS = 3500;
const SOFT_MAX_CHARS = 60;
const MIN_SPLIT_CHARS = 24;

export interface LiveTranscriptSegment {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  is_final: boolean;
}

export interface LiveTranscriptSegmentationState {
  previousTranscript: string;
  lastChangedAtMs: number;
  forcedBreaks: number[];
  segments: LiveTranscriptSegment[];
}

export interface LiveTranscriptUpdate {
  transcript: string;
  elapsedMs: number;
  isFinal?: boolean;
}

export function createLiveTranscriptSegmentationState(): LiveTranscriptSegmentationState {
  return {
    previousTranscript: '',
    lastChangedAtMs: 0,
    forcedBreaks: [],
    segments: [],
  };
}

export function updateLiveTranscriptSegments(
  state: LiveTranscriptSegmentationState,
  update: LiveTranscriptUpdate,
): LiveTranscriptSegment[] {
  const transcript = normalizeLiveTranscript(update.transcript);
  const elapsedMs = Math.max(0, update.elapsedMs);
  if (!transcript) {
    state.previousTranscript = '';
    state.lastChangedAtMs = elapsedMs;
    state.forcedBreaks = [];
    state.segments = [];
    return [];
  }

  const changed = transcript !== state.previousTranscript;
  if (changed && state.previousTranscript.length > 0 && transcript.startsWith(state.previousTranscript)) {
    const gapMs = elapsedMs - state.lastChangedAtMs;
    if (gapMs >= SILENCE_BREAK_MS) {
      addForcedBreak(state, state.previousTranscript.length);
    }
  }

  if (changed) {
    state.previousTranscript = transcript;
    state.lastChangedAtMs = elapsedMs;
  }

  state.forcedBreaks = state.forcedBreaks.filter((index) => index > 0 && index < transcript.length);
  const chunks = splitTranscriptIntoChunks(transcript, state.forcedBreaks);
  state.segments = assignSegmentTiming(state.segments, chunks, elapsedMs, update.isFinal === true);
  return state.segments;
}

export function splitTranscriptIntoChunks(text: string, forcedBreaks: number[] = []): string[] {
  const normalized = normalizeLiveTranscript(text);
  if (!normalized) return [];

  const sortedBreaks = [...new Set(forcedBreaks)]
    .filter((index) => index > 0 && index < normalized.length)
    .sort((a, b) => a - b);
  const slices: string[] = [];
  let start = 0;
  for (const boundary of sortedBreaks) {
    slices.push(normalized.slice(start, boundary));
    start = boundary;
  }
  slices.push(normalized.slice(start));

  return slices.flatMap((slice) => balanceShortChunks(splitSliceIntoChunks(slice)));
}

function addForcedBreak(state: LiveTranscriptSegmentationState, index: number): void {
  const duplicate = state.forcedBreaks.some((existing) => Math.abs(existing - index) <= 3);
  if (!duplicate) state.forcedBreaks.push(index);
}

function splitSliceIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let buffer = '';
  for (const char of text.trim()) {
    buffer += char;
    if (isTerminalPunctuation(char) || buffer.length >= SOFT_MAX_CHARS) {
      chunks.push(...splitLongChunk(buffer));
      buffer = '';
    }
  }
  if (buffer.trim()) {
    chunks.push(...splitLongChunk(buffer));
  }
  return chunks;
}

function splitLongChunk(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > SOFT_MAX_CHARS) {
    const cut = bestCutIndex(rest);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function bestCutIndex(text: string): number {
  const max = Math.min(SOFT_MAX_CHARS, text.length - 1);
  for (let i = max; i >= MIN_SPLIT_CHARS; i -= 1) {
    if (isSoftBoundary(text[i] ?? '')) return i + 1;
  }
  return max;
}

function balanceShortChunks(chunks: string[]): string[] {
  const out: string[] = [];
  for (const chunk of chunks.map((item) => item.trim()).filter(Boolean)) {
    const prev = out[out.length - 1];
    if (
      prev
      && chunk.length < MIN_SPLIT_CHARS
      && !isTerminalPunctuation(prev[prev.length - 1] ?? '')
      && prev.length + chunk.length <= SOFT_MAX_CHARS
    ) {
      out[out.length - 1] = joinTranscriptText(prev, chunk);
    } else {
      out.push(chunk);
    }
  }
  return out;
}

function assignSegmentTiming(
  previous: LiveTranscriptSegment[],
  chunks: string[],
  elapsedMs: number,
  finalizeAll: boolean,
): LiveTranscriptSegment[] {
  if (chunks.length === 0) return [];
  const segments: LiveTranscriptSegment[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const text = chunks[index] ?? '';
    const prev = isRelatedText(previous[index]?.text, text) ? previous[index] : undefined;
    const fallbackStart = index === 0 ? 0 : (segments[index - 1]?.end_ms ?? 0);
    const startMs = index === 0
      ? 0
      : Math.max(fallbackStart, Math.min(prev?.start_ms ?? fallbackStart, elapsedMs));
    const proportionalEnd = Math.round(((index + 1) / chunks.length) * elapsedMs);
    const previousEnd = prev?.end_ms ?? 0;
    const rawEnd = index === chunks.length - 1
      ? elapsedMs
      : Math.max(proportionalEnd, previousEnd, startMs + 500);
    const endMs = Math.max(startMs, Math.min(elapsedMs, rawEnd));
    segments.push({
      id: index,
      start_ms: startMs,
      end_ms: endMs,
      text,
      is_final: finalizeAll || index < chunks.length - 1 || isCompleteChunk(text),
    });
  }
  return segments;
}

function isRelatedText(previous: string | undefined, next: string): boolean {
  if (!previous) return false;
  const a = normalizeLiveTranscript(previous);
  const b = normalizeLiveTranscript(next);
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a) || a.slice(0, 12) === b.slice(0, 12);
}

function isCompleteChunk(text: string): boolean {
  return isTerminalPunctuation(text.trim().at(-1) ?? '') || text.length >= SOFT_MAX_CHARS;
}

function isTerminalPunctuation(char: string): boolean {
  return /[。！？!?]/.test(char);
}

function isSoftBoundary(char: string): boolean {
  return /[，,、；;：:\s]/.test(char) || isTerminalPunctuation(char);
}

function joinTranscriptText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (/[\s，,、；;：:。！？!?]$/.test(left) || /^[，,、；;：:。！？!?]/.test(right)) {
    return `${left}${right}`;
  }
  return `${left} ${right}`;
}

function normalizeLiveTranscript(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
