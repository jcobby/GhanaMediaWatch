import { useMemo, useState } from 'react';
import { Modal, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { useFeed } from '@/hooks/useIncidents';
import { useColors } from '@/lib/theme';
import { FeedRow } from './FeedRow';
import type { Incident } from '@/types/api';

/**
 * How many reports search pulls in, as against the feed's twenty.
 *
 * The feed asks for a screenful because that is what it draws. Search was handed
 * that same screenful and filtered it in memory, so typing a word from the
 * fortieth report answered "no report matches" — a statement about the archive,
 * made on the strength of one page of it, and false. The searchable fraction
 * shrank every time anything was published.
 *
 * This does not make search whole; only the service can, and
 * `GET /incidents?q=` is the ask. It widens the window and, more importantly,
 * the empty state below now says what it actually looked at.
 */
const SEARCH_PAGE = 100;

/**
 * How many reports are shown before anybody types.
 *
 * Enough to be worth scrolling, short of rebuilding the feed inside a modal —
 * somebody who wants the whole feed already has it one tap away behind the back
 * arrow. Typing replaces these with matches from the full loaded set, not from
 * these twenty.
 */
const BROWSE_ROWS = 20;

/**
 * Searching reports. Only reports.
 *
 * This screen used to carry two tabs — reports and organisations — so one button
 * opened a search that might be about either, and finding an institution meant
 * first noticing the tab. Two different questions were sharing one field.
 *
 * They are two buttons and two screens now: the magnifier asks "what happened",
 * the building asks "who is on Dawuro". Neither can be mistaken for the other,
 * and neither makes the reader pick a mode before typing.
 */
export function SearchOverlay({
  organisationIncidents,
  onOpenIncident,
  onClose,
}: {
  /**
   * One organisation's reports when its homepage is open, `null` on GNA's.
   *
   * Null is not "none" — it means unscoped, and the overlay fetches its own
   * wider page. An organisation's own feed is already the whole of what it has
   * published, so there is nothing to widen there.
   */
  organisationIncidents: Incident[] | null;
  onOpenIncident: (incident: Incident) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  /*
   * Only fetched while this screen is open — the overlay is mounted on demand,
   * so an unopened search costs nothing.
   */
  const wide = useFeed({ limit: SEARCH_PAGE });
  const scoped = organisationIncidents !== null;
  /*
   * Memoised because it feeds the filter below. A fresh `[]` on every render
   * would change that hook's dependencies each time and re-filter continuously
   * while somebody is typing.
   */
  const pool = useMemo(
    () => organisationIncidents ?? wide.data?.items ?? [],
    [organisationIncidents, wide.data],
  );
  const poolLoading = !scoped && wide.isPending;

  const q = query.trim().toLowerCase();
  const stories = useMemo(
    () =>
      q
        ? pool.filter(
            (incident) =>
              incident.description.toLowerCase().includes(q) ||
              (incident.location.label ?? '').toLowerCase().includes(q),
          )
        : [],
    [pool, q],
  );

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
            <Ionicons name="search" size={17} color={c.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder')}
              placeholderTextColor={c.textFaint}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('search.placeholder')}
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
          {/*
           * No lead and no rotation here: a result list has a first row, not a
           * top story, and stamping one on whatever matched would be the app
           * asserting an editorial judgement nobody made.
           */}
          {poolLoading ? (
            <Text variant="body-sm" tone="muted" className="px-6 py-10 text-center">
              {t('search.loading')}
            </Text>
          ) : !q ? (
            /*
              Reports, before anybody types.

              An empty search screen with a line of instructions on it asks the
              reader to already know what they are looking for. Most people open
              search to browse — they half-remember something, or they want to
              see what is there — and a blank page answers neither. The reports
              are already loaded for the filter below, so showing them costs
              nothing and turns a dead screen into a readable one.
            */
            pool.length === 0 ? (
              <Text variant="body-sm" tone="muted" className="px-6 py-10 text-center">
                {t('search.hint')}
              </Text>
            ) : (
              <>
                <Text variant="label" tone="muted" className="px-4 pb-1 pt-4">
                  {t('search.recent')}
                </Text>
                {pool.slice(0, BROWSE_ROWS).map((incident) => (
                  <FeedRow
                    key={incident.id}
                    incident={incident}
                    onOpen={(chosen) => {
                      onClose();
                      onOpenIncident(chosen);
                    }}
                  />
                ))}
              </>
            )
          ) : poolLoading ? (
            <Text variant="body-sm" tone="muted" className="px-6 py-10 text-center">
              {t('search.loading')}
            </Text>
          ) : stories.length === 0 ? (
            /*
              The empty state names what it searched.

              "No report matches" was a claim about everything ever published,
              made after reading one page of it. Somebody looking for a report
              they had seen the week before was told it did not exist. Saying
              how many reports were actually looked at is the difference
              between a narrow answer and a wrong one.
            */
            <Text variant="body-sm" tone="muted" className="px-6 py-10 text-center">
              {t('search.noStories', { query: query.trim(), count: pool.length })}
            </Text>
          ) : (
            <>
              {stories.map((incident) => (
                <FeedRow
                  key={incident.id}
                  incident={incident}
                  onOpen={(chosen) => {
                    onClose();
                    onOpenIncident(chosen);
                  }}
                />
              ))}
              {/* Said under results too, so a short list is not read as the whole of it. */}
              <Text variant="caption" tone="faint" className="px-6 py-5 text-center">
                {t('search.scopeNote', { count: pool.length })}
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
