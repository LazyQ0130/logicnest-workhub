import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createQichachaPkce,
  exchangeQichachaAuthorizationCode,
  extractQichachaAccessToken,
  startQichachaCallbackServer,
} from './qichachaMcpAuth';

describe('qichacha OAuth helpers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the verifier and derives the S256 challenge', () => {
    const pkce = createQichachaPkce();
    const expected = crypto.createHash('sha256').update(pkce.verifier).digest('base64url');
    expect(pkce.verifier).toHaveLength(86);
    expect(pkce.challenge).toBe(expected);
    expect(pkce.state).toHaveLength(43);
  });

  it('accepts the standard and provider-compatible token fields', () => {
    expect(extractQichachaAccessToken({ access_token: 'access-token' })).toBe('access-token');
    expect(extractQichachaAccessToken({ mcp_token: 'mcp-token' })).toBe('mcp-token');
    expect(extractQichachaAccessToken({ api_key: 'api-key' })).toBe('api-key');
    expect(extractQichachaAccessToken({ token: 'token' })).toBe('token');
    expect(extractQichachaAccessToken({})).toBeUndefined();
  });

  it('exchanges the callback code with PKCE and resource', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'qcc-token', token_type: 'Bearer' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await expect(exchangeQichachaAuthorizationCode({
      clientId: 'client',
      code: 'code',
      redirectUri: 'http://localhost:1234/callback',
      verifier: 'verifier',
    })).resolves.toBe('qcc-token');

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe('POST');
    expect(String(request?.body)).toContain('grant_type=authorization_code');
    expect(String(request?.body)).toContain('code_verifier=verifier');
    expect(String(request?.body)).toContain('resource=https%3A%2F%2Fagent.qcc.com%2Fmcp%2Fcompany%2Fstream');
  });

  it('accepts a valid callback and rejects a mismatched state', async () => {
    const callback = await startQichachaCallbackServer('expected-state');
    try {
      const invalid = await fetch(`${callback.redirectUri}?code=bad&state=wrong`);
      expect(invalid.status).toBe(400);

      const validResponse = await fetch(`${callback.redirectUri}?code=auth-code&state=expected-state`);
      expect(validResponse.status).toBe(200);
      await expect(callback.result).resolves.toEqual({ code: 'auth-code' });
    } finally {
      callback.close();
    }
  });
});
