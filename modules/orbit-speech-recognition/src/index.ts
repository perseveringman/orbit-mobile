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

interface SpeechEvents {
  onTranscription: (event: TranscriptionEvent) => void;
  onTranscriptionError: (event: { message: string }) => void;
}

export type SpeechNativeModule = {
  getAvailability(locale?: string): Promise<SpeechAvailability>;
  start(locale?: string): Promise<SpeechAvailability>;
  stop(): Promise<void>;
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

export function addTranscriptionListener(listener: (event: TranscriptionEvent) => void): { remove(): void } {
  return nativeModule.addListener('onTranscription', listener);
}

export function addTranscriptionErrorListener(listener: (event: { message: string }) => void): { remove(): void } {
  return nativeModule.addListener('onTranscriptionError', listener);
}
