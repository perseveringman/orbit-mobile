import { requireNativeModule } from 'expo-modules-core';

export interface OrbitDurableFSModule {
  fsync(path: string): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  appGroupContainerPath(groupId: string): Promise<string>;
}

export default requireNativeModule<OrbitDurableFSModule>('OrbitDurableFS');
