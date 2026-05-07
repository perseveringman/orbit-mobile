import { Audio } from 'expo-av';

export interface VoiceRecordingResult {
  uri: string;
  durationMs: number | null;
}

let activeRecording: Audio.Recording | null = null;
let startedAt: number | null = null;

export async function startVoiceRecording(): Promise<void> {
  if (activeRecording !== null) {
    throw new Error('audio.recording_already_active');
  }
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('audio.permission_denied');
  }
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  activeRecording = recording;
  startedAt = Date.now();
}

export async function stopVoiceRecording(): Promise<VoiceRecordingResult> {
  const recording = activeRecording;
  if (recording === null) {
    throw new Error('audio.no_active_recording');
  }
  activeRecording = null;
  const started = startedAt;
  startedAt = null;
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (!uri) {
    throw new Error('audio.recording_uri_missing');
  }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  return {
    uri,
    durationMs: started === null ? null : Date.now() - started,
  };
}

export async function cancelVoiceRecording(): Promise<void> {
  const recording = activeRecording;
  activeRecording = null;
  startedAt = null;
  if (recording !== null) {
    await recording.stopAndUnloadAsync();
  }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
}
