import type { CaptureManifest, ManifestAttachment } from '../../core/capture/types';
import type { CaptureRow } from '../../types/capture';
import { expoFileSystem, joinPath, type FileSystemAdapter } from '../../utils/fs';

export interface CaptureDisplayAttachment extends ManifestAttachment {
  uri: string;
  durationLabel: string | null;
  sizeLabel: string;
}

export interface CaptureDisplayModel {
  id: string;
  icon: string;
  kindLabel: string;
  title: string;
  body: string;
  capturedAtLabel: string;
  attachments: CaptureDisplayAttachment[];
  images: CaptureDisplayAttachment[];
  audio: CaptureDisplayAttachment[];
  manifestMissing: boolean;
}

export async function loadCaptureDisplay(
  row: CaptureRow,
  fs: FileSystemAdapter = expoFileSystem,
): Promise<CaptureDisplayModel> {
  try {
    const manifestJson = await fs.readString(joinPath(row.local_path, 'manifest.json'));
    return buildCaptureDisplay(row, JSON.parse(manifestJson) as CaptureManifest);
  } catch {
    return buildCaptureDisplay(row, null);
  }
}

export function buildCaptureDisplay(
  row: CaptureRow,
  manifest: CaptureManifest | null,
): CaptureDisplayModel {
  const content = (manifest?.content ?? row.content_preview ?? '').trim();
  const attachments = (manifest?.attachments ?? []).map<CaptureDisplayAttachment>((attachment) => ({
    ...attachment,
    uri: fileUri(joinPath(row.local_path, attachment.filename)),
    durationLabel: formatDuration(attachment.duration_ms),
    sizeLabel: formatBytes(attachment.byte_size),
  }));
  const images = attachments.filter((attachment) => attachment.type === 'image');
  const audio = attachments.filter((attachment) => attachment.type === 'audio');
  const mediaTitle = mediaSummary(row, images.length, audio.length, attachments.length);

  return {
    id: row.id,
    icon: captureIcon(row, images.length, audio.length),
    kindLabel: captureKindLabel(row, images.length, audio.length),
    title: firstLine(content) || mediaTitle,
    body: content.length > 0 ? content : mediaTitle,
    capturedAtLabel: formatCapturedAt(row.captured_at_local),
    attachments,
    images,
    audio,
    manifestMissing: manifest === null,
  };
}

function captureIcon(row: CaptureRow, imageCount: number, audioCount: number): string {
  if (imageCount > 0 && audioCount > 0) return '◎';
  if (imageCount > 0 || row.has_image) return '▧';
  if (audioCount > 0 || row.has_audio) return '◉';
  if (row.kind === 'share') return '↗';
  return '✎';
}

function captureKindLabel(row: CaptureRow, imageCount: number, audioCount: number): string {
  if (imageCount > 0 && audioCount > 0) return '混合';
  if (imageCount > 0 || row.has_image) return '图片';
  if (audioCount > 0 || row.has_audio) return '语音';
  if (row.kind === 'share') return '分享';
  return '文字';
}

function mediaSummary(
  row: CaptureRow,
  imageCount: number,
  audioCount: number,
  attachmentCount: number,
): string {
  const imageTotal = imageCount || row.has_image ? imageCount || row.attachment_count || 1 : 0;
  const audioTotal = audioCount || row.has_audio ? audioCount || 1 : 0;
  if (imageTotal > 0 && audioTotal > 0) return `${imageTotal} 张图片 · ${audioTotal} 段语音`;
  if (imageTotal > 0) return `${imageTotal} 张图片`;
  if (audioTotal > 0) return `${audioTotal} 段语音`;
  if (attachmentCount > 0 || row.attachment_count > 0) return `${attachmentCount || row.attachment_count} 个附件`;
  return '空白 Capture';
}

function firstLine(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.slice(0, 120) ?? '';
}

function fileUri(path: string): string {
  if (/^(file|content|data|https?):\/\//.test(path)) return path;
  return `file://${path}`;
}

function formatCapturedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-Hans-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
