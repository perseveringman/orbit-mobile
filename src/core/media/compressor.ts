import ImageTools from 'orbit-image-tools';

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
  byteSize?: number;
  compressed: boolean;
}

export async function compressImage(
  uri: string,
  opts: CompressImageOptions = {},
): Promise<CompressedImage> {
  const filename = sanitizeFilename(opts.filename) ?? filenameFromUri(uri, opts.format ?? 'jpeg');
  try {
    const result = await ImageTools.compressImage(uri, {
      maxLongEdge: opts.maxLongEdge ?? 2048,
      quality: opts.quality ?? 0.82,
      filename: forceJpegFilename(filename),
    });
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      mime: result.mime,
      filename: forceJpegFilename(filename),
      byteSize: result.byteSize,
      compressed: result.uri !== uri,
    };
  } catch {
    // Preserve the original image if the native compressor is unavailable.
  }
  return {
    uri,
    width: opts.width ?? 0,
    height: opts.height ?? 0,
    mime: opts.mime ?? mimeForFormat(opts.format ?? 'jpeg'),
    filename,
    compressed: false,
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

function forceJpegFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${withoutExtension || 'photo'}.jpg`;
}
