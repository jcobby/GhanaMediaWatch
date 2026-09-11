import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, EmptyState, Glass, Text } from '@/components/ui';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { ORGANISATIONS } from '@/api/dawuroData';
import { categoryHue, colors } from '@/lib/theme';
import { formatCount, formatRelativeTime } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import type { Incident } from '@/types/api';

/**
 * Reports this organisation has licensed, and what it did with them.
 *
 * This screen is where the product's loop closes. An organisation licenses a report
 * privately, and then chooses whether to release it to the public feed — that
 * release is how a citizen's footage becomes public information, and it is the
 * organisation's decision, not an automatic consequence of buying it.
 *
 * Crediting is deliberate too: a released report carries the organisation's
 * name, so the public can see who acted.
 */
export function PublishedScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const organisation = ORGANISATIONS.find((b) => b.id === profile?.orgId) ?? ORGANISATIONS[1]!;

  // Stands in for the licensed set until the API provides it.
  const licensed = useMemo(() => SAMPLE_INCIDENTS.slice(0, 4), []);
  const [released, setReleased] = useState<Set<string>>(new Set([licensed[0]!.id]));

  const release = (incident: Incident) => {
    setReleased((prev) => new Set(prev).add(incident.id));
    toast.success(
      t('published.releasedTitle'),
      t('published.releasedBody', { name: organisation.name }),
    );
  };

  const withhold = (incident: Incident) => {
    setReleased((prev) => {
      const next = new Set(prev);
      next.delete(incident.id);
      return next;
    });
    toast.info(t('published.withheldTitle'), t('published.withheldBody'));
  };

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-1 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <Text variant="display-md">{t('published.title')}</Text>
        <Text variant="body-sm" tone="muted">
          {t('published.subtitle', { count: released.size, total: licensed.length })}
        </Text>
      </View>

      {licensed.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title={t('published.emptyTitle')}
          description={t('published.emptyBody')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          showsVerticalScrollIndicator={false}
        >
          {licensed.map((incident) => {
            const isReleased = released.has(incident.id);
            return (
              <Glass key={incident.id} elevation="low" className="gap-3 rounded-lg p-3.5">
                <View className="flex-row gap-3">
                  <View className="overflow-hidden rounded-sm">
                    <Image
                      source={{ uri: incident.media.posterUrl }}
                      style={{ width: 60, height: 72 }}
                      contentFit="cover"
                      transition={140}
                    />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <View className="flex-row items-center gap-2">
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: categoryHue(incident.category),
                        }}
                      />
                      <Text variant="caption" tone="muted" className="uppercase">
                        {t(`category.${incident.category}`)}
                      </Text>
                      <Text variant="caption" tone="faint">
                        · {formatRelativeTime(incident.capturedAtIso)}
                      </Text>
                    </View>
                    <Text variant="body-sm" numberOfLines={2}>
                      {incident.description}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      {isReleased ? (
                        <Badge label={t('published.live')} tone="success" />
                      ) : (
                        <Badge label={t('published.heldPrivate')} />
                      )}
                      {isReleased ? (
                        <Text variant="caption" tone="muted">
                          {formatCount(incident.counts.reactions)} {t('feed.react').toLowerCase()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                {isReleased ? (
                  <View className="gap-2 border-t border-hairline/[0.07] pt-3">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text variant="caption" tone="muted" className="flex-1">
                        {t('published.creditedTo', { name: organisation.name })}
                      </Text>
                    </View>
                    <Button
                      label={t('published.withhold')}
                      variant="glass"
                      size="sm"
                      onPress={() => withhold(incident)}
                    />
                  </View>
                ) : (
                  <View className="gap-2 border-t border-hairline/[0.07] pt-3">
                    <Text variant="caption" tone="muted">
                      {t('published.releaseHelp')}
                    </Text>
                    <Button
                      label={t('published.release')}
                      size="sm"
                      onPress={() => release(incident)}
                      leading={
                        <Ionicons name="megaphone-outline" size={14} color={colors.textOnDark} />
                      }
                    />
                  </View>
                )}
              </Glass>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
