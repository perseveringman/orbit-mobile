const SILENCE_BREAK_MS = 3500;
const SOFT_MAX_CHARS = 60;
const MIN_SPLIT_CHARS = 24;

export interface LiveTranscriptSegment {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  is_final: boolean;
  words?: LiveTranscriptWord[];
}

export interface LiveTranscriptWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
}

export interface LiveTranscriptForcedBreak {
  index: number;
  previousEndMs: number;
  nextStartMs: number;
}

export interface LiveTranscriptSegmentationState {
  previousTranscript: string;
  lastChangedAtMs: number;
  forcedBreaks: LiveTranscriptForcedBreak[];
  segments: LiveTranscriptSegment[];
}

export interface LiveTranscriptUpdate {
  transcript: string;
  elapsedMs: number;
  isFinal?: boolean;
  speechSegments?: LiveTranscriptSpeechSegment[];
}

export interface LiveTranscriptSpeechSegment {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
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
      addForcedBreak(state, state.previousTranscript.length, state.lastChangedAtMs, elapsedMs);
    }
  }

  if (changed) {
    state.previousTranscript = transcript;
    state.lastChangedAtMs = elapsedMs;
  }

  state.forcedBreaks = state.forcedBreaks.filter((breakpoint) => (
    breakpoint.index > 0 && breakpoint.index < transcript.length
  ));
  const chunks = applySpeechSegmentTiming(
    splitTranscriptIntoTimedChunks(transcript, state.forcedBreaks),
    update.speechSegments,
    elapsedMs,
  );
  state.segments = assignSegmentTiming(state.segments, chunks, elapsedMs, update.isFinal === true);
  return state.segments;
}

export type ForcedBreakInput = number | LiveTranscriptForcedBreak;

interface TranscriptChunk {
  text: string;
  forcedStartMs?: number;
  forcedEndMs?: number;
  speechStartMs?: number;
  speechEndMs?: number;
  words?: LiveTranscriptWord[];
}

interface TranscriptSlice {
  text: string;
  breakBefore?: LiveTranscriptForcedBreak;
  breakAfter?: LiveTranscriptForcedBreak;
}

export function splitTranscriptIntoChunks(text: string, forcedBreaks: ForcedBreakInput[] = []): string[] {
  return splitTranscriptIntoTimedChunks(text, forcedBreaks).map((chunk) => chunk.text);
}

function splitTranscriptIntoTimedChunks(
  text: string,
  forcedBreaks: ForcedBreakInput[] = [],
): TranscriptChunk[] {
  const normalized = normalizeLiveTranscript(text);
  if (!normalized) return [];

  const sortedBreaks = normalizeForcedBreaks(forcedBreaks, normalized.length);
  const slices: TranscriptSlice[] = [];
  let start = 0;
  let breakBefore: LiveTranscriptForcedBreak | undefined;
  for (const boundary of sortedBreaks) {
    slices.push({
      text: normalized.slice(start, boundary.index),
      breakBefore,
      breakAfter: boundary,
    });
    start = boundary.index;
    breakBefore = boundary;
  }
  slices.push({ text: normalized.slice(start), breakBefore });

  return slices.flatMap((slice) => {
    const chunks = balanceShortChunks(splitSliceIntoChunks(slice.text));
    return chunks.map((chunk, index) => ({
      text: chunk,
      forcedStartMs: index === 0 ? slice.breakBefore?.nextStartMs : undefined,
      forcedEndMs: index === chunks.length - 1 ? slice.breakAfter?.previousEndMs : undefined,
    }));
  });
}

function applySpeechSegmentTiming(
  chunks: TranscriptChunk[],
  speechSegments: LiveTranscriptSpeechSegment[] | undefined,
  elapsedMs: number,
): TranscriptChunk[] {
  const words = sanitizeSpeechSegments(speechSegments, elapsedMs);
  if (words.length === 0 || chunks.length === 0) return chunks;

  let cursor = 0;
  return chunks.map((chunk) => {
    const target = compactForAlignment(chunk.text);
    if (!target) return chunk;

    const matched: LiveTranscriptWord[] = [];
    let matchedText = '';
    let fullyMatched = false;
    const startCursor = cursor;
    let nextCursor = cursor;
    while (nextCursor < words.length) {
      const word = words[nextCursor];
      if (!word) break;
      const wordText = compactForAlignment(word.text);
      nextCursor += 1;
      if (!wordText) {
        cursor = nextCursor;
        continue;
      }

      const nextText = `${matchedText}${wordText}`;
      if (target.startsWith(nextText)) {
        matched.push(word);
        matchedText = nextText;
        cursor = nextCursor;
        if (matchedText.length >= target.length) {
          fullyMatched = true;
          break;
        }
        continue;
      }

      if (nextText.startsWith(target)) {
        matched.push(word);
        cursor = nextCursor;
        fullyMatched = true;
        break;
      }

      break;
    }

    const first = matched[0];
    const last = matched[matched.length - 1];
    if (!fullyMatched || !first || !last) {
      cursor = startCursor;
      return chunk;
    }

    return {
      ...chunk,
      speechStartMs: first.start_ms,
      speechEndMs: last.end_ms,
      words: matched,
    };
  });
}

