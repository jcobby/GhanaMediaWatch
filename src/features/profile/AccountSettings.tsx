import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { AuthField } from '@/features/auth/AuthField';
import { passwordSchema } from '@/features/auth/schemas';
import { api } from '@/api';
import { describeApiError } from '@/lib/apiErrorCopy';
import { useColors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';

/**
 * The account itself: its name, its password, and a way to delete it.
 *
 * None of this existed. A reporter could not correct the name shown on their
 * reports, could not change a password somebody else had seen, and had no way
 * to delete an account — which, for an app that holds footage of identifiable
 * people, Ghana's Data Protection Act makes a requirement rather than a nicety.
 *
 * Shown only to a signed-in account. A guest has nothing here to manage.
 */
export function AccountSettings() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleting, setDeleting] = useState(false);

  if (!profile) return null;

  const failure = (cause: unknown, titleKey: string, bodyKey: string) =>
    describeApiError(cause, t, { title: t(titleKey), body: t(bodyKey) });

  const saveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      setNameError(t('account.nameInvalid'));
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await updateDisplayName(trimmed);
      setNameOpen(false);
      toast.success(t('account.nameSavedTitle'), t('account.nameSavedBody', { name: trimmed }));
    } catch (cause) {
      const copy = failure(cause, 'account.nameFailedTitle', 'account.nameFailedBody');
      setNameError(copy.body);
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword) {
      setPasswordError(t('account.currentPasswordRequired'));
      return;
    }
    const strong = passwordSchema.safeParse(newPassword);
    if (!strong.success) {
      setPasswordError(strong.error.issues[0]?.message ?? t('account.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('account.passwordsDiffer'));
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('account.passwordSavedTitle'), t('account.passwordSavedBody'));
    } catch (cause) {
      const copy = failure(cause, 'account.passwordFailedTitle', 'account.passwordFailedBody');
      setPasswordError(copy.body);
    } finally {
      setSavingPassword(false);
    }
  };

  /*
   * Deleting is asked twice in effect: a destructive confirmation that says
   * exactly what happens to reports already filed, because "delete my account"
   * is easily read as "delete my footage", and it does not do that.
   */
  const confirmDelete = () => {
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          deleteAccount()
            .then(() => {
              toast.info(t('account.deletedTitle'), t('account.deletedBody'));
              router.replace('/(auth)/sign-in');
            })
            .catch((cause: unknown) => {
              const copy = failure(cause, 'account.deleteFailedTitle', 'account.deleteFailedBody');
              toast.error(copy.title, copy.body);
            })
            .finally(() => setDeleting(false));
        },
      },
    ]);
  };

  return (
    <>
      <View className="gap-1.5">
        <Text variant="label" tone="muted" className="px-1">
          {t('account.title')}
        </Text>
        <Glass elevation="low" className="gap-0 rounded-lg">
          <Row
            icon="person-outline"
            label={t('account.displayName')}
            value={profile.displayName}
            onPress={() => {
              setName(profile.displayName);
              setNameError(null);
              setNameOpen(true);
            }}
          />
          <Row
            icon="key-outline"
            label={t('account.changePassword')}
            onPress={() => {
              setPasswordError(null);
              setPasswordOpen(true);
            }}
          />
          <Row
            icon="trash-outline"
            label={deleting ? t('account.deleting') : t('account.delete')}
            danger
            onPress={deleting ? undefined : confirmDelete}
          />
        </Glass>
      </View>

      <Sheet visible={nameOpen} onClose={() => setNameOpen(false)} title={t('account.displayName')}>
        <View className="gap-4">
          <AuthField
            label={t('account.displayName')}
            value={name}
            onChangeText={setName}
            error={nameError ?? undefined}
            autoCapitalize="words"
            maxLength={40}
          />
          <Text variant="caption" tone="muted">
            {t('account.displayNameHelp')}
          </Text>
          <Button
            label={t('common.save')}
            size="lg"
            fullWidth
            loading={savingName}
            onPress={() => void saveName()}
          />
        </View>
      </Sheet>

      <Sheet
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title={t('account.changePassword')}
      >
        <View className="gap-4">
          <AuthField
            label={t('account.currentPassword')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secure
            autoCapitalize="none"
            autoComplete="current-password"
          />
          <AuthField
            label={t('account.newPassword')}
            value={newPassword}
            onChangeText={setNewPassword}
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholder')}
          />
          <AuthField
            label={t('auth.confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            error={passwordError ?? undefined}
          />
          <Button
            label={t('account.savePassword')}
            size="lg"
            fullWidth
            loading={savingPassword}
            onPress={() => void savePassword()}
          />
        </View>
      </Sheet>

      {/* Colour only reinforces the row's label; the words say what it does. */}
      {deleting ? (
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="hourglass-outline" size={14} color={c.textMuted} />
          <Text variant="caption" tone="muted">
            {t('account.deleting')}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function Row({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="flex-row items-center gap-3 border-b border-hairline/[0.08] px-4 py-3.5"
    >
      <Ionicons name={icon} size={18} color={danger ? c.danger : c.textMuted} />
      <Text variant="body" tone={danger ? 'danger' : 'primary'} className="flex-1">
        {label}
      </Text>
      {value ? (
        <Text variant="body-sm" tone="muted" numberOfLines={1} className="max-w-[45%]">
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
    </Pressable>
  );
}
