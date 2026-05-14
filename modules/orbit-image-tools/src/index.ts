import { requireNativeModule } from 'expo-modules-core';

export interface ImageCompressionOptions {
  maxLongEdge?: number;
  quality?: number;
  filename?: string;
}

export interface ImageCompressionResult {
  uri: string;
  width: number;
  height: number;
  mime: string;
  byteSize: number;
}

export interface OrbitImageToolsModule {
  compressImage(uri: string, options: ImageCompressionOptions): Promise<ImageCompressionResult>;
}

let nativeModule: OrbitImageToolsModule | null | undefined;

function getNativeModule(): OrbitImageToolsModule | null {
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = requireNativeModule<OrbitImageToolsModule>('OrbitImageTools');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

const ImageTools: OrbitImageToolsModule = {
  async compressImage(uri, options) {
    const native = getNativeModule();
    if (!native) {
      throw new Error('image_tools.native_module_unavailable');
    }
    return native.compressImage(uri, options);
  },
};

export default ImageTools;
