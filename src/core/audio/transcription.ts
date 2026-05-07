export interface LiveTranscriptionState {
  transcript: string;
  available: boolean;
  source: 'ios-speech' | 'unavailable';
}

export function getLiveTranscriptionAvailability(): LiveTranscriptionState {
  return {
    transcript: '',
    available: false,
    source: 'unavailable',
  };
}
