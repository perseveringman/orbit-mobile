import {
  addTranscriptionErrorListener,
  addTranscriptionListener,
  getAvailability,
  start,
  stop,
} from 'orbit-speech-recognition';
import type { TranscriptionSegment } from 'orbit-speech-recognition';
import { isVoiceRecordingActive } from './recorder';

export type LiveTranscriptionSegment = TranscriptionSegment;

export interface LiveTranscriptionState {
  transcript: string;
  available: boolean;
  source: 'ios-speech' | 'unavailable';
  isFinal?: boolean;
  segments?: LiveTranscriptionSegment[];
  reason?: string;
}

export interface LiveTranscriptionSession {
  source: 'ios-speech' | 'unavailable';
  available: boolean;
  reason?: string;
  stop(): Promise<void>;
}

export async function getLiveTranscriptionAvailability(): Promise<LiveTranscriptionState> {
  try {
    const availability = await getAvailability();
    return {
      transcript: '',
      available: availability.available,
      source: availability.available ? 'ios-speech' : 'unavailable',
      reason: availability.reason,
    };
  } catch (error) {
    return {
      transcript: '',
      available: false,
      source: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function startLiveTranscription(
  onTranscript: (state: LiveTranscriptionState) => void,
  onError?: (error: unknown) => void,
): Promise<LiveTranscriptionSession> {
  try {
    if (isVoiceRecordingActive()) {
      return subscribeToNativeTranscription(onTranscript, onError, false);
    }

    const currentAvailability = await getLiveTranscriptionAvailability();
    if (!currentAvailability.available) {
      return unavailableSession(currentAvailability.reason);
    }

    const availability = await start();
    if (!availability.available) {
      return unavailableSession(availability.reason);
    }

    return subscribeToNativeTranscription(onTranscript, onError, true);
  } catch (error) {
    onError?.(error);
    return unavailableSession(error instanceof Error ? error.message : String(error));
  }
}

function subscribeToNativeTranscription(
  onTranscript: (state: LiveTranscriptionState) => void,
  onError: ((error: unknown) => void) | undefined,
  stopNativeOnEnd: boolean,
): LiveTranscriptionSession {
  const transcriptionSubscription = addTranscriptionListener((event) => {
    onTranscript({
      transcript: event.transcript,
      available: true,
      source: event.source,
      isFinal: event.isFinal,
      segments: event.segments,
    });
  });
  const errorSubscription = addTranscriptionErrorListener((event) => {
    onError?.(new Error(event.message));
  });

  return {
    source: 'ios-speech',
    available: true,
    async stop() {
      transcriptionSubscription.remove();
      errorSubscription.remove();
      if (stopNativeOnEnd) {
        await stop();
      }
    },
  };
}

function unavailableSession(reason: string | undefined): LiveTranscriptionSession {
  return {
    source: 'unavailable',
    available: false,
    reason,
    stop() {
      return Promise.resolve();
    },
  };
}
