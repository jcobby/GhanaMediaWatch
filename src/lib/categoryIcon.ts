import type { Ionicons } from '@expo/vector-icons';
import type { IncidentCategory } from '@/types/api';

/**
 * A glyph per category.
 *
 * Drawn over a placeholder so a row says what kind of thing it is before a
 * word is read. The feed is scanned, not read — someone thumbing past six
 * reports takes in shape and colour long before they parse "Culvert completely
 * blocked at the Kaneshie junction".
 *
 * These are deliberately literal rather than clever. A flame means fire. An
 * abstract mark would need learning, and nobody is going to learn an icon set
 * to find out whether their street flooded.
 */
export const categoryIcon: Record<IncidentCategory, keyof typeof Ionicons.glyphMap> = {
  fire: 'flame',
  accident: 'car-sport',
  disorder: 'people',
  infrastructure: 'construct',
  utility: 'flash',
  corruption: 'briefcase',
  whistleblower: 'megaphone',
  environment: 'leaf',
  wildlife: 'paw',
  flood: 'water',
  crime: 'shield-half',
  health: 'medkit',
  other: 'ellipsis-horizontal',
};
