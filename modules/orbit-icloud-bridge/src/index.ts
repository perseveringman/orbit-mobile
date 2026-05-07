import { requireNativeModule } from 'expo-modules-core';

export interface OrbitICloudBridgeModule {
  getContainerStatus(): Promise<Record<string, unknown>>;
  copyToICloud(localPath: string, remotePath: string): Promise<Record<string, unknown>>;
  getUploadStatus(remotePath: string): Promise<Record<string, unknown>>;
  fileExists(remotePath: string): Promise<boolean>;
  readTextFile(remotePath: string): Promise<string | null>;
}

export default requireNativeModule<OrbitICloudBridgeModule>('OrbitICloudBridge');
