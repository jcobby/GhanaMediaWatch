import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/lib/theme';
import { useTabScreenOptions } from '@/components/RoleTabBar';

/**
 * Business navigation.
 *
 * Ordered by the business's job: read what came in, decide what to license,
 * then publish the good ones onward to the public. Surveys are the proactive
 * counterpart, and Account carries the subscription.
 *
 * Deliberately not the reporter's tab bar with items hidden — an agency officer
 * and a member of the public are doing unrelated work, and sharing navigation
 * makes both feel like an afterthought.
 */
export default function BusinessTabsLayout() {
  const { t } = useTranslation();
  const options = useTabScreenOptions();

  return (
    <Tabs
      screenOptions={{
        ...options,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('businessTabs.inbox'),
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
          title: t('businessTabs.published'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'megaphone' : 'megaphone-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="surveys"
        options={{
          title: t('businessTabs.surveys'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('businessTabs.account'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'business' : 'business-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
