export type OrbitRecorderDeviceModuleEvents = {
  onScanResult: (event: X1DiscoveredDevice) => void;
  onConnectionState: (event: X1ConnectionStateEvent) => void;
  onFrame: (event: X1FrameEvent) => void;
  onAudioList: (event: { files: X1AudioFile[] }) => void;
  onImportProgress: (event: X1ImportProgressEvent) => void;
  onImportComplete: (event: X1ImportResult) => void;
  onRealtimeProgress: (event: X1RealtimeProgressEvent) => void;
  onRealtimeComplete: (event: X1RealtimeImportResult) => void;
  onDeviceStatus: (event: X1DeviceStatusEvent) => void;
  onError: (event: { message: string }) => void;
};

export interface X1DiscoveredDevice {
  id: string;
  name: string;
  rssi?: number;
  advertisedServices: string[];
  isLikelyX1: boolean;
}

export interface X1ConnectionStateEvent {
  bluetoothState: string;
  connectionState: string;
  isScanning: boolean;
  device?: X1DiscoveredDevice;
}

export interface X1FrameEvent {
  direction: 'tx' | 'rx';
  frameHex: string;
  payloadHex: string;
  crcValid?: boolean;
  type?: number;
  command?: number | null;
}

export interface X1AudioFile {
  index: number;
  name: string;
  durationMs: number;
  byteSize: number;
  totalCount: number;
}

export interface X1CommandAck {
  sequence: number;
  payloadHex: string;
}

export interface X1DeviceIdentity {
  kind: 'deviceIdentity';
  mac: string;
  macHex: string;
  appKey: string;
  appKeyHex: string;
}

export interface X1DeviceSettings {
  kind: 'settings';
  clearRecord: boolean;
  hideRecord: boolean;
  privacy: boolean;
  raw: number[];
}

export interface X1DeviceFlags {
  kind: 'deviceFlags';
  flags: number;
  isPlaying: boolean;
  isRecording: boolean;
  isUsbMode: boolean;
  isRealtimeTranscribing: boolean;
  isImporting: boolean;
  isPlaybackPaused: boolean;
  isScanningBusy: boolean;
}

export interface X1DeleteAudioResult {
  kind: 'deleteAudio';
  deletedCount: number | null;
  names: string[];
  all: boolean;
  status: number;
  success: boolean;
  payloadHex: string;
}

export interface X1RawPayloadResult {
  payloadHex: string;
  byteSize: number;
}

export interface X1ImportProgressEvent {
  phase: 'started' | 'receiving' | string;
  name?: string;
  bytesReceived?: number;
  expectedSize?: number;
  durationMs?: number;
}

export interface X1ImportResult {
  uri: string;
  name: string;
  byteSize: number;
  expectedSize: number;
  durationMs: number;
  mime: string;
  status: number;
  success: boolean;
}

export interface X1RealtimeProgressEvent {
  phase: 'started' | 'receiving' | 'stopping' | string;
  name?: string;
  bytesReceived?: number;
  durationMs?: number;
  chunksReceived?: number;
}

export interface X1RealtimeImportResult {
  uri: string;
  name: string;
  byteSize: number;
  expectedSize?: number;
  durationMs: number;
  mime: string;
  status: number;
  success: boolean;
  startedAt?: string;
  endedAt?: string | null;
  chunksReceived?: number;
}

export type X1DeviceStatusEvent =
  | { kind: 'ack'; sequence: number }
  | { kind: 'battery'; battery: number }
  | { kind: 'version'; version: string }
  | { kind: 'storage'; usedBytes: number; totalBytes: number; freeBytes: number }
  | X1DeviceIdentity
  | X1DeviceSettings
  | X1DeviceFlags
  | X1DeleteAudioResult
  | { kind: 'unbound' }
  | { kind: string; [key: string]: unknown };

export interface X1StorageInfo {
  usedBytes: number;
  totalBytes: number;
  freeBytes: number;
}
