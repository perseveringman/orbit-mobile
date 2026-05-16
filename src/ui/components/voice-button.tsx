import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import {
  startLiveTranscription,
  type LiveTranscriptionSession,
  type LiveTranscriptionState,
} from '../../core/audio/transcription';
import { startVoiceRecording, stopVoiceRecording } from '../../core/audio/recorder';
import type { VoiceRecordingResult } from '../../core/audio/recorder';
import { ComposerIcon } from './composer-icons';

interface VoiceButtonProps {
  disabled?: boolean;
  onRecorded: (result: VoiceRecordingResult) => void;
  onTranscript?: (state: LiveTranscriptionState) => void;
  onError: (error: unknown) => void;
  variant?: 'standalone' | 'toolbar';
}

export function VoiceButton({
  disabled,
  onRecorded,
  onTranscript,
  onError,
  variant = 'standalone',
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
      accessibilityLabel="按住转文字"
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        variant === 'toolbar' ? styles.toolbarButton : styles.button,
        recording && styles.recording,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPressIn={() => {
        void begin();
      }}
      onPressOut={() => {
        void end();
      }}
    >
      <ComposerIcon name="mic" color={recording ? '#dc2626' : '#262626'} size={variant === 'toolbar' ? 21 : 22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  toolbarButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  recording: {
    backgroundColor: '#fff1f2',
    borderColor: '#ef4444',
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
