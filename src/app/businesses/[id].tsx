import { useLocalSearchParams } from 'expo-router';
import { BusinessProfileScreen } from '@/features/businesses/BusinessProfileScreen';

export default function BusinessRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BusinessProfileScreen businessId={id ?? ''} />;
}
