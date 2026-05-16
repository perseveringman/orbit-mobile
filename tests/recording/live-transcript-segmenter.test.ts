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
});
