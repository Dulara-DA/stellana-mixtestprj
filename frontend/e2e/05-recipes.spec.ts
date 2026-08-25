import { APIRequestContext, expect, test } from '@playwright/test';

type UserView = {
  id: number;
  fullName: string;
  email: string;
  role: string;
};

type IngredientView = {
  id: number;
  materialCode: string;
  materialName: string;
  requiredQuantity: number;
  unit: string;
  additionSequence: number;
  stageNumber: number;
  mixingTimeSeconds?: number;
  temperatureCelsius?: number;
  speedRpm?: number;
  instructions?: string;
};

type RecipeRevisionView = {
  id: number;
  recipeId: number;
  recipeCode: string;
  compoundName: string;
  revisionNumber: string;
  effectiveDate: string;
  lastUpdatedDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'OBSOLETE';
  createdBy: UserView;
  approvedBy?: UserView;
  approvedAt?: string;
  revisionNotes?: string;
  ingredients: IngredientView[];
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

  expect(response.status(), 'SYSTEM_ADMIN API login should succeed').toBe(200);
  const body = (await response.json()) as { token: string; user: UserView };
  expect(body.token).toBeTruthy();
  expect(body.user.role).toBe('SYSTEM_ADMIN');
  return body;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function ingredient(
  materialCode: string,
  materialName: string,
  stageNumber: 1 | 2,
  additionSequence: number,
) {
  return {
    materialCode,
    materialName,
    requiredQuantity: stageNumber === 1 ? 80.5 : 4.25,
    unit: 'kg',
    additionSequence,
    stageNumber,
    mixingTimeSeconds: stageNumber === 1 ? 420 : 240,
    temperatureCelsius: stageNumber === 1 ? 153 : 110,
    speedRpm: stageNumber === 1 ? 40 : 30,
    instructions:
      stageNumber === 1
        ? 'Add the Stage 1 material in sequence.'
        : 'Add sulphur during Stage 2.',
  };
}

test.describe('Stellana Recipe Revision Management', () => {
  test('recipes page loads from the API and provides revision controls', async ({
    page,
  }) => {
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/recipes' &&
        response.request().method() === 'GET',
    );

    await page.goto('/recipes');
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBeTruthy();
    await expect(
      page.getByRole('heading', { name: 'Digital recipe revisions' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /create revision/i }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/search code, compound, revision, or status/i),
    ).toBeVisible();
  });

  test('recipe API rejects missing revision identity fields', async ({ request }) => {
    const auth = await loginAsAdmin(request);
    const response = await request.post('/api/recipes/revisions', {
      headers: bearer(auth.token),
      data: {
        recipeCode: '',
        compoundName: '',
        revisionNumber: '',
        effectiveDate: null,
        status: null,
        ingredients: [],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Bad Request');
    expect(body.fieldErrors.recipeCode).toBeTruthy();
    expect(body.fieldErrors.compoundName).toBeTruthy();
    expect(body.fieldErrors.revisionNumber).toBeTruthy();
    expect(body.fieldErrors.effectiveDate).toBeTruthy();
    expect(body.fieldErrors.status).toBeTruthy();
    expect(body.fieldErrors.ingredients).toBeTruthy();
  });

  test('recipe API rejects invalid ingredient quantities, stages and process time', async ({
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = Date.now();
    const response = await request.post('/api/recipes/revisions', {
      headers: bearer(auth.token),
      data: {
        recipeCode: `PW-REC-INVALID-${unique}`,
        compoundName: 'PW Invalid Ingredient Compound',
        revisionNumber: '1',
        effectiveDate: new Date().toISOString().slice(0, 10),
        status: 'DRAFT',
        ingredients: [
          {
            materialCode: '',
            materialName: '',
            requiredQuantity: 0,
            unit: '',
            additionSequence: 0,
            stageNumber: 3,
            mixingTimeSeconds: 0,
          },
        ],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    const fields = body.fieldErrors as Record<string, string>;
    expect(fields['ingredients[0].materialCode']).toBeTruthy();
    expect(fields['ingredients[0].materialName']).toBeTruthy();
    expect(fields['ingredients[0].requiredQuantity']).toBeTruthy();
    expect(fields['ingredients[0].unit']).toBeTruthy();
    expect(fields['ingredients[0].additionSequence']).toBeTruthy();
    expect(fields['ingredients[0].stageNumber']).toBeTruthy();
    expect(fields['ingredients[0].mixingTimeSeconds']).toBeTruthy();
  });

  test('complete append-only recipe lifecycle persists through UI and API', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const enteredRecipeCode = `pw-rec-${unique}`;
    const recipeCode = enteredRecipeCode.toUpperCase();
    const compoundName = `PW Demonstration Compound ${unique}`;
    const material1Entered = `pw-rm-${unique}-a`;
    const material2Entered = `pw-rm-${unique}-s`;
    const material1 = material1Entered.toUpperCase();
    const material2 = material2Entered.toUpperCase();
    const effectiveDate = new Date().toISOString().slice(0, 10);

    await page.goto('/recipes/new');
    await expect(
      page.getByRole('heading', { name: 'Create a digital recipe' }),
    ).toBeVisible();

    await page.getByLabel('Recipe code').fill(enteredRecipeCode);
    await page.getByLabel('Compound name').fill(compoundName);
    await page.getByLabel('Revision number').fill('1');
    await page.getByLabel('Effective date').fill(effectiveDate);
    await page.getByLabel('Initial status').selectOption('ACTIVE');
    await page
      .getByLabel('Revision notes')
      .fill('PW initial controlled formulation for lifecycle testing.');

    await page.getByLabel('Material code').first().fill(material1Entered);
    await page.getByLabel('Material name').first().fill('PW Natural Rubber');
    await page.getByLabel('Required qty').first().fill('80.5');
    await page.getByLabel('Stage').first().selectOption('1');
    await page.getByLabel('Time (seconds)').first().fill('420');
    await page.getByLabel('Temperature °C').first().fill('153');
    await page.getByLabel('Speed RPM').first().fill('40');
    await page
      .getByLabel('Instructions')
      .first()
      .fill('Add the Stage 1 material in sequence.');

    await page.getByRole('button', { name: /add ingredient/i }).click();
    await page.getByLabel('Material code').nth(1).fill(material2Entered);
    await page.getByLabel('Material name').nth(1).fill('PW Sulphur');
    await page.getByLabel('Required qty').nth(1).fill('4.25');
    await page.getByLabel('Stage').nth(1).selectOption('2');
    await page.getByLabel('Time (seconds)').nth(1).fill('240');
    await page.getByLabel('Temperature °C').nth(1).fill('110');
    await page.getByLabel('Speed RPM').nth(1).fill('30');
    await page
      .getByLabel('Instructions')
      .nth(1)
      .fill('Add sulphur during Stage 2.');

    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/recipes/revisions' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /save recipe revision/i }).click();
    const createResponse = await createResponsePromise;

    expect(createResponse.status()).toBe(200);
    const first = (await createResponse.json()) as RecipeRevisionView;
    expect(first.recipeCode).toBe(recipeCode);
    expect(first.status).toBe('ACTIVE');
    expect(first.approvedBy?.role).toBe('SYSTEM_ADMIN');
    expect(first.ingredients.map((item) => item.materialCode)).toEqual([
      material1,
      material2,
    ]);
    expect(first.ingredients.map((item) => item.stageNumber)).toEqual([1, 2]);

    await expect(page).toHaveURL(new RegExp(`/recipes/${first.id}$`));
    await expect(
      page.getByRole('heading', { name: `${recipeCode} · Revision 1` }),
    ).toBeVisible();
    await expect(page.getByText(compoundName, { exact: true })).toBeVisible();
    await expect(page.getByText('PW Natural Rubber', { exact: true })).toBeVisible();
    await expect(page.getByText('PW Sulphur', { exact: true })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { name: `${recipeCode} · Revision 1` }),
    ).toBeVisible();

    const firstReadResponse = await request.get(`/api/recipes/${first.id}`, {
      headers: bearer(auth.token),
    });
    expect(firstReadResponse.status()).toBe(200);
    const firstRead = (await firstReadResponse.json()) as RecipeRevisionView;
    expect(firstRead.recipeCode).toBe(recipeCode);
    expect(firstRead.ingredients).toHaveLength(2);

    const listResponse = await request.get('/api/recipes', {
      headers: bearer(auth.token),
    });
    expect(listResponse.status()).toBe(200);
    const list = (await listResponse.json()) as RecipeRevisionView[];
    expect(list.some((revision) => revision.id === first.id)).toBeTruthy();

    const activeBeforeResponse = await request.get('/api/recipes/active', {
      headers: bearer(auth.token),
    });
    expect(activeBeforeResponse.status()).toBe(200);
    const activeBefore = (await activeBeforeResponse.json()) as RecipeRevisionView[];
    expect(activeBefore.some((revision) => revision.id === first.id)).toBeTruthy();

    await page.goto('/recipes');
    await page
      .getByPlaceholder(/search code, compound, revision, or status/i)
      .fill(recipeCode);
    const firstRow = page.locator('tbody tr').filter({ hasText: recipeCode });
    await expect(firstRow).toHaveCount(1);
    await expect(firstRow).toContainText('Rev 1');

    const duplicateResponse = await request.post('/api/recipes/revisions', {
      headers: bearer(auth.token),
      data: {
        recipeCode,
        compoundName,
        revisionNumber: '1',
        effectiveDate,
        status: 'DRAFT',
        revisionNotes: 'This duplicate must be rejected.',
        ingredients: [ingredient(material1, 'PW Natural Rubber', 1, 1)],
      },
    });
    expect(duplicateResponse.status()).toBe(409);
    expect((await duplicateResponse.json()).message).toMatch(/already exists/i);

    const secondCreateResponse = await request.post('/api/recipes/revisions', {
      headers: bearer(auth.token),
      data: {
        recipeCode,
        compoundName,
        revisionNumber: '2',
        effectiveDate,
        status: 'DRAFT',
        revisionNotes: 'PW second revision awaiting activation.',
        ingredients: [
          ingredient(material1, 'PW Natural Rubber', 1, 1),
          ingredient(material2, 'PW Sulphur', 2, 2),
        ],
      },
    });
    expect(secondCreateResponse.status()).toBe(200);
    const second = (await secondCreateResponse.json()) as RecipeRevisionView;
    expect(second.status).toBe('DRAFT');

    const activeWithDraftResponse = await request.get('/api/recipes/active', {
      headers: bearer(auth.token),
    });
    const activeWithDraft = (await activeWithDraftResponse.json()) as RecipeRevisionView[];
    expect(activeWithDraft.some((revision) => revision.id === second.id)).toBeFalsy();

    const activateResponse = await request.patch(
      `/api/recipes/revisions/${second.id}/status`,
      {
        headers: bearer(auth.token),
        data: { status: 'ACTIVE' },
      },
    );
    expect(activateResponse.status()).toBe(200);
    const activated = (await activateResponse.json()) as RecipeRevisionView;
    expect(activated.status).toBe('ACTIVE');
    expect(activated.approvedBy?.role).toBe('SYSTEM_ADMIN');

    const firstAfterResponse = await request.get(`/api/recipes/${first.id}`, {
      headers: bearer(auth.token),
    });
    const firstAfter = (await firstAfterResponse.json()) as RecipeRevisionView;
    expect(firstAfter.status).toBe('OBSOLETE');

    const activeAfterResponse = await request.get('/api/recipes/active', {
      headers: bearer(auth.token),
    });
    const activeAfter = (await activeAfterResponse.json()) as RecipeRevisionView[];
    const activeForRecipe = activeAfter.filter(
      (revision) => revision.recipeCode === recipeCode,
    );
    expect(activeForRecipe).toHaveLength(1);
    expect(activeForRecipe[0].id).toBe(second.id);

    const reactivateObsoleteResponse = await request.patch(
      `/api/recipes/revisions/${first.id}/status`,
      {
        headers: bearer(auth.token),
        data: { status: 'ACTIVE' },
      },
    );
    expect(reactivateObsoleteResponse.status()).toBe(409);
    expect((await reactivateObsoleteResponse.json()).message).toMatch(
      /cannot be reactivated/i,
    );

    await page.goto('/recipes');
    await page
      .getByPlaceholder(/search code, compound, revision, or status/i)
      .fill(recipeCode);
    const finalRows = page.locator('tbody tr').filter({ hasText: recipeCode });
    await expect(finalRows).toHaveCount(2);
    await expect(finalRows.filter({ hasText: 'Rev 1' })).toContainText('Obsolete');
    await expect(finalRows.filter({ hasText: 'Rev 2' })).toContainText('Active');
  });
});
