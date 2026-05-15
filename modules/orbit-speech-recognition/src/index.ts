import { requireNativeModule } from 'expo-modules-core';

export interface SpeechAvailability {
  available: boolean;
  reason?: string;
}

export interface TranscriptionEvent {
  transcript: string;
  isFinal: boolean;
  source: 'ios-speech';
}

export interface SpeechCaptureResult {
  uri: string;
  durationMs: number;
}

export interface RecoveredSpeechCapture {
  uri: string;
  durationMs: number;
  startedAt?: string;
  recoveredAt: string;
}

export interface AudioLevelEvent {
  elapsedMs: number;
  rms: number;
  peak: number;
}

interface SpeechEvents {
  onTranscription: (event: TranscriptionEvent) => void;
  onTranscriptionError: (event: { message: string }) => void;
  onAudioLevel: (event: AudioLevelEvent) => void;
}

export type SpeechNativeModule = {
  getAvailability(locale?: string): Promise<SpeechAvailability>;
  start(locale?: string): Promise<SpeechAvailability>;
  stop(): Promise<void>;
  startCapture(locale?: string): Promise<SpeechAvailability>;
  pauseCapture(): Promise<void>;
  resumeCapture(): Promise<void>;
  stopCapture(): Promise<SpeechCaptureResult>;
  cancelCapture(): Promise<void>;
  recoverInterruptedCaptures(): Promise<RecoveredSpeechCapture[]>;
  discardRecoveredCapture(uri: string): Promise<void>;
  addListener<EventName extends keyof SpeechEvents>(
    eventName: EventName,
    listener: SpeechEvents[EventName],
  ): { remove(): void };
};

const nativeModule = requireNativeModule<SpeechNativeModule>('OrbitSpeechRecognition');

export async function getAvailability(locale?: string): Promise<SpeechAvailability> {
  return nativeModule.getAvailability(locale);
}

export async function start(locale?: string): Promise<SpeechAvailability> {
  return nativeModule.start(locale);
}

export async function stop(): Promise<void> {
  await nativeModule.stop();
}

export async function startCapture(locale?: string): Promise<SpeechAvailability> {
  return nativeModule.startCapture(locale);
}

export async function pauseCapture(): Promise<void> {
  await nativeModule.pauseCapture();
}

export async function resumeCapture(): Promise<void> {
  await nativeModule.resumeCapture();
}

export async function stopCapture(): Promise<SpeechCaptureResult> {
  return nativeModule.stopCapture();
}

export async function cancelCapture(): Promise<void> {
  await nativeModule.cancelCapture();
}

export async function recoverInterruptedCaptures(): Promise<RecoveredSpeechCapture[]> {
  return nativeModule.recoverInterruptedCaptures();
}

export async function discardRecoveredCapture(uri: string): Promise<void> {
  await nativeModule.discardRecoveredCapture(uri);
}

export function addTranscriptionListener(listener: (event: TranscriptionEvent) => void): { remove(): void } {
  return nativeModule.addListener('onTranscription', listener);
}

export function addTranscriptionErrorListener(listener: (event: { message: string }) => void): { remove(): void } {
  return nativeModule.addListener('onTranscriptionError', listener);
}

export function addAudioLevelListener(listener: (event: AudioLevelEvent) => void): { remove(): void } {
  return nativeModule.addListener('onAudioLevel', listener);
}
