import { requireNativeModule } from 'expo-modules-core';

export interface OrbitDurableFSModule {
  fsync(path: string): Promise<void>;
}

export default requireNativeModule<OrbitDurableFSModule>('OrbitDurableFS');
