import { create } from 'zustand';
import { commentsFor } from '@/api/commentsData';
import type { DraftComment, IncidentComment } from '@/types/comments';

interface CommentsState {
  /**
   * Comments added during this session, keyed by incident.
   *
   * Seeded fixtures are never mutated — a demo that edits its own fixtures
   * cannot be reset by restarting. Added comments live here and are merged on
   * read, so the seeded set stays intact underneath.
   */
  added: Record<string, IncidentComment[]>;
  /** Reaction overrides, keyed by comment id. */
  reacted: Record<string, boolean>;

  add: (incidentId: string, draft: DraftComment, authorHandle: string) => void;
  toggleReaction: (commentId: string) => void;
}

let counter = 0;

export const useCommentsStore = create<CommentsState>((set) => ({
  added: {},
  reacted: {},

  add: (incidentId, draft, authorHandle) =>
    set((state) => {
      counter += 1;
      const comment: IncidentComment = {
        id: `cmt_local_${counter}`,
        incidentId,
        author: {
          handle: draft.postAnonymously ? 'Anonymous' : authorHandle,
          avatarUrl: null,
          isAnonymous: draft.postAnonymously,
        },
        body: draft.body.trim(),
        media: draft.media,
        createdAtIso: new Date().toISOString(),
        // A comment carrying footage is a contribution to the record rather
        // than an opinion about it, and is surfaced differently.
        isContribution: draft.media !== null,
        reactions: 0,
        viewerHasReacted: false,
      };
      return {
        added: {
          ...state.added,
          [incidentId]: [...(state.added[incidentId] ?? []), comment],
        },
      };
    }),

  toggleReaction: (commentId) =>
    set((state) => ({
      reacted: { ...state.reacted, [commentId]: !state.reacted[commentId] },
    })),
}));

/**
 * Seeded comments plus anything added this session, oldest first.
 *
 * Ordering is deliberate: a report's comments are a record of what happened
 * next, and reading a record backwards makes no sense. It also means a newly
 * posted comment appears at the bottom where the composer already is.
 */
export function useComments(incidentId: string): IncidentComment[] {
  const added = useCommentsStore((s) => s.added[incidentId]);
  const reacted = useCommentsStore((s) => s.reacted);

  const all = [...commentsFor(incidentId), ...(added ?? [])];

  return all.map((comment) => {
    const override = reacted[comment.id];
    if (override === undefined) return comment;
    return {
      ...comment,
      viewerHasReacted: override,
      reactions: comment.reactions + (override ? 1 : 0),
    };
  });
}
