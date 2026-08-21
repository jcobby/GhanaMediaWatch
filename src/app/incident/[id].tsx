import { useLocalSearchParams } from 'expo-router';
import { IncidentDetailScreen } from '@/features/incident/IncidentDetailScreen';

export default function IncidentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IncidentDetailScreen incidentId={id} />;
}
