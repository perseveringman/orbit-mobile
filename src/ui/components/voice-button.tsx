import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  startLiveTranscription,
  type LiveTranscriptionSession,
  type LiveTranscriptionState,
} from '../../core/audio/transcription';
import { startVoiceRecording, stopVoiceRecording } from '../../core/audio/recorder';
import type { VoiceRecordingResult } from '../../core/audio/recorder';

interface VoiceButtonProps {
  disabled?: boolean;
  onRecorded: (result: VoiceRecordingResult) => void;
  onTranscript?: (state: LiveTranscriptionState) => void;
  onError: (error: unknown) => void;
}

export function VoiceButton({
  disabled,
  onRecorded,
  onTranscript,
  onError,
}: VoiceButtonProps): React.ReactElement {
  const [recording, setRecording] = useState(false);
  const [transcription, setTranscription] = useState<LiveTranscriptionSession | null>(null);

  async function begin(): Promise<void> {
    if (disabled || recording) return;
    let session: LiveTranscriptionSession | null = null;
    try {
      await startVoiceRecording();
      setRecording(true);
      session = await startLiveTranscription(
        (state) => {
          if (state.transcript.trim().length > 0) {
            onTranscript?.(state);
          }
        },
        () => {
          // 转写失败不能阻断原始录音保存。
        },
      );
      setTranscription(session);
    } catch (error) {
      await session?.stop();
      setTranscription(null);
      onError(error);
    }
  }

  async function end(): Promise<void> {
    if (!recording) return;
    setRecording(false);
    try {
      onRecorded(await stopVoiceRecording());
    } catch (error) {
      onError(error);
    } finally {
      await transcription?.stop();
      setTranscription(null);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.button, recording && styles.recording, disabled && styles.disabled]}
      onPressIn={() => {
        void begin();
      }}
      onPressOut={() => {
        void end();
      }}
    >
      <Text style={styles.text}>{recording ? '松开保存' : '按住说话'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderColor: '#cbd5e1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  recording: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  disabled: {
    opacity: 0.35,
  },
  text: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
});
