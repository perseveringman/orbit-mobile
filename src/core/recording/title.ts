export type RecordingTitleSource = 'iphone' | 'x1';

export function recordingTimestampTitle(
  date: Date = new Date(),
  source: RecordingTitleSource = 'iphone',
): string {
  const prefix = source === 'x1' ? '录音卡' : 'iphone';
  return `${prefix}-${compactTimestamp(date)}`;
}

export function sanitizeSemanticRecordingTitle(value: string): string | null {
  const normalized = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^["'“”‘’《》#\s]+|["'“”‘’《》\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length < 2) return null;
  if (/^\d{4}年\d{2}月\d{2}日 \d{2}时\d{2}分\d{2}秒$/.test(normalized)) return null;
  if (/^(iphone|录音卡)-\d{14}$/i.test(normalized)) return null;
  if (/^(录音|会议|会议记录|新会议|语音记录|未命名)$/.test(normalized)) return null;
  return normalized.slice(0, 36);
}

function compactTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('');
}
