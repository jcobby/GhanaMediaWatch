import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { categoryColor, colors } from '@/lib/theme';
import type { IncidentCategory } from '@/types/api';

/**
 * Category tabs across the top of the feed.
 *
 * Tabs rather than the pill filters that were here before. Pills read as
 * optional refinements you may add; tabs read as the sections the thing is
 * divided into — which is what these are. It is also the arrangement every
 * news app on a Ghanaian phone already uses, so nobody has to learn it.
 *
 * "Latest" is first and is not a category: it is the absence of one. Naming it
 * rather than leaving an unlabelled default matters, because a reader who has
 * filtered to Flood needs somewhere obvious to go back to.
 */
export function CategoryTabs({
  selected,
  onSelect,
  available,
}: {
  selected: IncidentCategory | null;
  onSelect: (category: IncidentCategory | null) => void;
  /** Categories present in the feed, most common first. */
  available: IncidentCategory[];
}) {
  const { t } = useTranslation();
  const scroller = useRef<ScrollView>(null);

  // Returning to Latest scrolls the strip home. Without this, clearing a filter
  // leaves the reader looking at tabs from the middle of the list with the
  // active one off-screen behind them.
  useEffect(() => {
    if (selected === null) scroller.current?.scrollTo({ x: 0, animated: true });
  }, [selected]);

  return (
    <View className="border-b border-hairline/[0.08] bg-canvas-soft">
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        <Tab
          label={t('feed.latest')}
          active={selected === null}
          hue={colors.accent}
          onPress={() => onSelect(null)}
        />
        {available.map((category) => (
          <Tab
            key={category}
            label={t(`category.${category}`)}
            active={selected === category}
            hue={categoryColor[category]}
            onPress={() => onSelect(selected === category ? null : category)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Tab({
  label,
  active,
  hue,
  onPress,
}: {
  label: string;
  active: boolean;
  hue: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      haptic={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className="px-4 pb-2.5 pt-3"
    >
      <Text
        variant="body-sm"
        tone={active ? 'primary' : 'muted'}
        className={active ? 'font-sans-semibold uppercase' : 'font-sans-medium uppercase'}
        style={{ letterSpacing: 0.6 }}
        numberOfLines={1}
      >
        {label}
      </Text>

      {/* The underline carries the category's own hue, so the strip reads as
          coloured sections rather than one accent repeated. */}
      <View
        className="absolute bottom-0 left-3 right-3 rounded-t-pill"
        style={{ height: 3, backgroundColor: active ? hue : 'transparent' }}
      />
    </Pressable>
  );
}
