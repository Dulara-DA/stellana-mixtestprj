import { APIRequestContext, expect, test } from '@playwright/test';

type UserView = {
  id: number;
  fullName: string;
  employeeId: string;
  email: string;
  role: string;
  active: boolean;
};

type RecipeRevisionView = {
  id: number;
  recipeCode: string;
  revisionNumber: string;
  status: 'DRAFT' | 'ACTIVE' | 'OBSOLETE';
};

type BatchView = {
  id: number;
  batchNumber: string;
  factoryReference: string;
  recipeRevisionId: number;
  recipeCode: string;
  revisionNumber: string;
  plannedQuantityKg: number;
  machine: string;
  assignedOfficer: UserView;
  plannedStartTime?: string;
  targetCompletionTime?: string;
  productionPriority: 'NORMAL' | 'HIGH' | 'URGENT';
  scheduleNotes?: string;
  status: string;
  traceabilityCode: string;
};

async function loginAsAdmin(request: APIRequestContext) {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('TEST_EMAIL or TEST_PASSWORD is missing from .env.playwright');
  }
  const response = await request.post('/api/auth/login', {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { token: string; user: UserView };
  expect(body.user.role).toBe('SYSTEM_ADMIN');
  return body;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createActiveRecipe(
  request: APIRequestContext,
  token: string,
  unique: string,
) {
  const response = await request.post('/api/recipes/revisions', {
    headers: bearer(token),
    data: {
      recipeCode: `PW-REC-BATCH-${unique}`,
      compoundName: `PW Batch Test Compound ${unique}`,
      revisionNumber: '1',
      effectiveDate: new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
      revisionNotes: 'PW recipe used only by the batch Playwright workflow.',
      ingredients: [
        {
          materialCode: `PW-RM-BATCH-${unique}`,
          materialName: 'PW Batch Test Rubber',
          requiredQuantity: 100,
          unit: 'kg',
          additionSequence: 1,
          stageNumber: 1,
          mixingTimeSeconds: 420,
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as RecipeRevisionView;
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

test.describe('Stellana Mixing Batch Management', () => {
  test('batch list loads from the API and exposes creation controls', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/batches' &&
        response.request().method() === 'GET',
    );
    await page.goto('/batches');
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Batch control' })).toBeVisible();
    await expect(page.getByRole('link', { name: /create batch/i })).toBeVisible();
  });

  test('batch validation enforces a positive quantity no greater than 240 kg', async ({
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const recipe = await createActiveRecipe(request, auth.token, unique);
    const officersResponse = await request.get('/api/users/officers', {
      headers: bearer(auth.token),
    });
    expect(officersResponse.status()).toBe(200);
    const officers = (await officersResponse.json()) as UserView[];
    expect(officers.length).toBeGreaterThan(0);

    for (const [suffix, quantity] of [
      ['OVER', 240.001],
      ['ZERO', 0],
      ['NEGATIVE', -1],
    ] as const) {
      const response = await request.post('/api/batches', {
        headers: bearer(auth.token),
        data: {
          batchNumber: `PW-BATCH-${suffix}-${unique}`,
          recipeRevisionId: recipe.id,
          plannedQuantityKg: quantity,
          machine: `PW-MIXER-${unique}`,
          assignedOfficerId: officers[0].id,
        },
      });
      expect(response.status(), `quantity ${quantity} should be rejected`).toBe(400);
      const body = await response.json();
      expect(body.fieldErrors.plannedQuantityKg).toBeTruthy();
    }
  });

  test('scheduled batch creation persists through UI, API, list and dashboard', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const recipe = await createActiveRecipe(request, auth.token, unique);
    const officersResponse = await request.get('/api/users/officers', {
      headers: bearer(auth.token),
    });
    expect(officersResponse.status()).toBe(200);
    const officers = (await officersResponse.json()) as UserView[];
    expect(officers.length).toBeGreaterThan(0);
    const officer = officers[0];

    const enteredBatchNumber = `pw-batch-${unique}`;
    const batchNumber = enteredBatchNumber.toUpperCase();
    const machine = `PW-MIXER-${unique}`;
    const now = Date.now();
    const plannedStart = localDateTimeValue(new Date(now + 7 * 24 * 60 * 60 * 1000));
    const targetCompletion = localDateTimeValue(
      new Date(now + 7 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000),
    );

    await page.goto('/batches/new');
    await expect(
      page.getByRole('heading', { name: 'Create a mixing batch' }),
    ).toBeVisible();
    await expect(page.getByLabel('Active recipe revision')).toContainText(
      recipe.recipeCode,
    );

    await page.getByLabel('Factory batch/tag number').fill(enteredBatchNumber);
    await page.getByLabel('Planned quantity (kg)').fill('220');
    await page.getByLabel('Active recipe revision').selectOption(String(recipe.id));
    await page.getByLabel('Mixer / machine').fill(machine);
    await page.getByLabel('Assigned Mixing Officer').selectOption(String(officer.id));
    await page
      .getByLabel(/plan this batch for a production time window/i)
      .check();
    await page.getByLabel('Planned start').fill(plannedStart);
    await page.getByLabel('Target completion').fill(targetCompletion);
    await page.getByLabel('Priority').selectOption('HIGH');
    await page
      .getByLabel('Planning note (optional)')
      .fill('PW scheduled batch verification.');

    await expect(page.getByText(`${recipe.recipeCode} × ${batchNumber}`)).toBeVisible();

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'confirm') {
        await dialog.accept();
      } else if (dialog.type() === 'prompt') {
        await dialog.accept('PW authorized schedule conflict for isolated test data.');
      } else {
        await dialog.dismiss();
      }
    });
    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/batches' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^create batch$/i }).click();
    const createResponse = await createResponsePromise;

    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()) as BatchView;
    expect(created.batchNumber).toBe(batchNumber);
    expect(created.recipeRevisionId).toBe(recipe.id);
    expect(created.plannedQuantityKg).toBe(220);
    expect(created.machine).toBe(machine);
    expect(created.assignedOfficer.id).toBe(officer.id);
    expect(created.productionPriority).toBe('HIGH');
    expect(created.scheduleNotes).toBe('PW scheduled batch verification.');
    expect(created.plannedStartTime).toContain(plannedStart);
    expect(created.targetCompletionTime).toContain(targetCompletion);
    expect(created.status).toBe('PLANNED');
    expect(created.traceabilityCode).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(`/batches/${created.id}$`));
    await expect(
      page.getByRole('heading', { name: `${recipe.recipeCode} × ${batchNumber}` }),
    ).toBeVisible();
    await expect(page.getByText('220 kg', { exact: true })).toBeVisible();
    await expect(page.getByText(officer.fullName, { exact: true })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { name: `${recipe.recipeCode} × ${batchNumber}` }),
    ).toBeVisible();

    const readResponse = await request.get(`/api/batches/${created.id}`, {
      headers: bearer(auth.token),
    });
    expect(readResponse.status()).toBe(200);
    const readBack = (await readResponse.json()) as BatchView;
    expect(readBack.batchNumber).toBe(batchNumber);
    expect(readBack.recipeRevisionId).toBe(recipe.id);

    const listResponse = await request.get('/api/batches', {
      headers: bearer(auth.token),
    });
    expect(listResponse.status()).toBe(200);
    const batches = (await listResponse.json()) as BatchView[];
    expect(batches.some((batch) => batch.id === created.id)).toBeTruthy();

    await page.goto('/batches');
    await page
      .getByPlaceholder(/search batch, recipe, compound, or officer/i)
      .fill(batchNumber);
    const row = page.locator('tbody tr').filter({ hasText: batchNumber });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(recipe.recipeCode);
    await expect(row).toContainText('220 kg');
    await expect(row).toContainText('Planned');

    await page.goto('/mixing');
    await expect(page.locator('body')).toContainText(batchNumber);

    const duplicateResponse = await request.post('/api/batches', {
      headers: bearer(auth.token),
      data: {
        batchNumber: batchNumber.toLowerCase(),
        recipeRevisionId: recipe.id,
        plannedQuantityKg: 100,
        machine: `${machine}-DUPLICATE`,
        assignedOfficerId: officer.id,
      },
    });
    expect(duplicateResponse.status()).toBe(409);
    expect((await duplicateResponse.json()).message).toMatch(/already exists/i);
  });
});