function sanitizeSpeechSegments(
  speechSegments: LiveTranscriptSpeechSegment[] | undefined,
  elapsedMs: number,
): LiveTranscriptWord[] {
  return (speechSegments ?? [])
    .map((segment): LiveTranscriptWord | null => {
      const text = normalizeLiveTranscript(segment.text);
      const startMs = finiteMs(segment.start_ms);
      const endMs = finiteMs(segment.end_ms);
      if (!text || startMs === null || endMs === null) return null;
      const word: LiveTranscriptWord = {
        text,
        start_ms: Math.min(startMs, elapsedMs),
        end_ms: Math.min(Math.max(startMs, endMs), elapsedMs),
      };
      if (typeof segment.confidence === 'number') {
        word.confidence = segment.confidence;
      }
      return word;
    })
    .filter((segment): segment is LiveTranscriptWord => segment !== null)
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
}

function normalizeForcedBreaks(
  forcedBreaks: ForcedBreakInput[],
  textLength: number,
): LiveTranscriptForcedBreak[] {
  const sorted = forcedBreaks
    .map((breakpoint) => (
      typeof breakpoint === 'number'
        ? {
            index: breakpoint,
            previousEndMs: Number.NaN,
            nextStartMs: Number.NaN,
          }
        : breakpoint
    ))
    .filter((breakpoint) => breakpoint.index > 0 && breakpoint.index < textLength)
    .sort((a, b) => a.index - b.index);

  const out: LiveTranscriptForcedBreak[] = [];
  for (const breakpoint of sorted) {
    const duplicate = out.some((existing) => Math.abs(existing.index - breakpoint.index) <= 3);
    if (!duplicate) out.push(breakpoint);
  }
  return out;
}

function addForcedBreak(
  state: LiveTranscriptSegmentationState,
  index: number,
  previousEndMs: number,
  nextStartMs: number,
): void {
  const duplicate = state.forcedBreaks.some((existing) => Math.abs(existing.index - index) <= 3);
  if (!duplicate) {
    state.forcedBreaks.push({
      index,
      previousEndMs: Math.max(0, previousEndMs),
      nextStartMs: Math.max(0, nextStartMs),
    });
  }
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
  chunks: TranscriptChunk[],
  elapsedMs: number,
  finalizeAll: boolean,
): LiveTranscriptSegment[] {
  if (chunks.length === 0) return [];
  const segments: LiveTranscriptSegment[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) continue;
    const text = chunk.text;
    const prev = isRelatedText(previous[index]?.text, text) ? previous[index] : undefined;
    const fallbackStart = index === 0 ? 0 : (segments[index - 1]?.end_ms ?? 0);
    const anchoredStart = finiteMs(chunk.speechStartMs) ?? finiteMs(chunk.forcedStartMs);
    const startMs = anchoredStart === null
      ? (
          index === 0
            ? 0
            : Math.max(fallbackStart, Math.min(prev?.start_ms ?? fallbackStart, elapsedMs))
        )
      : Math.max(fallbackStart, Math.min(anchoredStart, elapsedMs));
    const proportionalEnd = Math.round(((index + 1) / chunks.length) * elapsedMs);
    const previousEnd = prev?.end_ms ?? 0;
    const rawEnd = index === chunks.length - 1
      ? elapsedMs
      : Math.max(proportionalEnd, previousEnd, startMs + 500);
    const anchoredEnd = finiteMs(chunk.speechEndMs) ?? finiteMs(chunk.forcedEndMs);
    const cappedEnd = anchoredEnd === null ? rawEnd : anchoredEnd;
    const endMs = Math.max(startMs, Math.min(elapsedMs, cappedEnd));
    segments.push({
      id: index,
      start_ms: startMs,
      end_ms: endMs,
      text,
      is_final: finalizeAll || index < chunks.length - 1 || isCompleteChunk(text),
      words: chunk.words,
    });
  }
  return segments;
}

function finiteMs(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
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

function compactForAlignment(text: string): string {
  return normalizeLiveTranscript(text)
    .toLocaleLowerCase()
    .replace(/[\s，,、；;：:。！？!?.'"“”‘’（）()[\]【】]/g, '');
}
