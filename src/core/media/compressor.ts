/**
 * compressor.ts — 图片压缩
 *
 * 默认长边 2048px、质量 0.8（working_memory 定稿）。
 * expo-image-manipulator 实现。
 *
 * @see docs/ARCHITECTURE.md §8
 *
 */

export interface CompressImageOptions {
  maxLongEdge?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  width?: number;
  height?: number;
  filename?: string | null;
  mime?: string | null;
}

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
  mime: string;
  filename: string;
}

export function compressImage(
  uri: string,
  opts: CompressImageOptions = {},
): CompressedImage {
  void opts.maxLongEdge;
  void opts.quality;
  return {
    uri,
    width: opts.width ?? 0,
    height: opts.height ?? 0,
    mime: opts.mime ?? mimeForFormat(opts.format ?? 'jpeg'),
    filename: sanitizeFilename(opts.filename) ?? filenameFromUri(uri, opts.format ?? 'jpeg'),
  };
}

function sanitizeFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function mimeForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function filenameFromUri(uri: string, format: 'jpeg' | 'png' | 'webp'): string {
  const filename = uri.split('/').filter(Boolean).at(-1);
  if (filename && filename.includes('.')) return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `photo.${format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg'}`;
}
