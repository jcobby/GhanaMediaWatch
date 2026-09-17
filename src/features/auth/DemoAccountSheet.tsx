import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Pressable, Sheet, Text } from '@/components/ui';
import { DEMO_LOGINS, DEMO_PASSWORD, type DemoLogin } from '@/api/dawuroData';
import { useColors } from '@/lib/theme';

interface DemoAccountSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (login: DemoLogin) => void;
}

/**
 * Demo account picker.
 *
 * Present only while the app runs on fixtures — it disappears with the mock
 * client, since a one-tap shortcut into an account must not exist against a
 * real backend.
 *
 * Reporter accounts only. Organisation and platform work is done in the web
 * console, and the phone no longer has screens for either.
 */
export function DemoAccountSheet({ visible, onClose, onPick }: DemoAccountSheetProps) {
  const c = useColors();
  const { t } = useTranslation();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('auth.demoTitle')}
      subtitle={t('auth.demoSubtitle', { password: DEMO_PASSWORD })}
    >
      <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
        <View className="gap-2">
          {DEMO_LOGINS.filter((login) => login.accountType === 'reporter').map((login) => (
            <Pressable
              key={login.email}
              onPress={() => onPick(login)}
              accessibilityLabel={login.displayName}
              className="flex-row items-center gap-3 rounded-lg border border-hairline/[0.10] p-3.5"
            >
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise">
                <Ionicons name="person-outline" size={17} color={c.textMuted} />
              </View>
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text variant="body-sm" className="font-sans-semibold">
                    {login.displayName}
                  </Text>
                  <Badge label={t(`auth.accountType.${login.accountType}`)} tone="neutral" />
                </View>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {login.email}
                </Text>
                {/* What each account is actually good for demonstrating —
                    otherwise picking between them is guesswork. */}
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {login.showcases}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}
