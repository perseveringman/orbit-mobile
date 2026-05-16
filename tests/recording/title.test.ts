import { describe, expect, it } from 'vitest';

import {
  recordingTimestampTitle,
  sanitizeSemanticRecordingTitle,
} from '@/core/recording/title';

describe('recording title helpers', () => {
  it('formats timestamp titles with source and compact local timestamp', () => {
    const date = new Date(2026, 4, 16, 20, 31, 7);
    expect(recordingTimestampTitle(date, 'iphone')).toBe('iphone-20260516203107');
    expect(recordingTimestampTitle(date, 'x1')).toBe('录音卡-20260516203107');
  });

  it('keeps concise semantic titles and rejects generic placeholders', () => {
    expect(sanitizeSemanticRecordingTitle('《本地录音方案评审》')).toBe('本地录音方案评审');
    expect(sanitizeSemanticRecordingTitle('会议记录')).toBeNull();
    expect(sanitizeSemanticRecordingTitle('2026年05月16日 20时31分07秒')).toBeNull();
    expect(sanitizeSemanticRecordingTitle('iphone-20260516203107')).toBeNull();
    expect(sanitizeSemanticRecordingTitle('录音卡-20260516203107')).toBeNull();
  });
});
