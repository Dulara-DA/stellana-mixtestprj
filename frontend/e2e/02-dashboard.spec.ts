import { test, expect, Page } from '@playwright/test';

/**
 * Verify that a protected Stellana route:
 *  - loads successfully
 *  - does not redirect back to /login
 *  - renders visible page content
 */
async function verifyProtectedPage(
  page: Page,
  route: string,
  pageName: string
) {
  const response = await page.goto(route, {
    waitUntil: 'domcontentloaded',
  });

  expect(
    response,
    `${pageName}: navigation response should exist`
  ).not.toBeNull();

  if (response) {
    expect(
      response.status(),
      `${pageName}: HTTP status should be below 400`
    ).toBeLessThan(400);
  }

  await expect(page.locator('body')).toBeVisible();

  /**
   * SYSTEM_ADMIN should stay on the requested route
   * instead of being redirected to /login.
   */
  await expect(page).not.toHaveURL(/\/login/);

  const currentPath = new URL(page.url()).pathname;

  expect(
    currentPath,
    `${pageName}: should remain on ${route}`
  ).toBe(route);
}


test.describe('Stellana Dashboard and Section Access', () => {

  test('SYSTEM_ADMIN can access section selection home page', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/',
      'Section Selection'
    );
  });


  test('SYSTEM_ADMIN can access Mixing dashboard', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/mixing',
      'Mixing Dashboard'
    );
  });


  test('SYSTEM_ADMIN can access Production Manager dashboard', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/production-manager',
      'Production Manager Dashboard'
    );
  });


  test('SYSTEM_ADMIN can access Blanking dashboard', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/blanking',
      'Blanking Dashboard'
    );
  });


  test('SYSTEM_ADMIN can access Moulding dashboard', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/moulding',
      'Moulding Dashboard'
    );
  });


  test('SYSTEM_ADMIN can access Blanking to Moulding dashboard', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/blanking/moulding',
      'Blanking Moulding Dashboard'
    );
  });


  test('SYSTEM_ADMIN can access Users administration page', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/users',
      'Users Administration'
    );
  });


  test('SYSTEM_ADMIN can access Audit page', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/audit',
      'Audit'
    );
  });


  test('SYSTEM_ADMIN can access Notifications page', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/notifications',
      'Notifications'
    );
  });


  test('SYSTEM_ADMIN can access Mailbox page', async ({ page }) => {
    await verifyProtectedPage(
      page,
      '/mailbox',
      'Mailbox'
    );
  });


  test('unknown route safely redirects to home page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page).toHaveURL(/\/$/);

    await expect(page.locator('body')).toBeVisible();
  });


  test('authenticated session remains valid when navigating between sections', async ({ page }) => {
    await page.goto('/mixing');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/blanking');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/moulding');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/production-manager');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/users');
    await expect(page).not.toHaveURL(/\/login/);
  });

});
