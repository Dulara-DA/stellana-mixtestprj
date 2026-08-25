import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/admin.json';

setup('authenticate as SYSTEM_ADMIN', async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL or TEST_PASSWORD is missing from .env.playwright'
    );
  }

  await page.goto('/login');

  const emailInput = page.locator(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]'
  ).first();

  const passwordInput = page.locator(
    'input[type="password"], input[name="password"]'
  ).first();

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const loginResponsePromise = page.waitForResponse(
    response =>
      response.url().includes('/api/auth/login') &&
      response.request().method() === 'POST'
  );

  await page.getByRole('button', {
    name: /login|log in|sign in/i,
  }).click();

  const loginResponse = await loginResponsePromise;

  expect(loginResponse.status()).toBe(200);

  const body = await loginResponse.json();

  expect(body.token).toBeTruthy();
  expect(body.user).toBeTruthy();

  await expect(page).not.toHaveURL(/\/login$/);

  await page.context().storageState({
    path: authFile,
  });

  console.log(
    'SYSTEM_ADMIN authentication saved:',
    body.user?.email ?? 'authenticated user'
  );
});
