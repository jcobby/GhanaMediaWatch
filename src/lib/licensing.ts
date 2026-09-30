import type { VettingState } from '@/types/api';

/**
 * Whether a report may be licensed at all, before price or plan.
 *
 * **The phone offered the button on everything and let the service refuse.**
 * An operator tapped "License this report" on an integrity-flagged report and
 * got "Not available on this account — contact your organisation's
 * administrator", which is an account-permissions message for what is actually
 * a fact about the report. It sent them to an administrator who could not have
 * helped, about a refusal that was correct.
 *
 * The rule itself is the server's and the console's: licensing charges the
 * organisation *and pays the reporter*, so material the platform cannot stand
 * behind must not be sellable. `restricted` is the mobile collapse of
 * `integrity_flagged` and `disputed`; `rejected` failed review outright.
 *
 * Kept as one function rather than a condition in the screen, because the
 * inbox row, the detail screen and anything added later must agree — a list
 * that offers what the next screen refuses is the same bug one step earlier.
 */
export function canLicense(state: VettingState): boolean {
  return state !== 'restricted' && state !== 'rejected';
}

/**
 * Why licensing is refused, or null when it is on offer.
 *
 * Returns the *reason*, not a translation key. Building the key here and a
 * second one from it at the call site — `t(`${blocked}Body`)` — is how copy
 * goes missing silently: a constructed key matches no literal in the source,
 * so the orphan check cannot see it is used and i18n cannot see it is absent.
 * The caller names both strings in full.
 *
 * The two reasons are told apart because they are different things to be told:
 * `rejected` is final, `restricted` is waiting on an editor and may yet clear.
 */
export function licenceRefusal(state: VettingState): 'rejected' | 'restricted' | null {
  if (state === 'rejected') return 'rejected';
  if (state === 'restricted') return 'restricted';
  return null;
}
