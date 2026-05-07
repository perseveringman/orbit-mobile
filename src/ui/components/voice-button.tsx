import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { startVoiceRecording, stopVoiceRecording } from '../../core/audio/recorder';
import type { VoiceRecordingResult } from '../../core/audio/recorder';

interface VoiceButtonProps {
  disabled?: boolean;
  onRecorded: (result: VoiceRecordingResult) => void;
  onError: (error: unknown) => void;
}

export function VoiceButton({ disabled, onRecorded, onError }: VoiceButtonProps): React.ReactElement {
  const [recording, setRecording] = useState(false);

  async function begin(): Promise<void> {
    if (disabled || recording) return;
    try {
      await startVoiceRecording();
      setRecording(true);
    } catch (error) {
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
