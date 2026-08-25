import { test, expect } from '@playwright/test';

test.describe('Stellana System Health', () => {

  test('frontend application loads successfully', async ({ page }) => {
    const response = await page.goto('/');

    expect(response).not.toBeNull();

    if (response) {
      expect(response.status()).toBeLessThan(400);
    }

    await expect(page.locator('body')).toBeVisible();
  });

  test('login page loads successfully', async ({ page }) => {
    const response = await page.goto('/login');

    expect(response).not.toBeNull();

    if (response) {
      expect(response.status()).toBeLessThan(400);
    }

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('backend health endpoint responds successfully', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data.status).toBe('UP');
  });

  test('database reports healthy status', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data.database).toBe('UP');
  });

  test('health endpoint returns valid timestamp', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data.timestamp).toBeTruthy();

    const timestamp = new Date(data.timestamp);

    expect(timestamp.toString()).not.toBe('Invalid Date');
  });

});
