import { useLocalSearchParams } from 'expo-router';

import { RecordingAskScreen } from '../../../src/ui/recording/screens/RecordingAskScreen';

export default function RecordingAskRoute(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  return <RecordingAskScreen id={params.id ?? ''} />;
}
