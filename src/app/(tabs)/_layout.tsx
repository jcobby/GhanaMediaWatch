import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { accentGradient, useColors } from '@/lib/theme';
import { useTabScreenOptions } from '@/components/RoleTabBar';
import { useOutboxStore } from '@/stores/outboxStore';

/**
 * The public reporter's navigation.
 *
 * Ordered by what the product is for: capture sits centre and elevated because
 * sending information to organisations is the primary verb, and Earn sits
 * beside it because payment is the reason someone does it twice.
 *
 * The map moved into Home as a view toggle. It was competing for a tab slot
 * with the two things that actually drive the product.
 */
export default function TabsLayout() {
  const c = useColors();
  const { t } = useTranslation();
  const options = useTabScreenOptions();
  const pendingCount = useOutboxStore((s) => s.pendingCount);

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
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'play-circle' : 'play-circle-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="earn"
        options={{
          title: t('tabs.earn'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: '',
          tabBarIcon: () => (
            <LinearGradient
              colors={[...accentGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 52,
                height: 38,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="videocam" size={22} color={c.textOnDark} />
            </LinearGradient>
          ),
        }}
      />
      <Tabs.Screen
        name="outbox"
        options={{
          title: t('tabs.outbox'),
          // The badge is the only way a reporter learns something failed to
          // send while they were offline.
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'paper-plane' : 'paper-plane-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={23} color={color} />
          ),
        }}
      />
      {/* Map is reachable from Home rather than owning a tab. */}
      <Tabs.Screen name="map" options={{ href: null }} />
    </Tabs>
  );
}
