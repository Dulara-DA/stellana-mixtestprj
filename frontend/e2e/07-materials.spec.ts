import { APIRequestContext, expect, test } from '@playwright/test';

type UserView = {
  id: number;
  fullName: string;
  role: string;
};

type RecipeView = {
  id: number;
  recipeCode: string;
};

type BatchView = {
  id: number;
  batchNumber: string;
  status: string;
};

type MaterialItemView = {
  id: number;
  materialCode: string;
  materialName: string;
  requiredQuantity: number;
  requestedQuantity: number;
  issuedQuantity: number;
  unit: string;
  rawMaterialLotNumber?: string;
};

type MaterialRequestView = {
  id: number;
  requestNumber: string;
  batchId: number;
  batchNumber: string;
  recipeCode: string;
  revisionNumber: string;
  requestingOfficer: UserView;
  requestedAt: string;
  status: 'REQUESTED' | 'PARTIALLY_ISSUED' | 'ISSUED';
  notes?: string;
  issuedBy?: UserView;
  issuedAt?: string;
  items: MaterialItemView[];
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

async function createMaterialWorkflowBatch(
  request: APIRequestContext,
  token: string,
  unique: string,
) {
  const recipeResponse = await request.post('/api/recipes/revisions', {
    headers: bearer(token),
    data: {
      recipeCode: `PW-REC-MAT-${unique}`,
      compoundName: `PW Materials Compound ${unique}`,
      revisionNumber: '1',
      effectiveDate: new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
      revisionNotes: 'PW material request workflow recipe.',
      ingredients: [
        {
          materialCode: `PW-RM-MAT-${unique}-A`,
          materialName: 'PW Natural Rubber',
          requiredQuantity: 100,
          unit: 'kg',
          additionSequence: 1,
          stageNumber: 1,
        },
        {
          materialCode: `PW-RM-MAT-${unique}-S`,
          materialName: 'PW Sulphur',
          requiredQuantity: 5,
          unit: 'kg',
          additionSequence: 2,
          stageNumber: 2,
        },
      ],
    },
  });
  expect(recipeResponse.status()).toBe(200);
  const recipe = (await recipeResponse.json()) as RecipeView;

  const officersResponse = await request.get('/api/users/officers', {
    headers: bearer(token),
  });
  expect(officersResponse.status()).toBe(200);
  const officers = (await officersResponse.json()) as UserView[];
  expect(officers.length).toBeGreaterThan(0);

  const batchResponse = await request.post('/api/batches', {
    headers: bearer(token),
    data: {
      batchNumber: `PW-BATCH-MAT-${unique}`,
      recipeRevisionId: recipe.id,
      plannedQuantityKg: 105,
      machine: `PW-MIXER-MAT-${unique}`,
      assignedOfficerId: officers[0].id,
    },
  });
  expect(batchResponse.status()).toBe(200);
  return (await batchResponse.json()) as BatchView;
}

test.describe('Stellana Raw-Material Requests', () => {
  test('materials page loads request and batch data', async ({ page }) => {
    const requestsPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/material-requests' &&
        response.request().method() === 'GET',
    );
    const batchesPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/batches' &&
        response.request().method() === 'GET',
    );
    await page.goto('/materials');
    expect((await requestsPromise).status()).toBe(200);
    expect((await batchesPromise).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Raw-material requests' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /request materials/i }),
    ).toBeVisible();
  });

  test('complete material request and stores issue workflow updates the batch', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const batch = await createMaterialWorkflowBatch(request, auth.token, unique);

    await page.goto('/materials');
    await page.getByRole('button', { name: /request materials/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Request raw materials' }),
    ).toBeVisible();
    await page.getByLabel('Batch').selectOption(String(batch.id));
    await page.getByLabel('Notes').fill('PW request created through the materials UI.');

    const createPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/material-requests' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /submit request/i }).click();
    const createResponse = await createPromise;
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()) as MaterialRequestView;

    expect(created.batchId).toBe(batch.id);
    expect(created.batchNumber).toBe(batch.batchNumber);
    expect(created.status).toBe('REQUESTED');
    expect(created.items).toHaveLength(2);
    expect(created.items.map((item) => item.requestedQuantity)).toEqual([100, 5]);
    expect(created.items.every((item) => item.issuedQuantity === 0)).toBeTruthy();

    const batchRequestedResponse = await request.get(`/api/batches/${batch.id}`, {
      headers: bearer(auth.token),
    });
    expect(batchRequestedResponse.status()).toBe(200);
    expect(((await batchRequestedResponse.json()) as BatchView).status).toBe(
      'MATERIALS_REQUESTED',
    );

    const emptyIssueResponse = await request.post(
      `/api/material-requests/${created.id}/issue`,
      {
        headers: bearer(auth.token),
        data: { items: [], notes: 'PW invalid empty issue.' },
      },
    );
    expect(emptyIssueResponse.status()).toBe(400);
    expect((await emptyIssueResponse.json()).fieldErrors.items).toBeTruthy();

    const excessiveIssueResponse = await request.post(
      `/api/material-requests/${created.id}/issue`,
      {
        headers: bearer(auth.token),
        data: {
          items: [
            {
              itemId: created.items[0].id,
              issuedQuantity: created.items[0].requestedQuantity + 1,
              rawMaterialLotNumber: `PW-LOT-OVER-${unique}`,
            },
          ],
        },
      },
    );
    expect(excessiveIssueResponse.status()).toBe(409);
    expect((await excessiveIssueResponse.json()).message).toMatch(
      /cannot exceed requested quantity/i,
    );

    const partialResponse = await request.post(
      `/api/material-requests/${created.id}/issue`,
      {
        headers: bearer(auth.token),
        data: {
          items: created.items.map((item, index) => ({
            itemId: item.id,
            issuedQuantity: index === 0 ? 50 : 0,
            rawMaterialLotNumber: `PW-LOT-PART-${unique}-${index + 1}`,
          })),
          notes: 'PW partial stores issue.',
        },
      },
    );
    expect(partialResponse.status()).toBe(200);
    const partial = (await partialResponse.json()) as MaterialRequestView;
    expect(partial.status).toBe('PARTIALLY_ISSUED');
    expect(partial.items[0].issuedQuantity).toBe(50);

    await page.reload();
    const requestCard = page
      .locator('section.card')
      .filter({ hasText: created.requestNumber })
      .first();
    await expect(requestCard).toContainText('Partially Issued');
    await requestCard.getByRole('button', { name: /record issue/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Record stores issue' }),
    ).toBeVisible();

    const issuedInputs = page.getByLabel('Issued (kg)');
    const lotInputs = page.getByLabel('Lot number (optional)');
    await expect(issuedInputs).toHaveCount(2);
    await issuedInputs.nth(0).fill('100');
    await issuedInputs.nth(1).fill('5');
    await lotInputs.nth(0).fill(`PW-LOT-FULL-${unique}-1`);
    await lotInputs.nth(1).fill(`PW-LOT-FULL-${unique}-2`);
    page.once('dialog', (dialog) => dialog.accept());

    const issuePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/material-requests/${created.id}/issue` &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: /confirm issued quantities/i })
      .click();
    const issueResponse = await issuePromise;
    expect(issueResponse.status()).toBe(200);
    const issued = (await issueResponse.json()) as MaterialRequestView;
    expect(issued.status).toBe('ISSUED');
    expect(issued.issuedBy?.role).toBe('SYSTEM_ADMIN');
    expect(issued.issuedAt).toBeTruthy();
    expect(issued.items.map((item) => item.issuedQuantity)).toEqual([100, 5]);
    expect(issued.items[0].rawMaterialLotNumber).toBe(
      `PW-LOT-FULL-${unique}-1`,
    );

    const batchIssuedResponse = await request.get(`/api/batches/${batch.id}`, {
      headers: bearer(auth.token),
    });
    expect(batchIssuedResponse.status()).toBe(200);
    expect(((await batchIssuedResponse.json()) as BatchView).status).toBe(
      'MATERIALS_ISSUED',
    );

    const listResponse = await request.get('/api/material-requests', {
      headers: bearer(auth.token),
    });
    expect(listResponse.status()).toBe(200);
    const requests = (await listResponse.json()) as MaterialRequestView[];
    const persisted = requests.find((item) => item.id === created.id);
    expect(persisted?.status).toBe('ISSUED');
    expect(persisted?.items[1].rawMaterialLotNumber).toBe(
      `PW-LOT-FULL-${unique}-2`,
    );

    await page.reload();
    await expect(
      page.locator('section.card').filter({ hasText: created.requestNumber }).first(),
    ).toContainText('Issued');
  });
});
