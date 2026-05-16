import { useLocalSearchParams } from 'expo-router';

import { RecordingComposerScreen } from '../../src/ui/recording/screens/RecordingComposerScreen';

export default function X1RecordingComposerRoute(): React.ReactElement {
  const params = useLocalSearchParams<{ autoCapture?: string; durationMs?: string }>();
  const autoSaveAfterMs = params.autoCapture === '1'
    ? parseAutoCaptureDuration(params.durationMs)
    : undefined;
  return <RecordingComposerScreen source="x1" autoSaveAfterMs={autoSaveAfterMs} />;
}

function parseAutoCaptureDuration(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6000;
  return Math.max(3000, Math.min(30_000, Math.round(parsed)));
}
