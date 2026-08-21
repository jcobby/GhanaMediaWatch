import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/api';
import { session } from '@/services/session';
import { PLATFORM_OWNERS, findDemoLogin } from '@/api/dawuroData';
import type { AccountType } from '@/types/dawuro';

const PROFILE_KEY = 'gmw.profile';
const ONBOARDED_KEY = 'gmw.onboarded';

export type Role = 'owner' | 'admin' | 'analyst' | 'viewer' | null;

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  /** Which of the three experiences this account sees. */
  accountType: AccountType;
  orgId: string | null;
  orgName: string | null;
  role: Role;
  /** Reporter handle, shown on the routing desk and the public feed. */
  handle: string | null;
}

interface AuthState {
  /** Null means the caller is a device identity only — no account. */
  profile: Profile | null;
  hydrated: boolean;
  onboarded: boolean;

  hydrate: () => Promise<void>;
  signIn: (email: string, displayName?: string) => Promise<void>;
  /** Platform operators are seeded, so this checks a provisioned access code. */
  signInAsPlatformOwner: (email: string, accessCode: string) => Promise<void>;
  /** Signs in as a business account. Registration is a separate flow. */
  signInAsBusiness: (businessId: string, businessName: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

/**
 * Account state.
 *
 * Signing in is an *upgrade* of an existing device identity, not a replacement:
 * reports already queued under the device token stay queued and keep uploading.
 * Requiring an account before anyone can file a report would defeat the point
 * of an anonymous reporting app.
 */
export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  hydrated: false,
  onboarded: false,

  hydrate: async () => {
    try {
      const [rawProfile, onboarded] = await Promise.all([
        SecureStore.getItemAsync(PROFILE_KEY),
        SecureStore.getItemAsync(ONBOARDED_KEY),
      ]);
      set({
        profile: rawProfile ? (JSON.parse(rawProfile) as Profile) : null,
        onboarded: onboarded === 'true',
        hydrated: true,
      });
    } catch {
      // A corrupt or unavailable keychain must not block launch — the app
      // simply behaves as a fresh install.
      set({ profile: null, onboarded: false, hydrated: true });
    }
  },

  signIn: async (email, displayName) => {
    const tokens = await api.signIn({ email, ...(displayName ? { displayName } : {}) });
    await session.save(tokens);

    /*
     * A seeded demo account signs in as whatever it is — business, operator or
     * reporter — so all three experiences are reachable from one form. Anyone
     * else is a reporter, which is the correct default: the public does not
     * apply for an account type.
     */
    const demo = findDemoLogin(email);
    const name = displayName ?? demo?.displayName ?? email.split('@')[0]!;

    const profile: Profile = {
      id: email,
      email,
      displayName: name,
      accountType: demo?.accountType ?? 'reporter',
      orgId: demo?.businessId ?? null,
      orgName:
        demo?.businessName ?? (demo?.accountType === 'platform_owner' ? 'Dawuro Platform' : null),
      role: demo?.accountType === 'platform_owner' ? 'owner' : demo?.businessId ? 'admin' : null,
      handle:
        demo?.accountType === 'reporter' || !demo
          ? `@${name.toLowerCase().replace(/\s+/g, '')}`
          : null,
    };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  signInAsPlatformOwner: async (email, accessCode) => {
    /*
     * Platform operators are never self-registered. The role can route reports,
     * approve businesses and release payouts — an open sign-up form must not be
     * able to create it. Real deployments provision these out of band; here the
     * credentials are seeded so the module can be demonstrated.
     */
    const owner = PLATFORM_OWNERS.find(
      (o) => o.email.toLowerCase() === email.trim().toLowerCase() && o.accessCode === accessCode,
    );
    if (!owner) throw new Error('Those credentials were not recognised.');

    const profile: Profile = {
      id: owner.id,
      email: owner.email,
      displayName: owner.displayName,
      accountType: 'platform_owner',
      orgId: null,
      orgName: 'Dawuro Platform',
      role: 'owner',
      handle: null,
    };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  signInAsBusiness: async (businessId, businessName, email) => {
    const tokens = await api.signIn({ email });
    await session.save(tokens);
    const profile: Profile = {
      id: email,
      email,
      displayName: email.split('@')[0]!,
      accountType: 'business',
      orgId: businessId,
      orgName: businessName,
      role: 'admin',
      handle: null,
    };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
    // The session is cleared too, so the next request re-registers a device
    // identity. Queued reports survive — they belong to the device, not the
    // account.
    await session.clear();
    set({ profile: null });
  },

  completeOnboarding: async () => {
    await SecureStore.setItemAsync(ONBOARDED_KEY, 'true');
    set({ onboarded: true });
  },
}));
