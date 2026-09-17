import { useState } from 'react';
import { Modal, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/ui';
import { OrganisationList } from '@/features/organisations/OrganisationList';
import { useColors } from '@/lib/theme';
import type { DirectoryOrganisation } from '@/types/dawuro';

/**
 * Finding an institution — its own screen, not a tab beside report search.
 *
 * "Which newsroom or agency is on Dawuro" and "what happened in Kaneshie" are
 * different questions, and they shared one field behind one magnifier. Anyone
 * looking for an institution had to open a search that assumed they meant
 * reports, then notice a tab and switch. The directory is the whole point of
 * choosing who receives a report, so it gets its own button and its own screen.
 *
 * Unlike report search, this one is trustworthy about emptiness: the directory
 * is small and arrives whole, so "no institution by that name" is a statement
 * about the platform rather than about one loaded page of it.
 */
export function InstitutionsOverlay({
  organisations,
  loading,
  failed,
  onOpenOrganisation,
  onClose,
}: {
  organisations: DirectoryOrganisation[];
  loading: boolean;
  failed: boolean;
  onOpenOrganisation: (id: string) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-1 px-2 py-2">
          <Pressable
            onPress={onClose}
            accessibilityLabel={t('common.back')}
            className="h-11 w-11 items-center justify-center rounded-pill"
          >
            <Ionicons name="arrow-back" size={24} color={c.textPrimary} />
          </Pressable>
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-pill bg-canvas-raise px-3.5">
            <Ionicons name="business-outline" size={17} color={c.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.institutionsPlaceholder')}
              placeholderTextColor={c.textFaint}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('search.institutionsPlaceholder')}
              style={{
                flex: 1,
                color: c.textPrimary,
                fontFamily: 'Inter_400Regular',
                fontSize: 16,
                padding: 0,
              }}
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityLabel={t('common.clear')}
                haptic={false}
              >
                <Ionicons name="close-circle" size={18} color={c.textFaint} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View className="px-4 pt-3">
            {/* The whole approved directory, filtered as you type. */}
            <OrganisationList
              organisations={organisations}
              query={query}
              onQuery={setQuery}
              mode="single"
              loading={loading}
              failed={failed}
              onChoose={(id) => {
                onClose();
                onOpenOrganisation(id);
              }}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
