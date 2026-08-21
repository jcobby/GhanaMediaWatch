import { useLocalSearchParams } from 'expo-router';
import { SurveyTakeScreen } from '@/features/surveys/SurveyTakeScreen';

export default function SurveyTakeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SurveyTakeScreen surveyId={id} />;
}
