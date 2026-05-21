import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';

export async function prepareAudioPlayback(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

export async function readAudioDurationMs(uri: string): Promise<number | null> {
  let sound: Audio.Sound | null = null;
  try {
    const created = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
    sound = created.sound;
    return durationFromStatus(created.status);
  } finally {
    await sound?.unloadAsync().catch(() => undefined);
  }
}

export function durationFromStatus(status: AVPlaybackStatus): number | null {
  if (!status.isLoaded) return null;
  const duration = status.durationMillis;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? Math.round(duration)
    : null;
}
