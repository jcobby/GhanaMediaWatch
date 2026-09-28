/**
 * A Ghanaian mobile money number, as the service stores it.
 *
 * `PUT /me/payout-msisdn` takes the international form (`+233241234567`), and
 * people type it every way there is: `024 123 4567`, `0241234567`,
 * `233241234567`, `+233 24 123 4567`. All of those are the same wallet.
 *
 * Returns null for anything that is not a nine-digit Ghanaian number after the
 * country code — so a typo is caught on the phone, where the reporter can fix
 * it, rather than as a failed payout weeks later.
 */
export function toGhanaMsisdn(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  let national: string;
  if (digits.startsWith('233') && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 10) national = digits.slice(1);
  else if (digits.length === 9) national = digits;
  else return null;

  // Ghanaian mobile numbers start 2 or 5 after the leading zero (024, 020, 055…).
  if (!/^[25]\d{8}$/.test(national)) return null;
  return `+233${national}`;
}
