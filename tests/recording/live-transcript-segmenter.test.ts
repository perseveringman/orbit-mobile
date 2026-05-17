import { describe, expect, it } from 'vitest';

import {
  createLiveTranscriptSegmentationState,
  splitTranscriptIntoChunks,
  updateLiveTranscriptSegments,
} from '@/core/recording/live-transcript-segmenter';

describe('live transcript segmenter', () => {
  it('splits live transcript snapshots by sentence punctuation', () => {
    expect(splitTranscriptIntoChunks('我们先做本地录音。然后测试 X1。最后看同步。')).toEqual([
      '我们先做本地录音。',
      '然后测试 X1。',
      '最后看同步。',
    ]);
  });

  it('splits long text without punctuation by readable length', () => {
    const chunks = splitTranscriptIntoChunks(
      '这一段没有明显标点但是它会持续增长直到超过一个合理长度所以需要被拆成多个可以阅读和定位的转写块否则录音详情里会只出现一整段很难使用',
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 96)).toBe(true);
  });

  it('inserts a break when speech resumes after a silence gap', () => {
    const state = createLiveTranscriptSegmentationState();
    updateLiveTranscriptSegments(state, {
      transcript: '第一段讨论本地优先',
      elapsedMs: 2000,
    });
    const segments = updateLiveTranscriptSegments(state, {
      transcript: '第一段讨论本地优先 第二段开始讨论 X1',
      elapsedMs: 7000,
    });

    expect(segments.map((segment) => segment.text)).toEqual([
      '第一段讨论本地优先',
      '第二段开始讨论 X1',
    ]);
    expect(segments[0]?.is_final).toBe(true);
  });

  it('keeps the silent gap out of adjacent segment timestamps', () => {
    const state = createLiveTranscriptSegmentationState();
    updateLiveTranscriptSegments(state, {
      transcript: '第一段讨论本地优先',
      elapsedMs: 7000,
    });
    updateLiveTranscriptSegments(state, {
      transcript: '第一段讨论本地优先 第二段开始',
      elapsedMs: 15000,
    });
    const segments = updateLiveTranscriptSegments(state, {
      transcript: '第一段讨论本地优先 第二段开始讨论 X1',
      elapsedMs: 18000,
    });

    expect(segments[0]).toMatchObject({
      start_ms: 0,
      end_ms: 7000,
      text: '第一段讨论本地优先',
    });
    expect(segments[1]).toMatchObject({
      start_ms: 15000,
      end_ms: 18000,
      text: '第二段开始讨论 X1',
    });
  });

  it('uses Apple Speech segment timestamps when available', () => {
    const state = createLiveTranscriptSegmentationState();
    const segments = updateLiveTranscriptSegments(state, {
      transcript: '第一段讨论本地优先。第二段开始讨论 X1。',
      elapsedMs: 18000,
      speechSegments: [
        { text: '第一段讨论本地优先', start_ms: 0, end_ms: 7000, confidence: 0.91 },
        { text: '第二段开始讨论 X1', start_ms: 15000, end_ms: 18000, confidence: 0.86 },
      ],
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      start_ms: 0,
      end_ms: 7000,
      text: '第一段讨论本地优先。',
      words: [{ text: '第一段讨论本地优先', start_ms: 0, end_ms: 7000, confidence: 0.91 }],
    });
    expect(segments[1]).toMatchObject({
      start_ms: 15000,
      end_ms: 18000,
      text: '第二段开始讨论 X1。',
      words: [{ text: '第二段开始讨论 X1', start_ms: 15000, end_ms: 18000, confidence: 0.86 }],
    });
  });

  it('falls back when native speech segments do not fully align with a chunk', () => {
    const state = createLiveTranscriptSegmentationState();
    const segments = updateLiveTranscriptSegments(state, {
      transcript: 'hello world.',
      elapsedMs: 10000,
      speechSegments: [
        { text: 'hello', start_ms: 1000, end_ms: 2000 },
        { text: 'oops', start_ms: 5000, end_ms: 6000 },
      ],
    });

    expect(segments[0]).toMatchObject({
      start_ms: 0,
      end_ms: 10000,
      text: 'hello world.',
    });
    expect(segments[0]?.words).toBeUndefined();
  });
});
