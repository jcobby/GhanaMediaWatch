import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface SparklineProps {
  values: readonly number[];
  height?: number;
  /** Emphasises the final point, which is the one people actually read. */
  highlightLast?: boolean;
}

/**
 * A bar sparkline for report volume.
 *
 * Bars rather than a line: with fourteen daily counts the individual days are
 * the information, and a smoothed line implies a continuity that daily totals
 * do not have. Rendered as flex children so it needs no charting dependency
 * and no SVG.
 */
export function Sparkline({ values, height = 44, highlightLast = true }: SparklineProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);

  return (
    <View className="flex-row items-end gap-1" style={{ height }}>
      {values.map((value, index) => {
        const isLast = highlightLast && index === values.length - 1;
        return (
          <View
            key={index}
            className="flex-1 overflow-hidden rounded-xs"
            // A floor of 3px keeps a zero-count day visible as a day rather
            // than vanishing into the baseline.
            style={{ height: Math.max(3, (value / max) * height) }}
          >
            <LinearGradient
              colors={isLast ? ['#5B3DF5', '#2563EB'] : ['#C7C0F7', '#B9CBF5']}
              style={{ flex: 1 }}
            />
          </View>
        );
      })}
    </View>
  );
}
