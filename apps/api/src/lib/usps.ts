import type { Env } from '../env.js';

const USPS_OAUTH_URL = 'https://apis.usps.com/oauth2/v3/token';
const USPS_ADDRESS_URL = 'https://apis.usps.com/addresses/v3/address';
const REQUEST_TIMEOUT_MS = 5000;

export interface AddressInput {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
}

export interface NormalizedAddress {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  zip4?: string;
}

export type UspsVerificationStatus = 'verified' | 'failed' | 'unavailable';

export interface UspsVerificationResult {
  status: UspsVerificationStatus;
  normalized?: NormalizedAddress;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const res = await fetch(USPS_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.USPS_CLIENT_ID,
      client_secret: env.USPS_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`USPS OAuth token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    // Refresh a bit early to avoid a request racing against expiry.
    expiresAt: Date.now() + (data.expires_in - 30) * 1000,
  };
  return cachedToken.token;
}

/**
 * Verifies/standardizes a US address against USPS APIs v3. Always degrades
 * gracefully rather than throwing: missing credentials, timeouts, and
 * transport errors all resolve to `unavailable` so a technician can still
 * submit (flagged for payroll admin follow-up) per design plan §7. A USPS
 * "no match" response resolves to `failed`, which the caller should surface
 * to the technician for correction.
 */
export async function verifyAddressWithUsps(env: Env, address: AddressInput): Promise<UspsVerificationResult> {
  if (!env.USPS_CLIENT_ID || !env.USPS_CLIENT_SECRET) {
    return { status: 'unavailable' };
  }

  try {
    const token = await getAccessToken(env);
    const params = new URLSearchParams({
      streetAddress: address.addressLine1,
      city: address.city,
      state: address.state,
      ZIPCode: address.zip,
    });
    if (address.addressLine2) params.set('secondaryAddress', address.addressLine2);

    let res = await fetch(`${USPS_ADDRESS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 401 || res.status === 403) {
      // Cached token was rejected before its recorded expiry (early
      // revocation, clock skew) — drop it and retry once with a fresh one.
      cachedToken = null;
      const freshToken = await getAccessToken(env);
      res = await fetch(`${USPS_ADDRESS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${freshToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }

    if (res.status === 404) {
      // A definite "no match" — a real failure, not an outage.
      return { status: 'failed' };
    }
    if (res.status === 400) {
      // Ambiguous: USPS returns 400 for both malformed requests and some
      // unmatchable addresses. Log it for diagnosis but don't tell the
      // technician their (possibly valid) address is wrong — degrade to
      // unavailable instead.
      console.error('USPS address request returned 400:', await res.text().catch(() => '<unreadable body>'));
      return { status: 'unavailable' };
    }
    if (!res.ok) {
      return { status: 'unavailable' };
    }

    const data = (await res.json()) as {
      address?: {
        streetAddress?: string;
        city?: string;
        state?: string;
        ZIPCode?: string;
        ZIPPlus4?: string;
      };
    };
    if (!data.address?.streetAddress) {
      return { status: 'failed' };
    }

    return {
      status: 'verified',
      normalized: {
        addressLine1: data.address.streetAddress,
        city: data.address.city ?? address.city,
        state: data.address.state ?? address.state,
        zip: data.address.ZIPCode ?? address.zip,
        zip4: data.address.ZIPPlus4,
      },
    };
  } catch {
    // Timeout, network failure, or unexpected shape — treat as an outage,
    // not a rejection of the address.
    return { status: 'unavailable' };
  }
}
