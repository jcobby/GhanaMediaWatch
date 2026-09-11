import { useLocalSearchParams } from 'expo-router';
import { OrganisationProfileScreen } from '@/features/organisations/OrganisationProfileScreen';

export default function OrganisationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrganisationProfileScreen businessId={id ?? ''} />;
}
