import type { FileSystemAdapter } from '../../utils/fs';
import { joinPath } from '../../utils/fs';

const CAPTURES_PREFIX = 'captures/';

export function storedCaptureLocalPath(captureId: string): string {
  return `${CAPTURES_PREFIX}${captureId}`;
}

export function resolveCaptureLocalPath(
  fs: FileSystemAdapter,
  storedPath: string,
  captureId?: string,
): string {
  const normalized = trimTrailingSlash(storedPath.trim());
  if (captureId) {
    return joinPath(fs.documentDirectory, storedCaptureLocalPath(captureId));
  }
  if (normalized.startsWith(CAPTURES_PREFIX)) {
    return joinPath(fs.documentDirectory, normalized);
  }
  const inferredId = captureIdFromLocalPath(normalized);
  if (inferredId) {
    return joinPath(fs.documentDirectory, storedCaptureLocalPath(inferredId));
  }
  return normalized;
}

export function captureIdFromLocalPath(path: string): string | null {
  const normalized = trimTrailingSlash(path.trim());
  const marker = '/captures/';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const afterMarker = normalized.slice(markerIndex + marker.length);
    return firstPathPart(afterMarker);
  }
  if (normalized.startsWith(CAPTURES_PREFIX)) {
    return firstPathPart(normalized.slice(CAPTURES_PREFIX.length));
  }
  return null;
}

function firstPathPart(value: string): string | null {
  const [part] = value.split('/');
  return part && !part.startsWith('.') ? part : null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}
