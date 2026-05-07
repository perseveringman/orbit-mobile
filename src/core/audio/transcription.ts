import {
  addTranscriptionErrorListener,
  addTranscriptionListener,
  getAvailability,
  start,
  stop,
} from 'orbit-speech-recognition';

export interface LiveTranscriptionState {
  transcript: string;
  available: boolean;
  source: 'ios-speech' | 'unavailable';
  reason?: string;
}

export interface LiveTranscriptionSession {
  source: 'ios-speech' | 'unavailable';
  available: boolean;
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
  let transcript = '';
  try {
    const availability = await start();
    if (!availability.available) {
      return unavailableSession(availability.reason);
    }

    const transcriptionSubscription = addTranscriptionListener((event) => {
      transcript = event.transcript;
      onTranscript({
        transcript,
        available: true,
        source: event.source,
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
        await stop();
      },
    };
  } catch (error) {
    onError?.(error);
    return unavailableSession(error instanceof Error ? error.message : String(error));
  }
}

function unavailableSession(reason: string | undefined): LiveTranscriptionSession {
  void reason;
  return {
    source: 'unavailable',
    available: false,
    stop() {
      return Promise.resolve();
    },
  };
}
