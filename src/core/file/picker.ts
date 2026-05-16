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

export { sanitizeAttachmentFilename };
