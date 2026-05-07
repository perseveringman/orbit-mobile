import { requireNativeModule } from 'expo-modules-core';

export interface ICloudContainerStatus {
  available: boolean;
  reason?: 'native_module_unavailable' | 'not_signed_in' | 'restricted' | 'unknown';
  rootPath?: string;
}

export interface ICloudUploadStatus {
  exists: boolean;
  uploaded: boolean;
  uploading: boolean;
  remotePath: string;
  localPath?: string;
  error?: string;
  reason?: string;
}

interface NativeICloudBridgeModule {
  getContainerStatus(): Promise<Record<string, unknown>>;
  copyToICloud(localPath: string, remotePath: string): Promise<Record<string, unknown>>;
  getUploadStatus(remotePath: string): Promise<Record<string, unknown>>;
  fileExists(remotePath: string): Promise<boolean>;
  readTextFile(remotePath: string): Promise<string | null>;
}

let nativeModule: NativeICloudBridgeModule | null | undefined;

function getNativeModule(): NativeICloudBridgeModule | null {
  if (nativeModule !== undefined) {
    return nativeModule;
  }
  try {
    nativeModule = requireNativeModule<NativeICloudBridgeModule>('OrbitICloudBridge');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeContainerStatus(raw: Record<string, unknown>): ICloudContainerStatus {
  return {
    available: raw.available === true,
    reason: asString(raw.reason) as ICloudContainerStatus['reason'],
    rootPath: asString(raw.rootPath),
  };
}

function normalizeUploadStatus(raw: Record<string, unknown>, remotePath: string): ICloudUploadStatus {
  return {
    exists: raw.exists === true,
    uploaded: raw.uploaded === true,
    uploading: raw.uploading === true,
    remotePath: asString(raw.remotePath) ?? remotePath,
    localPath: asString(raw.localPath),
    error: asString(raw.error),
    reason: asString(raw.reason),
  };
}

export async function getContainerStatus(): Promise<ICloudContainerStatus> {
  const native = getNativeModule();
  if (native === null) {
    return { available: false, reason: 'native_module_unavailable' };
  }
  return normalizeContainerStatus(await native.getContainerStatus());
}

export async function copyToICloud(
  localPath: string,
  remotePath: string,
): Promise<ICloudUploadStatus> {
  const native = getNativeModule();
  if (native === null) {
    throw new Error('icloud.native_module_unavailable');
  }
  return normalizeUploadStatus(await native.copyToICloud(localPath, remotePath), remotePath);
}

export async function getUploadStatus(remotePath: string): Promise<ICloudUploadStatus> {
  const native = getNativeModule();
  if (native === null) {
    return {
      exists: false,
      uploaded: false,
      uploading: false,
      remotePath,
      reason: 'native_module_unavailable',
    };
  }
  return normalizeUploadStatus(await native.getUploadStatus(remotePath), remotePath);
}

export async function fileExists(remotePath: string): Promise<boolean> {
  const native = getNativeModule();
  if (native === null) {
    return false;
  }
  return native.fileExists(remotePath);
}

export async function readTextFile(remotePath: string): Promise<string | null> {
  const native = getNativeModule();
  if (native === null) {
    return null;
  }
  return native.readTextFile(remotePath);
}

export function subscribeToChanges(
  remotePath: string,
  onChange: (status: ICloudUploadStatus) => void,
  intervalMs = 5000,
): () => void {
  let stopped = false;
  let lastSignature: string | null = null;
  const tick = () => {
    getUploadStatus(remotePath)
      .then((status) => {
        const signature = JSON.stringify(status);
        if (!stopped && signature !== lastSignature) {
          lastSignature = signature;
          onChange(status);
        }
      })
      .catch(() => undefined);
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
