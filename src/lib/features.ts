/**
 * Surfaces this build offers.
 *
 * A flag rather than deleted code: these screens are built, tested and working,
 * and the decision to hide them is a product one that may well be reversed.
 * Deleting them would make that reversal a rewrite; a flag makes it a word.
 */

/**
 * Whether the phone offers the institution tier — the organisation inbox, the
 * published archive, surveys, and the account that owns them.
 *
 * Off, deliberately. That work belongs to the web console: an officer
 * triaging footage needs a screen wide enough to read corroboration side by
 * side, and a phone is the wrong instrument for it. The console's own notes
 * say the same thing from the other direction — it is "for organisation and
 * platform owner only".
 *
 * The *public directory* is unaffected. `/organisations` lets any reader look up
 * an organisation, read what it has published and answer its surveys, and that
 * is a reader feature which has nothing to do with holding an account.
 */
export const ORGANISATION_TIER_ENABLED = false;
