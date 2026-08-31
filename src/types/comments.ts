import type { MediaKind } from './api';

/**
 * Media attached to a comment.
 *
 * Deliberately the same shape as incident media minus the provenance fields.
 * A comment's video is a contribution to a discussion, not a filed report — it
 * carries no GPS lock, no vetting state and earns no commission. Someone who
 * wants their footage to count as evidence files it, and that path runs through
 * the capture gate like everything else.
 */
export interface CommentMedia {
  kind: MediaKind;
  posterUrl: string;
  playbackUrl: string | null;
  durationMs: number | null;
}

export interface CommentAuthor {
  handle: string;
  avatarUrl: string | null;
  /** Anonymous authors show a generic handle; the device id is still recorded. */
  isAnonymous: boolean;
  /** Set when the author posts on behalf of a verified organisation. */
  organisationName?: string;
}

export interface IncidentComment {
  id: string;
  incidentId: string;
  author: CommentAuthor;
  body: string;
  /** Null for a plain text comment. */
  media: CommentMedia | null;
  createdAtIso: string;
  /**
   * True when this comment adds footage of the same event rather than an
   * opinion about it.
   *
   * This is how a second angle on one incident gets attached without inventing
   * a separate threading model: someone standing on the other side of the
   * street posts what they filmed, and it hangs off the report everyone is
   * already looking at. The distinction matters because these are evidence and
   * deserve to be findable as such, not buried in a reply list.
   */
  isContribution: boolean;
  reactions: number;
  viewerHasReacted: boolean;
}

/** What a composer produces before the server assigns identity and time. */
export interface DraftComment {
  body: string;
  media: CommentMedia | null;
  postAnonymously: boolean;
}
