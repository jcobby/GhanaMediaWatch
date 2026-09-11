import { create } from 'zustand';
import type { IncidentCategory } from '@/types/api';
import type { OrganisationAccount } from '@/types/dawuro';

interface OrganisationState {
  /**
   * Interest overrides, keyed by organisation id.
   *
   * Seeded interests live in `ORGANISATIONS` and are never mutated — a demo that
   * edits its own fixtures cannot be reset by signing out and back in. An
   * organisation that has changed its interests gets an entry here; one that
   * has not is absent, and falls through to the seeded list.
   */
  interestOverrides: Record<string, IncidentCategory[]>;
  setInterests: (businessId: string, interests: IncidentCategory[]) => void;
  resetInterests: (businessId: string) => void;
}

export const useBusinessStore = create<OrganisationState>((set) => ({
  interestOverrides: {},

  setInterests: (businessId, interests) =>
    set((state) => ({
      interestOverrides: { ...state.interestOverrides, [businessId]: interests },
    })),

  resetInterests: (businessId) =>
    set((state) => {
      const next = { ...state.interestOverrides };
      delete next[businessId];
      return { interestOverrides: next };
    }),
}));

/**
 * What this organisation actually receives right now.
 *
 * Routing, the inbox and the account screen all resolve interests through this
 * one function, so an edit on the account screen changes the inbox rather than
 * just the chips the officer is looking at.
 */
export function effectiveInterests(organisation: OrganisationAccount): IncidentCategory[] {
  return useBusinessStore.getState().interestOverrides[organisation.id] ?? organisation.interests;
}

/** Reactive form of {@link effectiveInterests}, for use inside components. */
export function useEffectiveInterests(organisation: OrganisationAccount): IncidentCategory[] {
  return useBusinessStore((s) => s.interestOverrides[organisation.id]) ?? organisation.interests;
}
