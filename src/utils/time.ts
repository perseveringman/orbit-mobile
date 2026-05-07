/**
 * time.ts — 时间工具
 *
 * isoNow / isoLocal（带时区） / parseIso / formatRelative
 *
 * 排序统一用 UTC ISO 字符串（字典序 = 时间序）；
 * 展示用 captured_at_local（带时区）。
 *
 * @see docs/DATA-MODEL.md §1.1
 *
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function isoNow(date = new Date()): string {
  return date.toISOString();
}

export function isoLocal(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffset / 60);
  const offsetRemainderMinutes = absOffset % 60;

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
    '.',
    String(date.getMilliseconds()).padStart(3, '0'),
    sign,
    pad(offsetHours),
    ':',
    pad(offsetRemainderMinutes),
  ].join('');
}

export function parseIso(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`time.invalid_iso:${value}`);
  }
  return date;
}
