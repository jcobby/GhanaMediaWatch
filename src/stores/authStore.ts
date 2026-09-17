import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/api';
import { session } from '@/services/session';
import { setOnSignedOut } from '@/api/http';
import { toast } from '@/stores/toastStore';
import i18n from '@/i18n';
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
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account, then signs it in. */
  register: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Rename the account on the service, then on this phone. Throws on refusal. */
  updateDisplayName: (displayName: string) => Promise<void>;
  /** Delete the account on the service, then clear this phone. Throws on refusal. */
  deleteAccount: () => Promise<void>;
  /** Called by the API client when a signed-in session cannot be refreshed. */
  forceSignedOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /**
   * Show the introduction again.
   *
   * It explains what is recorded when a report is filed anonymously, which is
   * the one thing somebody is most likely to want to re-read — and until now
   * the only way back to it was to uninstall the app.
   */
  replayOnboarding: () => Promise<void>;
}

/**
 * Account state.
 *
 * Signing in is an *upgrade* of an existing device identity, not a replacement:
 * reports already queued under the device token stay queued and keep uploading.
 * Requiring an account before anyone can file a report would defeat the point
 * of an anonymous reporting app.
 */
/**
 * The organisation this account belongs to, if the server grants it one.
 *
 * **This used to be a probe, and the probe stopped working.** Membership was
 * inferred from whether `/org/dashboard` refused the caller — a stand-in for a
 * `GET /me` that did not exist when it was written. Then the service began
 * scoping organisation routes with an `X-Dawuro-Org` header and refusing them
 * without one, which this call could not send: the id it would have named was
 * the thing it was calling the endpoint to find out. So it was refused every
 * time, the refusal was read as "not a member", and **every organisation
 * account on this phone silently became a reporter.**
 *
 * `/me` answers the question directly and needs no scope, because it is about
 * the caller rather than about an organisation. A refusal here is still not an
 * error worth surfacing — it simply makes them a reporter, which is the common
 * case and the right default.
 */
async function describeOrg(): Promise<{ id: string; name: string } | null> {
  try {
    const me = await api.getCaller();

    /*
     * The default membership first, then any membership.
     *
     * `orgId` is the server's own answer for the common case, and the
     * memberships list is read as a fallback because somebody can belong to an
     * organisation without it being their default — the console found the
     * top-level field null on accounts whose list was not.
     */
    const named = me.orgId
      ? me.memberships.find((m) => m.orgId === me.orgId)
      : me.memberships.find((m) => m.orgId);
    const id = me.orgId ?? named?.orgId ?? null;
    if (!id) return null;

    // A name the server did not send is not a reason to drop the membership;
    // the account screens fall back to the id rather than to being a reporter.
    return { id, name: named?.name ?? id };
  } catch {
    return null;
  }
}

/**
 * A profile written before the vocabulary changed.
 *
 * `accountType` was `'business'` and is now `'organisation'` — the same party,
 * renamed with everything else a person reads. The value is derived on the
 * client and never crosses the wire, so nothing about the contract moved, but
 * it *is* written to the keychain: a phone that signed in yesterday holds the
 * old spelling.
 *
 * Without this it does not fail loudly. `'business' === 'organisation'` is
 * merely false, so the account quietly stops matching the organisation checks
 * and the person is shown the reporter's app instead — signed in, with none of
 * their inbox, and nothing on screen to explain it.
 *
 * Cheap to keep and safe to delete once no installed build predates the rename.
 */
