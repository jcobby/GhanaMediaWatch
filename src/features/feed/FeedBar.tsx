import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Sheet, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { GnaHomeLogo } from '@/components/Brand';
import { OrganisationAvatar } from '@/components/OrganisationAvatar';
import type { DirectoryOrganisation } from '@/types/dawuro';

/**
 * The bar above the desks.
 *
 * On the GNA homepage: a menu, the lockup, and a search icon. Search is one
 * icon opening one screen — the bar used to carry a wide "Search organisations"
 * field that opened a sheet with a second search field inside it, which is two
 * fields for one job and a pattern nobody expects.
 *
 * On an organisation's homepage the bar becomes that organisation's: a back
 * arrow to GNA, its logo, its name.
 */
export function FeedBar({
  onOpenSearch,
  onOpenInstitutions,
  onOpenMap,
  onOpenSlides,
  onOpenBusinesses,
  organisation,
  onExitOrganisation,
}: {
  onOpenSearch: () => void;
  /** Search the directory of institutions, rather than reports. */
  onOpenInstitutions: () => void;
  onOpenMap: () => void;
  onOpenSlides: () => void;
  onOpenBusinesses: () => void;
  /** The organisation whose homepage this is, or null for the GNA homepage. */
  organisation: DirectoryOrganisation | null;
  onExitOrganisation: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  /** Close the menu first, so the next screen is not opened underneath it. */
  const choose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <>
      <View className="flex-row items-center px-2" style={{ height: 56 }}>
        {organisation ? (
          <>
            {/* Back to the GNA homepage. */}
            <Pressable
              onPress={onExitOrganisation}
              accessibilityLabel={t('feed.backToGna')}
              className="h-11 w-11 items-center justify-center rounded-pill"
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
            {/* The organisation's mark where GNA's was. */}
            <View style={{ marginLeft: 4 }}>
              <OrganisationAvatar name={organisation.name} logoUrl={organisation.logoUrl} size={32} />
            </View>
            <Text
              onMedia
              numberOfLines={1}
              className="ml-3 shrink font-sans-medium"
              style={{ fontSize: 19 }}
            >
              {organisation.name}
            </Text>
            {organisation.verified ? (
              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
            ) : null}
            <View className="flex-1" />
          </>
        ) : (
          <>
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={t('feed.menu')}
              className="h-11 w-11 items-center justify-center rounded-pill"
            >
              <Ionicons name="menu" size={26} color="#FFFFFF" />
            </Pressable>
            {/*
              The supplied mark, straight on the bar.

              The wordmark and the flag triangle and nothing else — no drums, no
              bells, no arc. Its lettering is recoloured for a dark ground (see
              `GnaHomeLogo`), so it needs no white tile behind it.

              24 rather than 30: with no second and third line of type under the
              mark, the letters carry it, and a wordmark that size sits level
              with the icons either side of it instead of crowding the bar.
            */}
            <GnaHomeLogo height={24} style={{ marginLeft: 8 }} />
            {/* The mark alone. A word beside it said what the screen already is. */}
            <View className="flex-1" />
          </>
        )}

        {/*
          Two searches, because they are two different questions.

          One screen with two tabs made finding an institution a second step
          behind a field that defaults to reports — and reports are what most
          people open this bar for, so the institution directory sat where
          nobody looked. A magnifier for reports and a building for institutions
          says which is which before either is tapped.
        */}
        <Pressable
          onPress={onOpenSearch}
          accessibilityLabel={t('search.reportsTitle')}
          className="h-11 w-11 items-center justify-center rounded-pill"
        >
          <Ionicons name="search" size={23} color="#FFFFFF" />
        </Pressable>
        <Pressable
          onPress={onOpenInstitutions}
          accessibilityLabel={t('search.institutionsTitle')}
          className="h-11 w-11 items-center justify-center rounded-pill"
        >
          <Ionicons name="business-outline" size={22} color="#FFFFFF" />
        </Pressable>

        {organisation ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityLabel={t('feed.menu')}
            className="h-11 w-11 items-center justify-center rounded-pill"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={t('app.name')}>
        <View className="gap-1">
          <MenuItem
            icon="play-circle-outline"
            label={t('slides.label')}
            onPress={choose(onOpenSlides)}
          />
          <MenuItem
            icon="business-outline"
            label={t('organisations.title')}
            onPress={choose(onOpenBusinesses)}
          />
          <MenuItem icon="map-outline" label={t('feed.map')} onPress={choose(onOpenMap)} />
        </View>
      </Sheet>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  // Theme tokens, not fixed greys: the sheet is light or dark with the app.
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="flex-row items-center gap-4 rounded-md px-2"
      style={{ minHeight: 52 }}
    >
      <Ionicons name={icon} size={22} color={c.textPrimary} />
      <Text variant="body" className="flex-1">
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
    </Pressable>
  );
}
