import {
  addAudioLevelListener,
  pauseCapture,
  resumeCapture,
  startCapture,
  stopCapture,
} from 'orbit-speech-recognition';
import type { AudioLevelEvent } from 'orbit-speech-recognition';
import { prepareAudioPlayback } from './playback';

export interface VoiceRecordingResult {
  uri: string;
  durationMs: number | null;
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
    await stopCapture();
  }
  await prepareAudioPlayback();
}