function migrateProfile(profile: Profile): Profile {
  const stored: string = (profile as { accountType: string }).accountType;
  return stored === 'business' ? { ...profile, accountType: 'organisation' } : profile;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  hydrated: false,
  onboarded: false,

  hydrate: async () => {
    try {
      const [rawProfile, onboarded, stored] = await Promise.all([
        SecureStore.getItemAsync(PROFILE_KEY),
        SecureStore.getItemAsync(ONBOARDED_KEY),
        session.read(),
      ]);

      /*
       * A profile is only real if a session supports it.
       *
       * **This is the "Create an account to see this" bug, and it came back.**
       * The token and the profile are two stores, and the code that keeps them
       * in step is a set of callbacks that fire at the moment an account is
       * demoted to a guest. Every one of them has to run, in order, before the
       * app is killed — and if any does not, a device session and somebody's
       * name and email survive together into the next launch. What the reporter
       * sees is their own account at the top of the screen above an invitation
       * to create one, with every count at zero, because `/me/*` correctly
       * refuses a device token.
       *
       * So this stops relying on the callbacks having fired and checks the
       * thing that is actually true: only a `user` session means an account.
       * Ordering makes that safe to assert — signing in writes the session
       * before the profile, so a profile without a user session behind it is
       * always the stale one.
       *
       * Cleared from the keychain as well as from memory, or the same screen
       * comes back on the next launch.
       */
      if (rawProfile && stored?.kind !== 'user') {
        await SecureStore.deleteItemAsync(PROFILE_KEY);
        set({ profile: null, onboarded: onboarded === 'true', hydrated: true });
        return;
      }

      set({
        profile: rawProfile ? migrateProfile(JSON.parse(rawProfile) as Profile) : null,
        onboarded: onboarded === 'true',
        hydrated: true,
      });
    } catch {
      // A corrupt or unavailable keychain must not block launch — the app
      // simply behaves as a fresh install.
      set({ profile: null, onboarded: false, hydrated: true });
    }
  },

  signIn: async (email, password) => {
    const tokens = await api.signIn({ email, password });
    await session.save(tokens);

    /*
     * What this account is, asked of the server.
     *
     * This used to look the email up in a seeded list and grant whatever it
     * found — so signing in as one of a handful of hardcoded addresses gave the
     * phone an organisation or platform-operator experience, decided entirely on the
     * device. The password was checked upstream, but the *role* was not: the
     * client granted it to itself from a fixture.
     *
     * The API exposes nothing that describes the caller — there is no `/me`,
     * and the token carries no organisation or role — so the honest substitute
     * is to ask what this account can actually reach. Everyone else is a
     * reporter, which is the right default: the public does not apply for an
     * account type.
     */
    const org = await describeOrg();
    const name = org?.name ?? email.split('@')[0]!;

    const profile: Profile = {
      id: email,
      email,
      displayName: name,
      accountType: org ? 'organisation' : 'reporter',
      orgId: org?.id ?? null,
      orgName: org?.name ?? null,
      role: org ? 'admin' : null,
      handle: org ? null : `@${name.toLowerCase().replace(/\s+/g, '')}`,
    };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  register: async (email, password, displayName) => {
    /*
     * A real account creation, not a sign-in that happens to create one.
     *
     * The previous flow called the create-on-first-signin endpoint, so a
     * mistyped address at the *sign-in* box silently produced a second empty
     * account and the person could not work out where their reports had gone.
     * Registering explicitly means the server can say "that email is already
     * taken" — which is the useful answer.
     */
    const tokens = await api.register({ email, password, displayName });
    await session.save(tokens);
    const profile: Profile = {
      id: email,
      email,
      displayName,
      // The public does not apply for an account type.
      accountType: 'reporter',
      orgId: null,
      orgName: null,
      role: null,
      handle: `@${displayName.toLowerCase().replace(/\s+/g, '')}`,
    };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  /**
   * Drop the profile when the session can no longer be recovered.
   *
   * The API client owns the token and this store owns the profile, so a session
   * that dies without telling the store leaves the two disagreeing: the screen
   * keeps showing somebody's name and email while every `/me` request answers
   * 403, and the reports tab tells a signed-in person to create an account.
   */
  forceSignedOut: async () => {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
    set({ profile: null });
    toast.info(i18n.t('auth.sessionEndedTitle'), i18n.t('auth.sessionEndedBody'));
  },

  signOut: async () => {
    /*
     * Revoke the refresh token on the service first.
     *
     * Clearing the phone alone left that token valid on the server, so a
     * session somebody believed they had ended on a shared phone could still be
     * refreshed by anyone holding the token. A failure to reach the service does
     * not keep them signed in: the phone is cleared either way, because the
     * person asked to leave.
     */
    const stored = await session.read();
    if (stored?.kind === 'user' && stored.refreshToken) {
      await api.logout(stored.refreshToken).catch(() => undefined);
    }

    await SecureStore.deleteItemAsync(PROFILE_KEY);
    // The session is cleared too, so the next request re-registers a device
    // identity. Queued reports survive — they belong to the device, not the
    // account.
    await session.clear();
    set({ profile: null });
  },

  updateDisplayName: async (displayName) => {
    const name = displayName.trim();
    // Throws on refusal, so the screen can say why and keep what was typed.
    await api.updateProfile({ displayName: name });
    const current = useAuthStore.getState().profile;
    if (!current) return;
    const profile: Profile = { ...current, displayName: name };
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  deleteAccount: async () => {
    // Throws on refusal — outstanding commission, for one — and nothing is cleared.
    await api.deleteAccount();
    /*
     * The account is gone, so there is no refresh token left to revoke: clear the
     * phone directly rather than through `signOut`, which would try.
     */
    await SecureStore.deleteItemAsync(PROFILE_KEY);
    await session.clear();
    set({ profile: null });
  },

  completeOnboarding: async () => {
    await SecureStore.setItemAsync(ONBOARDED_KEY, 'true');
    set({ onboarded: true });
  },

  replayOnboarding: async () => {
    await SecureStore.deleteItemAsync(ONBOARDED_KEY);
    set({ onboarded: false });
  },
}));

/*
 * Wired at module load, not in a component.
 *
 * A session can expire during any request, including one fired before the
 * first screen mounts — so the handler has to be in place from the moment the
 * client can make a call.
 */
setOnSignedOut(() => {
  void useAuthStore.getState().forceSignedOut();
});
