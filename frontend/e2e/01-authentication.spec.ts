import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

test.describe('Stellana Authentication Tests', () => {

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveURL(/\/login/);

    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]'
    ).first();

    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    ).first();

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await expect(
      page.getByRole('button', { name: /login|log in|sign in/i })
    ).toBeVisible();
  });


  test('invalid email format is rejected by API validation', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'not-an-email',
        password: 'SomePassword123!',
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();

    expect(body.error).toBe('Bad Request');
    expect(body.fieldErrors).toBeTruthy();
  });


  test('wrong credentials are rejected', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'playwright.invalid@example.com',
        password: 'DefinitelyWrongPassword123!',
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();

    expect(body.message).toMatch(
      /invalid email address or password/i
    );
  });


  test('protected endpoint rejects unauthenticated user', async ({ request }) => {
    const response = await request.get('/api/auth/me');

    expect(response.status()).toBe(401);
  });


  test('valid credentials return JWT token and user', async ({ request }) => {
    test.skip(
      !TEST_EMAIL || !TEST_PASSWORD,
      'TEST_EMAIL or TEST_PASSWORD is missing.'
    );

    const response = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe('string');

    expect(body.user).toBeTruthy();

    console.log(
      'Authenticated user:',
      body.user?.email ?? body.user?.name ?? 'User returned'
    );
  });


  test('valid JWT can access current user endpoint', async ({ request }) => {
    test.skip(
      !TEST_EMAIL || !TEST_PASSWORD,
      'TEST_EMAIL or TEST_PASSWORD is missing.'
    );

    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });

    expect(loginResponse.status()).toBe(200);

    const loginBody = await loginResponse.json();

    expect(loginBody.token).toBeTruthy();

    const meResponse = await request.get('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${loginBody.token}`,
      },
    });

    expect(meResponse.status()).toBe(200);

    const me = await meResponse.json();

    expect(me).toBeTruthy();
  });


  test('valid user can login through the website UI', async ({ page }) => {
    test.skip(
      !TEST_EMAIL || !TEST_PASSWORD,
      'TEST_EMAIL or TEST_PASSWORD is missing.'
    );

    await page.goto('/login');

    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]'
    ).first();

    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    ).first();

    await emailInput.fill(TEST_EMAIL!);
    await passwordInput.fill(TEST_PASSWORD!);

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

    await expect(page).not.toHaveURL(/\/login$/);
  });

});
