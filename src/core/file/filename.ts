export function sanitizeAttachmentFilename(value: string, fallback: string): string {
  const source = value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split(/[\\/]/)
    .pop() ?? '';
  const fallbackName = normalizeFallback(fallback);
  const extension = extensionFromName(source) ?? extensionFromName(fallbackName);
  const cleaned = source
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleaned || cleaned.startsWith('.')) {
    const fallbackBase = baseName(fallbackName) || 'file';
    return extension ? `${fallbackBase}.${extension}` : fallbackBase;
  }
  if (cleaned.includes('.')) return cleaned;
  return extension ? `${cleaned}.${extension}` : `${cleaned}.bin`;
}

function normalizeFallback(fallback: string): string {
  const cleaned = fallback
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned && !cleaned.startsWith('.') ? cleaned : 'file.bin';
}

function baseName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}

function extensionFromName(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || null;
}
