export const MISSING_RECORDING_MESSAGE = '这条录音的本地文件不完整或已被移除，已标记为需要处理。';

export function recordingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'recording.audio_missing') {
    return '这条录音没有音频附件。';
  }
  if (message === 'recording.audio_file_missing') {
    return '这条录音的音频文件不在本机，已标记为需要处理。';
  }
  if (
    message.includes('readAsStringAsync')
    || message.includes('manifest.json')
    || message.includes('recording_manifest_unreadable')
    || message.includes('local_capture_incomplete')
  ) {
    return MISSING_RECORDING_MESSAGE;
  }
  return message;
}
