import {
  addAudioLevelListener,
  cancelCapture,
  discardRecoveredCapture,
  pauseCapture,
  recoverInterruptedCaptures,
  resumeCapture,
  startCapture,
  stopCapture,
} from 'orbit-speech-recognition';
import type { AudioLevelEvent, RecoveredSpeechCapture } from 'orbit-speech-recognition';
import { prepareAudioPlayback } from './playback';

export interface VoiceRecordingResult {
  uri: string;
  durationMs: number | null;
}

export interface RecoveredVoiceRecording {
  uri: string;
  durationMs: number;
  startedAt?: string;
  recoveredAt: string;
}

let activeRecording = false;

export async function startVoiceRecording(): Promise<void> {
  if (activeRecording) {
    throw new Error('audio.recording_already_active');
  }
  const availability = await startCapture();
  if (!availability.available) {
    throw new Error(`audio.speech_capture_unavailable:${availability.reason ?? 'unknown'}`);
  }
  activeRecording = true;
}

export function isVoiceRecordingActive(): boolean {
  return activeRecording;
}

export function addVoiceRecordingLevelListener(
  listener: (event: AudioLevelEvent) => void,
): { remove(): void } {
  return addAudioLevelListener(listener);
}

export async function stopVoiceRecording(): Promise<VoiceRecordingResult> {
  if (!activeRecording) {
    throw new Error('audio.no_active_recording');
  }
  activeRecording = false;
  const result = await stopCapture();
  await prepareAudioPlayback();
  return {
    uri: result.uri,
    durationMs: result.durationMs,
  };
}

export async function pauseVoiceRecording(): Promise<void> {
  if (!activeRecording) {
    throw new Error('audio.no_active_recording');
  }
  await pauseCapture();
}

export async function resumeVoiceRecording(): Promise<void> {
  if (!activeRecording) {
    throw new Error('audio.no_active_recording');
  }
  await resumeCapture();
}

export async function cancelVoiceRecording(): Promise<void> {
  if (activeRecording) {
    activeRecording = false;
    await cancelCapture();
  }
  await prepareAudioPlayback();
}

export async function recoverInterruptedVoiceRecordings(): Promise<RecoveredVoiceRecording[]> {
  const recovered = await recoverInterruptedCaptures();
  return recovered.map(toRecoveredVoiceRecording);
}

export async function discardRecoveredVoiceRecording(uri: string): Promise<void> {
  await discardRecoveredCapture(uri);
}

function toRecoveredVoiceRecording(item: RecoveredSpeechCapture): RecoveredVoiceRecording {
  return {
    uri: item.uri,
    durationMs: Math.max(0, Math.round(item.durationMs)),
    startedAt: item.startedAt,
    recoveredAt: item.recoveredAt,
  };
}
