import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Sheet, Text } from '@/components/ui';
import { Flag } from '@/components/Flag';
import { useColors } from '@/lib/theme';
import { COUNTRIES, type Country } from '@/types/countries';

/**
 * Which country's reports you are reading.
 *
 * **One answer today, and the sheet says so rather than implying otherwise.**
 * Every report the platform holds is Ghanaian — there is no country on an
 * incident and no country filter on the feed — so Ghana is chosen and the rest
 * are listed under a heading that states plainly that there is nothing to show
 * for them. A picker that offered six countries and returned the same feed for
 * all of them would be the worst version of this control.
 *
 * The wording is deliberate. "Not yet covered" is a fact; "coming soon" is a
 * date, and nobody here can keep it.
 *
 * When the service grows a country field and a filter, `covered` on the entry
 * becomes true and this screen needs no change at all.
 */
export function CountryPicker({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: Country;
  onSelect: (country: Country) => void;
}) {
  const { t } = useTranslation();

  const covered = COUNTRIES.filter((c) => c.covered);
  const rest = COUNTRIES.filter((c) => !c.covered);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('feed.countryTitle')}
      subtitle={t('feed.countrySubtitle')}
    >
      <View className="gap-1">
        {covered.map((country) => (
          <CountryRow
            key={country.code}
            country={country}
            selected={country.code === selected.code}
            onPress={() => {
              onSelect(country);
              onClose();
            }}
          />
        ))}

        {rest.length > 0 ? (
          <View className="mt-4 gap-1">
            <Text variant="label" tone="muted">
              {t('feed.countryNotYet')}
            </Text>
            <Text variant="caption" tone="faint" className="mb-1">
              {t('feed.countryNotYetHelp')}
            </Text>
            {rest.map((country) => (
              <CountryRow key={country.code} country={country} selected={false} />
            ))}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * A row, pressable only where there is something behind it.
 *
 * An uncovered country renders as a plain row rather than a disabled button:
 * a control that looks tappable and refuses is a worse answer than one that
 * never invited the tap. The flag stays at full strength — dimming a national
 * flag to say "no data" reads as a judgement about the country.
 */
function CountryRow({
  country,
  selected,
  onPress,
}: {
  country: Country;
  selected: boolean;
  onPress?: () => void;
}) {
  const c = useColors();

  const body = (
    <>
      <Flag design={country.flag} size={26} />
      <Text variant="body" tone={onPress ? 'primary' : 'muted'} className="flex-1">
        {country.name}
      </Text>
      {selected ? <Ionicons name="checkmark" size={20} color={c.accent} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View className="flex-row items-center gap-4 rounded-md px-2" style={{ minHeight: 48 }}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={country.name}
      className="flex-row items-center gap-4 rounded-md px-2"
      style={{ minHeight: 52 }}
    >
      {body}
    </Pressable>
  );
}
