import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ADDRESS = { addressLine1: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * `verifyAddressWithUsps` caches its OAuth token at module scope, so each
 * test re-imports the module fresh (vi.resetModules) to avoid one test's
 * cached token leaking into the next.
 */
async function freshModule() {
  vi.resetModules();
  return import('./index.js');
}

describe('verifyAddressWithUsps — outage/degradation behavior', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('degrades to unavailable when credentials are not configured (no network call)', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    const result = await verifyAddressWithUsps({}, ADDRESS);
    expect(result).toEqual({ status: 'unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades to unavailable on a network/timeout failure', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    vi.mocked(fetch).mockRejectedValue(new Error('network outage'));
    const result = await verifyAddressWithUsps(
      { USPS_CLIENT_ID: 'id', USPS_CLIENT_SECRET: 'secret' },
      ADDRESS,
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('degrades to unavailable on a non-4xx/2xx USPS error (e.g. 500)', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const result = await verifyAddressWithUsps(
      { USPS_CLIENT_ID: 'id', USPS_CLIENT_SECRET: 'secret' },
      ADDRESS,
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('degrades to unavailable (not failed) on a 400, logging for diagnosis', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await verifyAddressWithUsps(
      { USPS_CLIENT_ID: 'id', USPS_CLIENT_SECRET: 'secret' },
      ADDRESS,
    );
    expect(result).toEqual({ status: 'unavailable' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('resolves to failed on a definite USPS 404 no-match', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    const result = await verifyAddressWithUsps(
      { USPS_CLIENT_ID: 'id', USPS_CLIENT_SECRET: 'secret' },
      ADDRESS,
    );
    expect(result).toEqual({ status: 'failed' });
  });

  it('retries once with a fresh token on a 401, then succeeds', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'stale-tok', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fresh-tok', expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          address: { streetAddress: '123 Main St', city: 'Austin', state: 'TX', ZIPCode: '78701', ZIPPlus4: '1234' },
        }),
      );
    const result = await verifyAddressWithUsps(
      { USPS_CLIENT_ID: 'id', USPS_CLIENT_SECRET: 'secret' },
      ADDRESS,
    );
    expect(result.status).toBe('verified');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('resolves to verified with the normalized address on success', async () => {
    const { verifyAddressWithUsps } = await freshModule();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          address: { streetAddress: '123 MAIN ST', city: 'AUSTIN', state: 'TX', ZIPCode: '78701', ZIPPlus4: '4321' },
        }),
      );
    const result = await verifyAddressWithUsps(
      { USPS_CLIENT_ID: 'id', USPS_CLIENT_SECRET: 'secret' },
      ADDRESS,
    );
    expect(result).toEqual({
      status: 'verified',
      normalized: { addressLine1: '123 MAIN ST', city: 'AUSTIN', state: 'TX', zip: '78701', zip4: '4321' },
    });
  });
});
