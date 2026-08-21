import { useLocalSearchParams } from 'expo-router';
import { QueryEditorScreen } from '@/features/org/QueryEditorScreen';

export default function QueryEditorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // `new` is a sentinel rather than a real id, so the editor opens blank.
  return <QueryEditorScreen {...(id && id !== 'new' ? { queryId: id } : {})} />;
}
