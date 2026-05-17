import { requireNativeModule } from 'expo-modules-core';

import type {
  OrbitRecorderDeviceModuleEvents,
  X1CommandAck,
  X1AudioFile,
  X1ConnectionStateEvent,
  X1DeleteAudioResult,
  X1DeviceIdentity,
  X1DeviceSettings,
  X1DiscoveredDevice,
  X1ImportResult,
  X1RawPayloadResult,
  X1RealtimeImportResult,
  X1StorageInfo,
} from './OrbitRecorderDevice.types';

export interface OrbitRecorderDeviceNativeModule {
  getState(): Promise<X1ConnectionStateEvent>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(identifier: string): Promise<X1DiscoveredDevice>;
  disconnect(): Promise<void>;
  sendCheckTime(): Promise<void>;
  getBattery(): Promise<number>;
  getDeviceIdentity(): Promise<X1DeviceIdentity>;
  getVersion(): Promise<string>;
  getStorage(): Promise<X1StorageInfo>;
  getSettings(): Promise<X1DeviceSettings>;
  setSetting(position: number, enabled: boolean): Promise<X1DeviceSettings>;
  sendBindDevice(): Promise<X1CommandAck>;
  sendUnbindDevice(): Promise<X1CommandAck>;
  requestAudioFileTotal(): Promise<number>;
  requestAudioList(start: number, count: number): Promise<X1AudioFile[]>;
  importAudio(name: string, expectedSize: number, durationMs: number, offset: number): Promise<X1ImportResult>;
  setFrameDebugEnabled(enabled: boolean): Promise<void>;
  pauseImportTransfer(paused: boolean): Promise<X1CommandAck>;
  stopImport(): Promise<void>;
  deleteAudioFiles(names: string[]): Promise<X1DeleteAudioResult>;
  deleteAllAudioFiles(): Promise<X1DeleteAudioResult>;
  requestLegacyAudioListRaw(): Promise<X1RawPayloadResult>;
  startRealtimeImport(name: string): Promise<X1RealtimeImportResult>;
  stopRealtimeImport(): Promise<X1RealtimeImportResult>;
  cancelRealtimeImport(): Promise<void>;
  startRealtimeRecord(): Promise<void>;
  stopRealtimeRecord(): Promise<void>;
  pauseRealtimeRecord(): Promise<void>;
  continueRealtimeRecord(): Promise<void>;
  sendRawPayload(hex: string): Promise<void>;
  addListener<EventName extends keyof OrbitRecorderDeviceModuleEvents>(
    eventName: EventName,
    listener: OrbitRecorderDeviceModuleEvents[EventName],
  ): { remove(): void };
}

export default requireNativeModule<OrbitRecorderDeviceNativeModule>('OrbitRecorderDevice');
