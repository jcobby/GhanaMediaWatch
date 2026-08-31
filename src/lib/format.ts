import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from 'date-fns';
import type { TimePrecision } from '@/types/api';

/**
 * Display formatters.
 *
 * Every one of these takes a nullable input where the API can suppress a value
 * via display flags, and returns null rather than a placeholder — callers must
 * decide what absence looks like, so a hidden value can never leak as "unknown"
 * text that implies the data exists.
 */

/** "12m", "3h", "2d". Compact because it sits in a chip over video. */
export function formatRelativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { addSuffix: false })
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y');
}

/** "820 m" under a kilometre, "5.2 km" above. */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** "2.4K", "8.1K", "1.2M" — feed counts, not exact figures. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Coordinates for display, always 6 dp (~0.11 m). Null stays null. */
export function formatCoordinate(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value.toFixed(6);
}

/**
 * The exact capture moment, rendered to whatever precision the reporter allowed.
 *
 * Returns null when nothing may be shown, so callers omit the row entirely
 * rather than printing "Unknown" — which would imply the value does not exist
 * when in fact it is deliberately withheld.
 */
export function formatExactCapture(iso: string | null, precision: TimePrecision): string | null {
  if (!iso || precision === 'hidden') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  if (precision === 'date_only') {
    return isThisYear(date) ? format(date, 'd MMM') : format(date, 'd MMM yyyy');
  }

  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
  if (isThisYear(date)) return format(date, 'd MMM, h:mm a');
  return format(date, 'd MMM yyyy, h:mm a');
}

/**
 * Full timestamp for the detail view and any evidence context — seconds and
 * timezone included, because a report used to dispatch a patrol needs to be
 * unambiguous about when it was taken.
 */
export function formatFullTimestamp(iso: string | null, precision: TimePrecision): string | null {
  if (!iso || precision === 'hidden') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (precision === 'date_only') return format(date, 'EEEE, d MMMM yyyy');
  return format(date, "EEEE, d MMMM yyyy 'at' h:mm:ss a");
}
