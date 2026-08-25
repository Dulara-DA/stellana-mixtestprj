import { expect, test } from '@playwright/test';

test.describe('Public Quick Tunnel Read-only Smoke', () => {
  test('Cloudflare URL serves frontend, health, authentication and dashboard GETs', async ({
    request,
  }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL ?? '');
    test.skip(
      !baseURL.includes('.trycloudflare.com'),
      'Set PLAYWRIGHT_BASE_URL to the current trycloudflare.com Quick Tunnel URL.',
    );

    const root = await request.get('/');
    expect(root.status()).toBe(200);
    expect(root.headers()['content-type']).toContain('text/html');

    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual(
      expect.objectContaining({ status: 'UP', database: 'UP' }),
    );

    const origin = new URL(baseURL).origin;
    const preflight = await request.fetch('/api/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(preflight.status()).toBe(204);

    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;
    if (!email || !password) {
      throw new Error('TEST_EMAIL or TEST_PASSWORD is missing from .env.playwright');
    }
    const login = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const loginBody = (await login.json()) as {
      token: string;
      user: { id: number; role: string };
    };
    expect(loginBody.token).toBeTruthy();
    expect(loginBody.user.role).toBe('SYSTEM_ADMIN');
    const headers = {
      Authorization: `Bearer ${loginBody.token}`,
      Origin: origin,
    };

    const me = await request.get('/api/auth/me', { headers });
    expect(me.status()).toBe(200);
    expect((await me.json()).id).toBe(loginBody.user.id);

    const safeDashboardEndpoints = [
      '/api/dashboard',
      '/api/batches',
      '/api/blanking/compound-stock',
      '/api/moulding/presses',
      '/api/production-manager/summary',
      '/api/production-manager/records',
    ];
    for (const endpoint of safeDashboardEndpoints) {
      const response = await request.get(endpoint, { headers });
      expect(response.status(), `${endpoint} should be reachable`).toBe(200);
      expect(response.status(), `${endpoint} must not return a server error`).toBeLessThan(500);
    }
  });
});
