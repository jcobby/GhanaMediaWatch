import { useLocalSearchParams } from 'expo-router';
import { OrgReportScreen } from '@/features/org/OrgReportScreen';

/**
 * One routed report, opened from the organisation's inbox or licences list.
 *
 * A card over the tabs rather than a fifth tab: the officer came from a list
 * and expects to come back to the same place in it.
 */
export default function OrgReportRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrgReportScreen incidentId={id ?? ''} />;
}
