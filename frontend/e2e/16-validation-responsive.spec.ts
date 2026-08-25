import { devices, expect, test } from '@playwright/test';
import { bearer, loginAsAdmin } from './helpers/workflows';

test.describe('Validation and Responsive Factory Access', () => {
  test('desktop users can drag and keyboard-scroll wide production tables', async ({ page }) => {
    await page.goto('/production-manager');
    const table = page.locator('.table-shell').first();
    await expect(table).toHaveAttribute('data-desktop-horizontal-scroll', 'true');
    await expect(table).toHaveAttribute('tabindex', '0');

    const dimensions = await table.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);

    await table.scrollIntoViewIfNeeded();
    const box = await table.boundingBox();
    expect(box).toBeTruthy();
    const viewportHeight = page.viewportSize()!.height;
    const dragY = Math.min(viewportHeight - 100, Math.max(100, box!.y + 100));
    await page.mouse.move(box!.x + box!.width - 80, dragY);
    await page.mouse.down();
    await page.mouse.move(box!.x + 80, dragY, { steps: 8 });
    await page.mouse.up();
    expect(await table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await table.evaluate((element) => { element.scrollLeft = 0 });
    await table.dispatchEvent('wheel', { deltaY: 160, shiftKey: true });
    expect(await table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await table.evaluate((element) => { element.scrollLeft = 0 });
    await table.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  test('key production DTOs return useful field validation without creating records', async ({
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const headers = bearer(auth.token);

    const invalidBatch = await request.post('/api/batches', {
      headers,
      data: {
        batchNumber: '',
        recipeRevisionId: null,
        plannedQuantityKg: 240.001,
        machine: '',
      },
    });
    expect(invalidBatch.status()).toBe(400);
    expect((await invalidBatch.json()).fieldErrors).toEqual(
      expect.objectContaining({
        batchNumber: expect.any(String),
        recipeRevisionId: expect.any(String),
        plannedQuantityKg: expect.any(String),
        machine: expect.any(String),
      }),
    );

    const invalidShortage = await request.post('/api/shortages', {
      headers,
      data: {
        pressId: null,
        requestedBlankQuantity: 0,
        requiredMaterialCode: '',
        requiredAt: null,
        priority: null,
        message: '',
      },
    });
    expect(invalidShortage.status()).toBe(400);
    expect((await invalidShortage.json()).fieldErrors).toEqual(
      expect.objectContaining({
        pressId: expect.any(String),
        requestedBlankQuantity: expect.any(String),
        requiredMaterialCode: expect.any(String),
        requiredAt: expect.any(String),
        priority: expect.any(String),
        message: expect.any(String),
      }),
    );

    const invalidBlanking = await request.post('/api/blanking/production-records', {
      headers,
      data: {
        batchNumber: '',
        materialCode: '',
        itemCode: '',
        millOperator: '',
        preformerOperator: '',
        cartNumber: '',
        quantity: 0,
        averageBlankWeightGrams: 0,
      },
    });
    expect(invalidBlanking.status()).toBe(400);
    const blankingFields = (await invalidBlanking.json()).fieldErrors;
    for (const field of [
      'batchNumber',
      'materialCode',
      'itemCode',
      'millOperator',
      'preformerOperator',
      'cartNumber',
      'quantity',
      'averageBlankWeightGrams',
    ]) {
      expect(blankingFields[field], `blanking validation ${field}`).toBeTruthy();
    }

    const invalidLab = await request.post('/api/lab/samples/999999999/results', {
      headers,
      data: {
        decision: null,
        additionalResults: [{ testName: '', resultValue: '', unit: 'TBC' }],
      },
    });
    expect(invalidLab.status()).toBe(400);
    expect((await invalidLab.json()).fieldErrors).toEqual(
      expect.objectContaining({
        decision: expect.any(String),
        'additionalResults[0].testName': expect.any(String),
        'additionalResults[0].resultValue': expect.any(String),
      }),
    );
  });

  test('Pixel-sized login and home remain usable with large touch controls', async ({
    browser,
  }, testInfo) => {
    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();
    const { defaultBrowserType: _browserType, ...pixel7 } = devices['Pixel 7'];
    const context = await browser.newContext({
      ...pixel7,
      baseURL: String(testInfo.project.use.baseURL),
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Production sign in' })).toBeVisible();
      await expect(page.getByRole('img', { name: /stellana/i })).toBeVisible();
      await page.getByLabel('Email address').fill(email!);
      await page.getByLabel('Password').fill(password!);
      const signIn = page.getByRole('button', { name: /sign in to production control/i });
      await expect(signIn).toBeVisible();
      expect((await signIn.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      await signIn.click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'Factory production control' })).toBeVisible();
      await expect(page.getByRole('link', { name: /mixing section/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /blanking section/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /moulding section/i })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('iPhone-sized authenticated smoke covers all production sections and management', async ({
    browser,
  }, testInfo) => {
    const { defaultBrowserType: _browserType, ...iphone14 } = devices['iPhone 14'];
    const context = await browser.newContext({
      ...iphone14,
      baseURL: String(testInfo.project.use.baseURL),
      storageState: 'playwright/.auth/admin.json',
    });
    try {
      const page = await context.newPage();
      const routes = [
        ['/', 'Factory production control'],
        ['/mixing', 'Live production overview'],
        ['/production-manager', 'Mixing, Blanking and Moulding report'],
        ['/blanking', 'Blanking production dashboard'],
        ['/moulding', 'Press inventory and incoming carts'],
      ] as const;
      for (const [route, heading] of routes) {
        await page.goto(route);
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await expect(page.locator('body')).not.toContainText('Request failed with status 500');
      }

      await page.goto('/mixing');
      const tabletNav = page.getByRole('navigation', { name: /mixing tablet navigation/i });
      await expect(tabletNav).toBeVisible();
      await expect(tabletNav.getByRole('link', { name: 'Batches' })).toBeVisible();
      const selectSection = page.getByRole('link', { name: 'Select production section' });
      expect((await selectSection.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    } finally {
      await context.close();
    }
  });
});
