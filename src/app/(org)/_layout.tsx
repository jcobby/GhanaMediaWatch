import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTabScreenOptions } from '@/components/RoleTabBar';
import { useOrgDashboard } from '@/hooks/useOrg';
import { useAuthStore } from '@/stores/authStore';
import { useColors } from '@/lib/theme';

/**
 * The organisation's navigation.
 *
 * Four tabs, in the order the work happens: what arrived, what we bought, who
 * we sent, and the account behind all three. There is no capture tab, and that
 * absence is the design — an organisation account does not film anything. It
 * receives footage other people took the risk of taking, and every screen here
 * is about deciding what to do with it.
 *
 * Reached only by an account the *server* says belongs to an organisation. The
 * redirect below is a guard, not a gate: the service refuses every route under
 * it without a membership regardless, so this exists to stop a reporter who
 * deep-links here from staring at four screens of refusals.
 */
export default function OrgTabsLayout() {
  const c = useColors();
  const { t } = useTranslation();
  const options = useTabScreenOptions();

  const hydrated = useAuthStore((s) => s.hydrated);
  const isOrg = useAuthStore((s) => s.profile?.accountType === 'organisation');
  const pending = useAuthStore((s) => s.profile?.orgVerified === false);
  const { data: dashboard } = useOrgDashboard();

  /*
   * Nothing is decided until the keychain has been read.
   *
   * Redirecting on `!isOrg` before hydration sends every organisation operator
   * to the reporter app for the one frame it takes to load their profile — and
   * a `Redirect` is not a frame, it is a navigation that does not come back.
   */
  if (!hydrated) return null;
  if (!isOrg) return <Redirect href="/(tabs)" />;
  /*
   * A pending organisation has no business here.
   *
   * The service refuses every route these four tabs read — `check:
   * "org_pending"` — until a platform administrator approves the application,
   * so without this the account lands on an inbox, a licence list, a dispatch
   * board and an account screen that can each only render a refusal.
   */
  if (pending) return <Redirect href="/onboarding/organisation" />;

  const waiting = dashboard?.inboxCount ?? 0;

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
          title: t('org.inbox'),
          /*
           * The count of reports nobody has acted on. It is the reason to open
           * the app, and the same number the push notification is about.
           */
          tabBarBadge: waiting > 0 ? waiting : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'file-tray-full' : 'file-tray-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="licences"
        options={{
          title: t('org.licences'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'ribbon' : 'ribbon-outline'} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dispatch"
        options={{
          title: t('org.dispatch'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('org.account'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'business' : 'business-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
