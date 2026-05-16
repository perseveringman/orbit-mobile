import nativeModule from './OrbitRecorderDeviceModule';
import type {
  OrbitRecorderDeviceModuleEvents,
  X1AudioFile,
  X1CommandAck,
  X1ConnectionStateEvent,
  X1DeleteAudioResult,
  X1DeviceIdentity,
  X1DeviceSettings,
  X1DeviceStatusEvent,
  X1DiscoveredDevice,
  X1FrameEvent,
  X1ImportProgressEvent,
  X1ImportResult,
  X1RawPayloadResult,
  X1RealtimeImportResult,
  X1RealtimeProgressEvent,
  X1StorageInfo,
} from './OrbitRecorderDevice.types';

export type {
  OrbitRecorderDeviceModuleEvents,
  X1AudioFile,
  X1CommandAck,
  X1ConnectionStateEvent,
  X1DeleteAudioResult,
  X1DeviceFlags,
  X1DeviceIdentity,
  X1DeviceSettings,
  X1DeviceStatusEvent,
  X1DiscoveredDevice,
  X1FrameEvent,
  X1ImportProgressEvent,
  X1ImportResult,
  X1RawPayloadResult,
  X1RealtimeImportResult,
  X1RealtimeProgressEvent,
  X1StorageInfo,
} from './OrbitRecorderDevice.types';

export function getState(): Promise<X1ConnectionStateEvent> {
  return nativeModule.getState();
}

export function startScan(): Promise<void> {
  return nativeModule.startScan();
}

export function stopScan(): Promise<void> {
  return nativeModule.stopScan();
}

export function connect(identifier: string): Promise<X1DiscoveredDevice> {
  return nativeModule.connect(identifier);
}

export function disconnect(): Promise<void> {
  return nativeModule.disconnect();
}

export function sendCheckTime(): Promise<void> {
  return nativeModule.sendCheckTime();
}

export function getBattery(): Promise<number> {
  return nativeModule.getBattery();
}

export function getDeviceIdentity(): Promise<X1DeviceIdentity> {
  return nativeModule.getDeviceIdentity();
}

export function getVersion(): Promise<string> {
  return nativeModule.getVersion();
}

export function getStorage(): Promise<X1StorageInfo> {
  return nativeModule.getStorage();
}

export function getSettings(): Promise<X1DeviceSettings> {
  return nativeModule.getSettings();
}

export function setSetting(position: 7 | 8 | 9, enabled: boolean): Promise<X1DeviceSettings> {
  return nativeModule.setSetting(position, enabled);
}

export function sendBindDevice(): Promise<X1CommandAck> {
  return nativeModule.sendBindDevice();
}

export function sendUnbindDevice(): Promise<X1CommandAck> {
  return nativeModule.sendUnbindDevice();
}

export function requestAudioFileTotal(): Promise<number> {
  return nativeModule.requestAudioFileTotal();
}

export function requestAudioList(start = 0, count = 25): Promise<X1AudioFile[]> {
  return nativeModule.requestAudioList(start, count);
}

export function importAudio(file: X1AudioFile, offset = 0): Promise<X1ImportResult> {
  return nativeModule.importAudio(file.name, file.byteSize, file.durationMs, offset);
}

export function stopImport(): Promise<void> {
  return nativeModule.stopImport();
}

export function pauseImportTransfer(paused: boolean): Promise<X1CommandAck> {
  return nativeModule.pauseImportTransfer(paused);
}

export function deleteAudioFiles(names: string[]): Promise<X1DeleteAudioResult> {
  return nativeModule.deleteAudioFiles(names);
}

export function deleteAllAudioFiles(): Promise<X1DeleteAudioResult> {
  return nativeModule.deleteAllAudioFiles();
}

export function requestLegacyAudioListRaw(): Promise<X1RawPayloadResult> {
  return nativeModule.requestLegacyAudioListRaw();
}

export function startRealtimeImport(name = ''): Promise<X1RealtimeImportResult> {
  return nativeModule.startRealtimeImport(name);
}

export function stopRealtimeImport(): Promise<X1RealtimeImportResult> {
  return nativeModule.stopRealtimeImport();
}

export function cancelRealtimeImport(): Promise<void> {
  return nativeModule.cancelRealtimeImport();
}

export function startRealtimeRecord(): Promise<void> {
  return nativeModule.startRealtimeRecord();
}

export function stopRealtimeRecord(): Promise<void> {
  return nativeModule.stopRealtimeRecord();
}

export function pauseRealtimeRecord(): Promise<void> {
  return nativeModule.pauseRealtimeRecord();
}

export function continueRealtimeRecord(): Promise<void> {
  return nativeModule.continueRealtimeRecord();
}

export function sendRawPayload(hex: string): Promise<void> {
  return nativeModule.sendRawPayload(hex);
}

export function addScanResultListener(listener: (event: X1DiscoveredDevice) => void): { remove(): void } {
  return nativeModule.addListener('onScanResult', listener);
}

export function addConnectionStateListener(listener: (event: X1ConnectionStateEvent) => void): { remove(): void } {
  return nativeModule.addListener('onConnectionState', listener);
}

export function addFrameListener(listener: (event: X1FrameEvent) => void): { remove(): void } {
  return nativeModule.addListener('onFrame', listener);
}

export function addImportProgressListener(listener: (event: X1ImportProgressEvent) => void): { remove(): void } {
  return nativeModule.addListener('onImportProgress', listener);
}

export function addImportCompleteListener(listener: (event: X1ImportResult) => void): { remove(): void } {
  return nativeModule.addListener('onImportComplete', listener);
}

export function addRealtimeProgressListener(listener: (event: X1RealtimeProgressEvent) => void): { remove(): void } {
  return nativeModule.addListener('onRealtimeProgress', listener);
}

export function addRealtimeCompleteListener(listener: (event: X1RealtimeImportResult) => void): { remove(): void } {
  return nativeModule.addListener('onRealtimeComplete', listener);
}

export function addDeviceStatusListener(listener: (event: X1DeviceStatusEvent) => void): { remove(): void } {
  return nativeModule.addListener('onDeviceStatus', listener);
}

export function addErrorListener(listener: (event: { message: string }) => void): { remove(): void } {
  return nativeModule.addListener('onError', listener);
}
