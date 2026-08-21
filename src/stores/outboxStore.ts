import { create } from 'zustand';
import { incidentsRepository } from '@/db/incidentsRepository';
import type { OutboxRecord } from '@/features/outbox/outboxMachine';

interface OutboxState {
  records: OutboxRecord[];
  pendingCount: number;
  /** Re-reads the table. Called by the sync engine after every transition. */
  refresh: () => void;
}

/**
 * A live view of the outbox table.
 *
 * Zustand rather than TanStack Query because the sync engine is not React — it
 * runs from NetInfo callbacks and a background task, and needs to push updates
 * into the UI from outside the component tree. `refresh()` is callable from
 * anywhere; TanStack's invalidation would need a client reference threaded
 * through non-React code.
 */
export const useOutboxStore = create<OutboxState>((set) => ({
  records: [],
  pendingCount: 0,
  refresh: () => {
    try {
      set({
        records: incidentsRepository.listAll(),
        pendingCount: incidentsRepository.countPending(),
      });
    } catch (cause) {
      // The database may not be initialised yet on the very first frame.
      // An empty outbox is the correct rendering in that moment.
      console.warn('[outbox] refresh failed', cause);
    }
  },
}));
