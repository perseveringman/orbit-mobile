import * as ImagePicker from 'expo-image-picker';

import { compressImage } from '../media/compressor';

export interface PickedImage {
  uri: string;
  filename: string;
  mime: string;
  width?: number;
  height?: number;
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
  return result.assets.map((asset, index) => toPickedImage(asset, index));
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

function toPickedImage(asset: ImagePicker.ImagePickerAsset, index: number): PickedImage {
  const extension = extensionFromUri(asset.uri) ?? 'jpg';
  const compressed = compressImage(asset.uri, {
    width: asset.width,
    height: asset.height,
    filename: asset.fileName,
    mime: asset.mimeType,
  });
  return {
    uri: compressed.uri,
    filename: sanitizeFilename(asset.fileName) ?? compressed.filename ?? `photo-${index + 1}.${extension}`,
    mime: compressed.mime,
    width: compressed.width,
    height: compressed.height,
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
