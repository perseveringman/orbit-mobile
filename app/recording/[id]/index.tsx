import { useLocalSearchParams } from 'expo-router';

import { RecordingDetailScreen } from '../../../src/ui/recording/screens/RecordingDetailScreen';

export default function RecordingDetailRoute(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string; fromSession?: string }>();
  return <RecordingDetailScreen id={params.id ?? ''} returnHomeOnBack={params.fromSession === '1'} />;
}
