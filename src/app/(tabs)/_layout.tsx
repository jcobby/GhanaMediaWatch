import { Redirect, Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { accentGradient, useColors } from '@/lib/theme';
import { useTabScreenOptions } from '@/components/RoleTabBar';
import { useOutboxStore } from '@/stores/outboxStore';
import { useAuthStore } from '@/stores/authStore';
import { homeRouteFor } from '@/lib/homeRoute';

/**
 * The public reporter's navigation.
 *
 * Ordered by what the product is for: capture sits centre and elevated because
 * sending information to organisations is the primary verb, and Earn sits
 * beside it because payment is the reason someone does it twice.
 *
 * The map moved into Home as a view toggle. It was competing for a tab slot
 * with the two things that actually drive the product.
 *
 * **Not for an organisation, and the guard below is the other half of the one
 * in `(org)/_layout.tsx`.** That shell redirects a reporter out; this one had
 * nothing, so an operator could reach the reporter app by swiping back from
 * theirs — and land on a camera.
 */
export default function TabsLayout() {
  const c = useColors();
  const { t } = useTranslation();
  const options = useTabScreenOptions();
  const pendingCount = useOutboxStore((s) => s.pendingCount);

  const hydrated = useAuthStore((s) => s.hydrated);
  const profile = useAuthStore((s) => s.profile);

  /*
   * An organisation belongs in its own shell, and this is not a tidiness rule.
   *
   * The centre tab films a report. An operator filing from an organisation
   * account would create a citizen report on the account that can license it —
   * the organisation paying its own commission for footage that reads as
   * independent. §8.6 models an institution's own submissions as a *separate*
   * thing for exactly that reason.
   *
   * Three of the five tabs are empty or meaningless for them besides: Sending
   * is a reporter's upload queue on an account that never captures, Profile
   * holds the payout details for a commission an organisation cannot earn, and
   * it duplicates the Organisation tab they already have.
   *
   * Destination comes from `homeRouteFor` rather than a hardcoded `/(org)`, so
   * an organisation whose application is still pending lands on the
   * application instead of four tabs of refusals.
   *
   * Nothing is decided before hydration: redirecting on a profile that has not
   * loaded sends every reporter to the organisation shell for the frame it
   * takes to read the keychain, and a `Redirect` is a navigation, not a frame.
   */
  if (hydrated && profile?.accountType === 'organisation') {
    return <Redirect href={homeRouteFor(profile)} />;
  }

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
      {/*
        Search takes the second tab; earnings moved to the profile.

        Search is one of the two things anybody opens a news app to do — read
        what is new, or find a particular thing — and it was a magnifier on one
        screen, unreachable from anywhere else. Earnings is a thing you check,
        not a thing you do: it belongs with the account it is attached to, and
        it is now a row in Settings.
      */}
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={23} color={color} />
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
      {/* Reached from Profile › Settings › Earnings, and by deep link. Kept as a
          route so neither of those breaks; `href: null` only removes the tab. */}
      <Tabs.Screen name="earn" options={{ href: null }} />
    </Tabs>
  );
}
