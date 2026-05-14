import * as ImagePicker from 'expo-image-picker';

import { compressImage } from '../media/compressor';

export interface PickedImage {
  uri: string;
  filename: string;
  mime: string;
  width?: number;
  height?: number;
  byteSize?: number;
  compressed: boolean;
  originalUri: string;
  originalFilename: string;
  originalMime: string;
}

export async function pickImages(): Promise<PickedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('image.permission_denied');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.82,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.map((asset, index) => toPickedImage(asset, index)));
}

export async function takePhoto(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('camera.permission_denied');
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.82,
  });
  if (result.canceled) return null;
  const [asset] = result.assets;
  if (!asset) return null;
  return toPickedImage(asset, 0);
}

async function toPickedImage(asset: ImagePicker.ImagePickerAsset, index: number): Promise<PickedImage> {
  const extension = extensionFromUri(asset.uri) ?? 'jpg';
  const compressed = await compressImage(asset.uri, {
    width: asset.width,
    height: asset.height,
    filename: `photo-${index + 1}.jpg`,
    mime: asset.mimeType,
  });
  return {
    uri: compressed.uri,
    filename: compressed.filename,
    mime: compressed.mime,
    width: compressed.width,
    height: compressed.height,
    byteSize: compressed.byteSize,
    compressed: compressed.compressed,
    originalUri: asset.uri,
    originalFilename: sanitizeFilename(asset.fileName) ?? `original-photo-${index + 1}.${extension}`,
    originalMime: asset.mimeType ?? mimeFromExtension(extension),
  };
}

function sanitizeFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function extensionFromUri(uri: string): string | null {
  const match = /\.([a-zA-Z0-9]+)(?:\?|#|$)/.exec(uri);
  return match?.[1]?.toLowerCase() ?? null;
}

function mimeFromExtension(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}
