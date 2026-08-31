import { Platform, Share } from 'react-native';

/**
 * Sharing a report.
 *
 * One rule, and it is the reason this lives in its own file rather than inline
 * at each call site: **share the report, never the media file.**
 *
 * A playback URL points at footage that may be licensed, restricted, or
 * pending review, and once it is pasted into a group chat none of those
 * controls apply any more. The report page is the thing that carries the
 * context — who filmed it, when, where, what state the verification is in — and
 * it can be taken down. A raw file cannot.
 *
 * The link is built from `reportId`, not the internal `id`: it is the reference
 * stamped on the footage itself, so someone who was sent a clip and someone who
 * was sent this link can tell they are looking at the same report.
 */
export function incidentUrl(reportId: string): string {
  return `https://dawuro.gh/verify/${reportId}`;
}

export async function shareIncident(input: {
  reportId: string;
  description: string;
  /** Already-translated line naming the reference. */
  referenceLine: string;
}): Promise<void> {
  const url = incidentUrl(input.reportId);

  try {
    await Share.share({
      message: `${input.description}\n\n${input.referenceLine}\n${url}`,
      // iOS shows a proper link preview only when the URL is passed separately.
      // On Android the same value would be dropped, and some targets would then
      // receive the URL twice.
      ...(Platform.OS === 'ios' ? { url } : {}),
    });
  } catch {
    // Dismissing the share sheet is not an error worth surfacing.
  }
}
