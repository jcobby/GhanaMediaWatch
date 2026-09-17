import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_COMMISSION_RATES, sanitiseCommissionRates, type CommissionRates } from './commission';

/**
 * The commission rates in force on this phone.
 *
 * Set by the platform on the console and served at `GET /v1/settings` under
 * `commissions`. Until that answer arrives — or if the service does not carry
 * them yet — the built-in defaults stand, so the estimate a reporter sees is
 * never blank. Everything served is clamped like anything typed into a form.
 *
 * Read once per launch, the same way the top-story settings are.
 */

let served: CommissionRates | null = null;
let loading = false;
const listeners = new Set<() => void>();

export function commissionRates(): CommissionRates {
  return served ?? DEFAULT_COMMISSION_RATES;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadCommissionRates(): Promise<void> {
  if (served || loading) return;
  const origin = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (process.env.EXPO_PUBLIC_API_MODE !== 'http' || !origin) return;

  loading = true;
  try {
    const res = await fetch(`${origin}/v1/settings`, {
      headers: { 'X-Tunnel-Skip-AntiPhishing-Page': 'true' },
    });
    if (!res.ok) return;
    const body = (await res.json()) as { commissions?: unknown };
    // No `commissions` block: the service does not carry rates yet. Keep the defaults.
    if (!body.commissions || typeof body.commissions !== 'object') return;
    served = sanitiseCommissionRates(body.commissions);
    for (const listener of listeners) listener();
  } catch {
    // Offline, or the service is down. The defaults stand.
  } finally {
    loading = false;
  }
}

/** The rates in force, re-rendering when the service's answer arrives. */
export function useCommissionRates(): CommissionRates {
  const rates = useSyncExternalStore(subscribe, commissionRates, commissionRates);
  useEffect(() => {
    void loadCommissionRates();
  }, []);
  return rates;
}
