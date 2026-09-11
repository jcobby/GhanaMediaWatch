import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/lib/theme';
import { useTabScreenOptions } from '@/components/RoleTabBar';

/**
 * Platform operator navigation.
 *
 * Four tabs matching the four things an operator actually does: watch the
 * service, override routing, admit organisations, and release money. Each is a
 * queue, so each gets a tab rather than being buried behind a dashboard tile.
 */
export default function PlatformTabsLayout() {
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
          title: t('platformTabs.console'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'speedometer' : 'speedometer-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="routing"
        options={{
          title: t('platformTabs.routing'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'git-branch' : 'git-branch-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: t('platformTabs.approvals'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: t('platformTabs.payouts'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cash' : 'cash-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
