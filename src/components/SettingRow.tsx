import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';

/**
 * One row of a settings list.
 *
 * There were three copies of this — in the reporter's settings tab, in the
 * account panel inside it, and in the organisation's account screen — and they
 * had already drifted: one truncated its value and the others did not, and
 * making the rows bigger meant editing the same twenty lines three times and
 * hoping none was missed. Now the size lives in one place, which is the only
 * way "make them bigger" stays a one-line change.
 *
 * **Sizes go through `style`.** NativeWind compiles this project's stylesheet
 * when Metro boots, from the class names present in `src` at that moment, so a
 * class no file has used before is silently absent until Metro restarts — the
 * row then renders with no padding at all and nothing says why. Numbers here
 * cannot fail that way, and that is what the rest of the app does.
 */

/**
 * The row's height floor, and its breathing room.
 *
 * 76pt against a 44pt minimum tap target. These are one-handed, often-hurried
 * taps — a reporter turning off Wi-Fi-only uploads on the way to something, an
 * operator signing out of a shared phone — and the cost of an oversized row is
 * a little scrolling, while the cost of an undersized one is the wrong tap on a
 * list where one of the rows deletes an account.
 */
const MIN_HEIGHT = 76;
const PADDING_Y = 18;

export interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** The current setting, shown on the right. Truncated rather than wrapped. */
  value?: string;
  /** Destructive actions — sign out, delete. Colour reinforces, words carry it. */
  danger?: boolean;
  onPress?: () => void;
  /** Set false on the last row of a panel, where a rule reads as a stray line. */
  divider?: boolean;
}

export function SettingRow({
  icon,
  label,
  value,
  danger,
  onPress,
  divider = true,
}: SettingRowProps) {
  const c = useColors();

  return (
    <Pressable
      onPress={onPress}
      // A row with nothing to do is text, not a button: without this it takes a
      // tap, fires a haptic, and announces itself to a screen reader as
      // something that can be activated.
      disabled={!onPress}
      accessibilityLabel={label}
      style={{ minHeight: MIN_HEIGHT, paddingVertical: PADDING_Y, paddingHorizontal: 16 }}
      className={
        divider
          ? 'flex-row items-center gap-4 border-b border-hairline/[0.08]'
          : 'flex-row items-center gap-4'
      }
    >
      <Ionicons name={icon} size={24} color={danger ? c.danger : c.textMuted} />
      {/* `title-md` is 18px — a step up from the 15px body these rows started
          at, and the size at which a label is readable at arm's length. */}
      <Text variant="title-md" tone={danger ? 'danger' : 'primary'} className="flex-1">
        {label}
      </Text>
      {value ? (
        <Text variant="body" tone="muted" numberOfLines={1} className="max-w-[45%]">
          {value}
        </Text>
      ) : null}
      {/* No chevron on a row that goes nowhere — it would promise a screen that
          does not open. */}
      {onPress ? <Ionicons name="chevron-forward" size={20} color={c.textFaint} /> : null}
    </Pressable>
  );
}
