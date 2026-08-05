import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_EXPIRED_EVENT,
  ApiClient,
  markAuthenticatedSession,
} from './client';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    document.cookie = 'ln_admin_csrf=csrf-test';
  });

  it('uses same-origin credentials and the CSRF token for mutations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new ApiClient('/api/v1/admin');

    await client.request('/users/u-1/status', {
      method: 'PATCH',
      body: { status: 'SUSPENDED' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf-test');
    expect(init?.body).toBe(JSON.stringify({ status: 'SUSPENDED' }));
  });

  it('does not require CSRF before login and stores the returned token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ admin: { id: 'a1' }, csrfToken: 'fresh-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new ApiClient('/api/v1/admin');

    await client.request('/auth/login', {
      method: 'POST',
      skipCsrf: true,
      body: { username: 'operator', password: 'not-a-secret' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('x-csrf-token')).toBeNull();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.request('/auth/logout', { method: 'POST' });
    const [, logoutInit] = fetchMock.mock.calls[1];
    expect(new Headers(logoutInit?.headers).get('x-csrf-token')).toBe('fresh-token');
  });

  it('normalizes structured API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'PLAN_IN_USE', message: 'cannot delete' } }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new ApiClient('/api/v1/admin');

    await expect(client.request('/plans/p-1', { method: 'DELETE' })).rejects.toMatchObject({
      status: 409,
      code: 'PLAN_IN_USE',
      message: 'cannot delete',
    });
  });

  it('does not report an expired session for an anonymous initial request', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    const client = new ApiClient('/api/v1/admin');

    await expect(client.request('/auth/me')).rejects.toMatchObject({ status: 401 });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  it('reports a genuinely expired authenticated session exactly once', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    const client = new ApiClient('/api/v1/admin');
    markAuthenticatedSession();

    await expect(client.request('/dashboard')).rejects.toMatchObject({ status: 401 });
    await expect(client.request('/dashboard')).rejects.toMatchObject({ status: 401 });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });
});
