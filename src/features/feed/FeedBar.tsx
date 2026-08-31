import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { GnaHorizontal } from '@/components/Brand';
import { useColors } from '@/lib/theme';

/**
 * The bar above the category tabs.
 *
 * Deliberately one line. The previous header stacked a brand block, a tagline
 * and a filter row, which cost about a fifth of the screen before a single
 * report appeared — on a list layout whose whole point is how much fits, that
 * is the wrong trade.
 *
 * Search expands in place rather than pushing to its own screen, so the tabs
 * underneath stay put and the reader keeps their bearings.
 */
export function FeedBar({
  query,
  onQuery,
  searching,
  onToggleSearch,
  onOpenMap,
  onOpenSlides,
  onOpenBusinesses,
}: {
  query: string;
  onQuery: (value: string) => void;
  searching: boolean;
  onToggleSearch: () => void;
  onOpenMap: () => void;
  onOpenSlides: () => void;
  onOpenBusinesses: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center gap-2 bg-canvas-soft px-4 pb-2.5 pt-1">
      {searching ? (
        <View className="h-9 flex-1 flex-row items-center gap-2 rounded-sm bg-canvas-raise px-3">
          <Ionicons name="search" size={15} color={c.textFaint} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder={t('feed.searchPlaceholder')}
            placeholderTextColor={c.textFaint}
            autoFocus
            accessibilityLabel={t('feed.search')}
            style={{
              flex: 1,
              color: c.textPrimary,
              fontFamily: 'Inter_400Regular',
              fontSize: 15,
            }}
          />
        </View>
      ) : (
        // Two brands, one bar. GNA owns the platform; Dawuro is the product.
        // A hairline between them is how a co-brand is normally read — set
        // side by side with only a gap they look like one long name, and
        // "GNA Dawuro" is not what either is called.
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <GnaHorizontal height={28} />
          <View className="h-5 w-px bg-hairline/15" />
          <Text variant="title-sm" className="shrink font-display" numberOfLines={1}>
            {t('app.name')}
          </Text>
        </View>
      )}

      <Pressable
        onPress={onToggleSearch}
        accessibilityLabel={t('feed.search')}
        className="h-9 w-9 items-center justify-center rounded-pill"
      >
        <Ionicons name={searching ? 'close' : 'search'} size={19} color={c.textPrimary} />
      </Pressable>

      {!searching ? (
        <>
          {/*
            Slides sits first and is the only filled control in the bar.
            It is a different way to read the same feed rather than a utility
            like search or the map, and it needs to be found without being
            explained.
          */}
          <Pressable
            onPress={onOpenSlides}
            accessibilityLabel={t('slides.open')}
            className="h-9 flex-row items-center gap-1.5 rounded-pill bg-accent px-3"
          >
            <Ionicons name="play" size={13} color={c.textOnDark} />
            <Text variant="caption" onMedia className="font-sans-semibold">
              {t('slides.label')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onOpenBusinesses}
            accessibilityLabel={t('businesses.title')}
            className="h-9 w-9 items-center justify-center rounded-pill"
          >
            <Ionicons name="business-outline" size={19} color={c.textPrimary} />
          </Pressable>

          <Pressable
            onPress={onOpenMap}
            accessibilityLabel={t('feed.map')}
            className="h-9 w-9 items-center justify-center rounded-pill"
          >
            <Ionicons name="map-outline" size={19} color={c.textPrimary} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
