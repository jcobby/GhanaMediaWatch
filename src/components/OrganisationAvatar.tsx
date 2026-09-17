import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/ui';

/** Deep enough to carry white initials on the light page and the dark bar alike. */
const HUES = ['#1D68D6', '#127A3E', '#C25708', '#6D3BD4', '#0E7C88', '#B32E6E', '#3F5A8C'];

/**
 * An organisation's logo, or its initials when it has none.
 *
 * `logoUrl` is null for every organisation the directory lists today, so the
 * initials are the common case rather than a fallback — a coloured circle that
 * is the same colour every time for the same name, the way a contact list does
 * it, so an organisation is recognisable at a glance in a list of twenty.
 */
export function OrganisationAvatar({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;

  if (logoUrl && !failed) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#FFFFFF' }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        // A broken logo becomes initials, not an empty circle.
        onError={() => setFailed(true)}
      />
    );
  }

  const initials =
    name
      .split(/\s+/)
      .filter((word) => /[A-Za-z0-9]/.test(word))
      .slice(0, 2)
      .map((word) => word.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase())
      .join('') || '?';
  const hue = HUES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % HUES.length]!;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: hue,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text className="font-sans-semibold" style={{ color: '#FFFFFF', fontSize: Math.round(size * 0.38) }}>
        {initials}
      </Text>
    </View>
  );
}
