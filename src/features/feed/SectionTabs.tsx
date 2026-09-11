import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { NEWS_SECTIONS, type NewsSection } from '@/types/sections';

/**
 * The masthead's section strip.
 *
 * Sits on the dark header rather than on the page, which is how a newspaper
 * masthead works and how every news app on a Ghanaian phone already looks —
 * the sections belong to the publication, not to the list underneath.
 *
 * "Latest" is first and is not a section: it is the absence of one. Naming it
 * matters, because a reader who has narrowed to Environment needs an obvious
 * way back and an unlabelled default does not give them one.
 */
export function SectionTabs({
  selected,
  onSelect,
}: {
  selected: NewsSection | null;
  onSelect: (section: NewsSection | null) => void;
}) {
  const { t } = useTranslation();
  const scroller = useRef<ScrollView>(null);

  /*
   * Where each tab sits in the strip, measured as it lays out.
   *
   * Needed because the desk can change without the strip being touched — a
   * swipe on the feed moves it — and the selected tab is then somewhere off
   * to the side with nothing indicating which way. Reading positions from
   * layout rather than computing them from label lengths keeps this correct
   * when the font, the locale or the padding changes.
   */
  const spans = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);

  const key = selected ?? 'latest';

  const measure = useCallback(
    (id: string) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      spans.current.set(id, { x, width });
    },
    [],
  );

  useEffect(() => {
    const span = spans.current.get(key);
    if (!span) return;

    // Centre it when there is room, rather than scrolling it just barely into
    // view: a tab flush against the edge reads as the end of the strip, and
    // hides that there are more desks that way.
    const x = span.x + span.width / 2 - viewport.current / 2;
    scroller.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [key]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 6 }}
      onLayout={(e) => {
        viewport.current = e.nativeEvent.layout.width;
      }}
    >
      <Tab
        label={t('feed.latest')}
        active={selected === null}
        onPress={() => onSelect(null)}
        onMeasure={measure('latest')}
      />
      {NEWS_SECTIONS.map((section) => (
        <Tab
          key={section}
          label={t(`section.${section}`)}
          active={selected === section}
          onPress={() => onSelect(selected === section ? null : section)}
          onMeasure={measure(section)}
        />
      ))}
    </ScrollView>
  );
}

function Tab({
  label,
  active,
  onPress,
  onMeasure,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onMeasure: (e: LayoutChangeEvent) => void;
}) {
  return (
    <Pressable
      onLayout={onMeasure}
      onPress={onPress}
      haptic={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className="px-3.5 pb-2.5 pt-1"
    >
      <Text
        variant="body-sm"
        onMedia
        className={active ? 'font-sans-semibold uppercase' : 'font-sans-medium uppercase'}
        style={{
          letterSpacing: 0.7,
          // Inactive labels are dimmed rather than recoloured: on a dark
          // masthead a grey that reads as "secondary" on white reads as
          // "disabled" instead.
          opacity: active ? 1 : 0.6,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>

      {/* Accent, not the category hue — a section spans several categories and
          borrowing one of their colours would imply it was that one. */}
      <View
        className="absolute bottom-0 left-3.5 right-3.5 rounded-t-pill bg-accent-bright"
        style={{ height: 3, opacity: active ? 1 : 0 }}
      />
    </Pressable>
  );
}
