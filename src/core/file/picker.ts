import * as DocumentPicker from 'expo-document-picker';

import { sanitizeAttachmentFilename } from './filename';

export interface PickedFile {
  uri: string;
  filename: string;
  displayName: string;
  mime: string;
  byteSize?: number;
}

export async function pickFiles(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
    type: '*/*',
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => {
    const displayName = asset.name?.trim() || `attachment-${index + 1}`;
    return {
      uri: asset.uri,
      filename: sanitizeAttachmentFilename(displayName, `file-${index + 1}.bin`),
      displayName,
      mime: asset.mimeType || 'application/octet-stream',
      byteSize: asset.size,
    };
  });
}

export async function pickAudioFiles(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['audio/*', 'video/mp4', 'video/quicktime', 'application/ogg'],
  });
  if (result.canceled) return [];
  return result.assets
    .map((asset, index) => {
      const displayName = asset.name?.trim() || `audio-${index + 1}`;
      return {
        uri: asset.uri,
        filename: sanitizeAttachmentFilename(displayName, `audio-${index + 1}.mp3`),
        displayName,
        mime: asset.mimeType || mimeFromFilename(displayName),
        byteSize: asset.size,
      };
    })
    .filter((file) => isLikelyAudioFile(file));
}

export { sanitizeAttachmentFilename };

function isLikelyAudioFile(file: PickedFile): boolean {
  if (file.mime.startsWith('audio/')) return true;
  const ext = extensionFromFilename(file.filename);
  return ['aac', 'aif', 'aiff', 'flac', 'm4a', 'mp3', 'mp4', 'oga', 'ogg', 'opus', 'wav'].includes(ext);
}

function mimeFromFilename(filename: string): string {
  switch (extensionFromFilename(filename)) {
    case 'aac':
      return 'audio/aac';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'ogg':
    case 'oga':
    case 'opus':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/mpeg';
  }
}

function extensionFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}
