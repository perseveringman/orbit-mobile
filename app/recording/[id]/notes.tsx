import { useLocalSearchParams } from 'expo-router';

import { RecordingNotesScreen } from '../../../src/ui/recording/screens/RecordingNotesScreen';

export default function RecordingNotesRoute(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  return <RecordingNotesScreen id={params.id ?? ''} />;
}
