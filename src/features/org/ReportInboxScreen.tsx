import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, Glass, Pressable, Text } from '@/components/ui';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { categoryColor, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { toast } from '@/stores/toastStore';
import { RequireRole } from './RequireRole';
import { useRole } from './useRole';

type TriageStatus = 'new' | 'in_review' | 'actioned' | 'dismissed';

const STATUS_TONE: Record<TriageStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  new: 'neutral',
  in_review: 'warning',
  actioned: 'success',
  dismissed: 'danger',
};

/**
 * The org report inbox — triage, not browsing.
 *
 * Bulk selection exists because triage is repetitive: an operator clearing a
 * morning's reports acts on twenty at a time, and forcing one tap per report
 * is what makes people stop using an inbox.
 */
export function ReportInboxScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { can } = useRole();

  const [filter, setFilter] = useState<TriageStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, TriageStatus>>({});

  const rows = useMemo(
    () => SAMPLE_INCIDENTS.filter((i) => !filter || (statuses[i.id] ?? 'new') === filter),
    [filter, statuses],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyToSelection = useCallback(
    (status: TriageStatus) => {
      setStatuses((prev) => {
        const next = { ...prev };
        selected.forEach((id) => (next[id] = status));
        return next;
      });
      toast.success(t('org.statusApplied', { count: selected.size }), t(`org.status.${status}`));
      setSelected(new Set());
    },
    [selected, t],
  );

  const selectionMode = selected.size > 0;

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-lg">{t('org.inbox')}</Text>
            <Text variant="caption" tone="muted">
              {t('org.inboxCount', { count: rows.length })}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip
            label={t('common.all')}
            selected={filter === null}
            onPress={() => setFilter(null)}
          />
          {(['new', 'in_review', 'actioned', 'dismissed'] as TriageStatus[]).map((s) => (
            <Chip
              key={s}
              label={t(`org.status.${s}`)}
              selected={filter === s}
              onPress={() => setFilter(filter === s ? null : s)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerClassName="gap-2 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + (selectionMode ? 110 : 32) }}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((incident) => {
          const status = statuses[incident.id] ?? 'new';
          const isSelected = selected.has(incident.id);
          return (
            <Pressable
              key={incident.id}
              onPress={() =>
                selectionMode ? toggle(incident.id) : router.push(`/incident/${incident.id}`)
              }
              onLongPress={() => can('triage_reports') && toggle(incident.id)}
              accessibilityLabel={incident.description}
              accessibilityState={{ selected: isSelected }}
            >
              <Glass
                elevation="low"
                className={
                  isSelected
                    ? 'flex-row gap-3 rounded-lg border border-accent p-3'
                    : 'flex-row gap-3 rounded-lg p-3'
                }
              >
                {selectionMode ? (
                  <View className="justify-center">
                    <View
                      className={
                        isSelected
                          ? 'h-5 w-5 items-center justify-center rounded-pill bg-accent'
                          : 'h-5 w-5 rounded-pill border border-hairline/30'
                      }
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={12} color={c.textOnDark} />
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <View className="overflow-hidden rounded-sm">
                    <Image
                      source={{ uri: incident.media.posterUrl }}
                      style={{ width: 52, height: 62 }}
                      contentFit="cover"
                      transition={140}
                    />
                  </View>
                )}

                <View className="flex-1 gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: categoryColor[incident.category],
                      }}
                    />
                    <Text variant="caption" tone="muted" className="uppercase">
                      {t(`category.${incident.category}`)}
                    </Text>
                    {incident.capturedAtIso ? (
                      <Text variant="caption" tone="faint">
                        · {formatRelativeTime(incident.capturedAtIso)}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="body-sm" numberOfLines={2}>
                    {incident.description}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Badge label={t(`org.status.${status}`)} tone={STATUS_TONE[status]} />
                    {incident.location.label ? (
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {incident.location.label}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Glass>
            </Pressable>
          );
        })}

        {!can('triage_reports') ? (
          <View className="pt-2">
            <RequireRole capability="triage_reports">
              <View />
            </RequireRole>
          </View>
        ) : null}
      </ScrollView>

      {/* Bulk action bar */}
      {selectionMode ? (
        <View
          className="absolute bottom-0 left-0 right-0 gap-2 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Text variant="caption" tone="muted">
            {t('org.selectedCount', { count: selected.size })}
          </Text>
          <View className="flex-row gap-2">
            <Button
              label={t('org.status.in_review')}
              variant="glass"
              size="sm"
              className="flex-1"
              onPress={() => applyToSelection('in_review')}
            />
            <Button
              label={t('org.status.actioned')}
              size="sm"
              className="flex-1"
              onPress={() => applyToSelection('actioned')}
            />
            <Button
              label={t('org.status.dismissed')}
              variant="glass"
              size="sm"
              className="flex-1"
              onPress={() => applyToSelection('dismissed')}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
