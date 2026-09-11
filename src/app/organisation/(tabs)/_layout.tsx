import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/lib/theme';
import { useTabScreenOptions } from '@/components/RoleTabBar';

/**
 * Organisation navigation.
 *
 * Ordered by the organisation's job: read what came in, decide what to license,
 * then publish the good ones onward to the public. Surveys are the proactive
 * counterpart, and Account carries the subscription.
 *
 * Deliberately not the reporter's tab bar with items hidden — an agency officer
 * and a member of the public are doing unrelated work, and sharing navigation
 * makes both feel like an afterthought.
 */
export default function OrganisationTabsLayout() {
  const c = useColors();
  const { t } = useTranslation();
  const options = useTabScreenOptions();

  return (
    <Tabs
      screenOptions={{
        ...options,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('organisationTabs.inbox'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'file-tray-full' : 'file-tray-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="published"
        options={{
          title: t('organisationTabs.published'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'megaphone' : 'megaphone-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="surveys"
        options={{
          title: t('organisationTabs.surveys'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('organisationTabs.account'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'business' : 'business-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
