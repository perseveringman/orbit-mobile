import { useLocalSearchParams } from 'expo-router';

import { DetailScreen } from '../../src/ui/screens/detail-screen';

export default function DetailRoute(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  return <DetailScreen id={params.id} />;
}
