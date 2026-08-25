import { APIRequestContext, expect, test } from '@playwright/test';

type UserView = {
  id: number;
  fullName: string;
  role: string;
};

type BatchView = {
  id: number;
  batchNumber: string;
  status: string;
  laboratoryStatus: string;
  releaseStatus: string;
};

type LabSampleView = {
  id: number;
  sampleId: string;
  batchId: number;
  batchNumber: string;
  sentToLabAt: string;
  testDateTime?: string;
  hardness?: number;
  resilience?: number;
  curingTimeMinutes?: number;
  decision: 'PENDING' | 'PASS' | 'FAIL' | 'HOLD' | 'RETEST';
  testedBy?: UserView;
  comments?: string;
  reprocessingDecision: boolean;
  managerApprovedBy?: UserView;
  managerApprovedAt?: string;
  additionalResults: Array<{
    id: number;
    testName: string;
    resultValue: string;
    unit?: string;
  }>;
};

type ApprovedMaterialView = {
  id: number;
  mixingBatchId?: number;
  mixingBatchNumber: string;
  labStatus: string;
  approvedQuantityKg: number;
  availableQuantityKg: number;
  stockStatus: string;
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

async function createStageTwoCompletedBatch(
  request: APIRequestContext,
  token: string,
  unique: string,
) {
  const recipeResponse = await request.post('/api/recipes/revisions', {
    headers: bearer(token),
    data: {
      recipeCode: `PW-REC-LAB-${unique}`,
      compoundName: `PW Lab Compound ${unique}`,
      revisionNumber: '1',
      effectiveDate: new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
      revisionNotes: 'PW recipe used for laboratory decision testing.',
      ingredients: [
        {
          materialCode: `PW-RM-LAB-${unique}-1`,
          materialName: 'PW Lab Rubber',
          requiredQuantity: 190,
          unit: 'kg',
          additionSequence: 1,
          stageNumber: 1,
        },
        {
          materialCode: `PW-RM-LAB-${unique}-2`,
          materialName: 'PW Lab Sulphur',
          requiredQuantity: 5,
          unit: 'kg',
          additionSequence: 2,
          stageNumber: 2,
        },
      ],
    },
  });
  expect(recipeResponse.status()).toBe(200);
  const recipe = (await recipeResponse.json()) as { id: number };

  const officersResponse = await request.get('/api/users/officers', {
    headers: bearer(token),
  });
  expect(officersResponse.status()).toBe(200);
  const officers = (await officersResponse.json()) as UserView[];
  expect(officers.length).toBeGreaterThan(0);

  const batchResponse = await request.post('/api/batches', {
    headers: bearer(token),
    data: {
      batchNumber: `PW-BATCH-LAB-${unique}`,
      recipeRevisionId: recipe.id,
      plannedQuantityKg: 195,
      machine: `PW-MIXER-LAB-${unique}`,
      assignedOfficerId: officers[0].id,
    },
  });
  expect(batchResponse.status()).toBe(200);
  const batch = (await batchResponse.json()) as BatchView;

  const readyResponse = await request.post(`/api/batches/${batch.id}/transition`, {
    headers: bearer(token),
    data: { status: 'READY_FOR_STAGE_1', reason: 'PW lab workflow setup.' },
  });
  expect(readyResponse.status()).toBe(200);

  const stageOneStart = await request.post('/api/stages/start', {
    headers: bearer(token),
    data: { batchId: batch.id, stageNumber: 1, machine: `PW-MIXER-LAB-${unique}` },
  });
  expect(stageOneStart.status()).toBe(200);
  const stageOne = (await stageOneStart.json()) as { id: number };
  const stageOneComplete = await request.post(`/api/stages/${stageOne.id}/complete`, {
    headers: bearer(token),
    data: { actualQuantity: 193, mixingTimeSeconds: 480 },
  });
  expect(stageOneComplete.status()).toBe(200);

  const stageTwoStart = await request.post('/api/stages/start', {
    headers: bearer(token),
    data: { batchId: batch.id, stageNumber: 2, machine: `PW-MIXER-LAB-${unique}` },
  });
  expect(stageTwoStart.status()).toBe(200);
  const stageTwo = (await stageTwoStart.json()) as { id: number };
  const stageTwoComplete = await request.post(`/api/stages/${stageTwo.id}/complete`, {
    headers: bearer(token),
    data: { actualQuantity: 192.5, mixingTimeSeconds: 240 },
  });
  expect(stageTwoComplete.status()).toBe(200);

  const completedResponse = await request.get(`/api/batches/${batch.id}`, {
    headers: bearer(token),
  });
  const completed = (await completedResponse.json()) as BatchView;
  expect(completed.status).toBe('STAGE_2_COMPLETED');
  return completed;
}

async function sendSample(
  request: APIRequestContext,
  token: string,
  batchId: number,
) {
  const response = await request.post(`/api/lab/batches/${batchId}/send-sample`, {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as LabSampleView;
}

test.describe('Stellana Laboratory Samples and Decisions', () => {
  test('laboratory page loads samples, batches and configurable specifications', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const specificationResponse = await request.post('/api/lab/specifications', {
      headers: bearer(auth.token),
      data: {
        recipeId: null,
        testName: `PW Configurable Test ${unique}`,
        minimumValue: null,
        maximumValue: null,
        unit: 'TBC',
        notes: 'PW limits intentionally remain To Be Confirmed.',
      },
    });
    expect(specificationResponse.status()).toBe(200);

    const samplesPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/lab/samples',
    );
    const specsPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/lab/specifications',
    );
    await page.goto('/lab');
    expect((await samplesPromise).status()).toBe(200);
    expect((await specsPromise).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Laboratory samples and results' }),
    ).toBeVisible();
    const specificationCard = page
      .getByText(`PW Configurable Test ${unique}`, { exact: true })
      .locator('..')
      .locator('..');
    await expect(specificationCard).toBeVisible();
    await expect(specificationCard).toContainText('TBC – TBC TBC');
  });

  test('PASS result entered through UI preserves tests and enables release', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const batch = await createStageTwoCompletedBatch(request, auth.token, `${unique}-PASS`);

    await page.goto('/lab');
    const readySection = page.locator('section.card').filter({
      has: page.getByRole('heading', { name: 'Samples ready to send' }),
    });
    const readyCard = readySection
      .getByText(batch.batchNumber, { exact: true })
      .locator('..')
      .locator('..');
    await expect(readyCard).toContainText(batch.batchNumber);
    page.once('dialog', (dialog) => dialog.accept());
    const sendPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/lab/batches/${batch.id}/send-sample`,
    );
    await readyCard.getByRole('button', { name: 'Send' }).click();
    const sendResponse = await sendPromise;
    expect(sendResponse.status()).toBe(200);
    const sample = (await sendResponse.json()) as LabSampleView;
    expect(sample.decision).toBe('PENDING');
    expect(sample.sentToLabAt).toBeTruthy();

    const sampleCard = page.locator('div.card').filter({ hasText: sample.sampleId }).first();
    await expect(sampleCard).toContainText('Pending');
    await sampleCard.getByRole('button', { name: /record result/i }).click();
    await page.getByLabel('Hardness').fill('65.5');
    await page.getByLabel('Resilience').fill('48.25');
    await page.getByLabel('Curing time (minutes)').fill('12.75');
    await page.getByLabel('Additional test name').fill('PW Visual inspection');
    await page.getByLabel('Additional result').fill('Accepted manually');
    await page.getByLabel('Unit').fill('observation');
    await page.getByLabel('Decision').selectOption('PASS');
    await page.getByLabel('Comments').fill('PW manual PASS; no automatic limits applied.');

    const resultPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/lab/samples/${sample.id}/results`,
    );
    await page
      .getByRole('button', { name: /save result and decision/i })
      .click();
    const resultResponse = await resultPromise;
    expect(resultResponse.status()).toBe(200);
    const result = (await resultResponse.json()) as LabSampleView;
    expect(result.decision).toBe('PASS');
    expect(result.hardness).toBe(65.5);
    expect(result.resilience).toBe(48.25);
    expect(result.curingTimeMinutes).toBe(12.75);
    expect(result.testDateTime).toBeTruthy();
    expect(result.testedBy?.role).toBe('SYSTEM_ADMIN');
    expect(result.managerApprovedBy?.role).toBe('SYSTEM_ADMIN');
    expect(result.additionalResults).toHaveLength(1);
    expect(result.additionalResults[0].testName).toBe('PW Visual inspection');
    expect(result.additionalResults[0].resultValue).toBe('Accepted manually');

    const passedBatchResponse = await request.get(`/api/batches/${batch.id}`, {
      headers: bearer(auth.token),
    });
    const passedBatch = (await passedBatchResponse.json()) as BatchView;
    expect(passedBatch.status).toBe('LAB_PASSED');
    expect(passedBatch.laboratoryStatus).toBe('PASS');
    expect(passedBatch.releaseStatus).toBe('PENDING_APPROVAL');

    const queuedStockResponse = await request.get('/api/blanking/compound-stock', {
      headers: bearer(auth.token),
    });
    expect(queuedStockResponse.status()).toBe(200);
    const queuedStock = (await queuedStockResponse.json()) as ApprovedMaterialView[];
    const awaitingReceipt = queuedStock.find((item) => item.mixingBatchId === batch.id);
    expect(awaitingReceipt).toBeTruthy();
    expect(awaitingReceipt?.labStatus).toBe('PASS');
    expect(awaitingReceipt?.stockStatus).toBe('AWAITING_RECEIPT');

    const releaseResponse = await request.post(`/api/batches/${batch.id}/transition`, {
      headers: bearer(auth.token),
      data: {
        status: 'RELEASED_TO_BLANKING',
        reason: 'PW manager release after laboratory PASS.',
      },
    });
    expect(releaseResponse.status()).toBe(200);
    const released = (await releaseResponse.json()) as BatchView;
    expect(released.status).toBe('RELEASED_TO_BLANKING');
    expect(released.releaseStatus).toBe('APPROVED_FOR_BLANKING');

    await page.reload();
    const persistedSampleCard = page
      .locator('div.card')
      .filter({ hasText: sample.sampleId })
      .first();
    await expect(persistedSampleCard).toContainText('Pass');
    await expect(persistedSampleCard).toContainText(
      'PW manual PASS; no automatic limits applied.',
    );
  });

  test('FAIL, HOLD and RETEST decisions drive their exact backend states', async ({
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const failedBatch = await createStageTwoCompletedBatch(
      request,
      auth.token,
      `${runId}-FAIL`,
    );
    const failedSample = await sendSample(request, auth.token, failedBatch.id);

    const pendingDecisionResponse = await request.post(
      `/api/lab/samples/${failedSample.id}/results`,
      {
        headers: bearer(auth.token),
        data: { decision: 'PENDING', additionalResults: [] },
      },
    );
    expect(pendingDecisionResponse.status()).toBe(409);
    expect((await pendingDecisionResponse.json()).message).toMatch(
      /select pass, fail, hold, or retest/i,
    );

    const failResponse = await request.post(
      `/api/lab/samples/${failedSample.id}/results`,
      {
        headers: bearer(auth.token),
        data: {
          hardness: 50,
          decision: 'FAIL',
          comments: 'PW failure approved for reprocessing.',
          reprocessingDecision: true,
          additionalResults: [],
        },
      },
    );
    expect(failResponse.status()).toBe(200);
    const failedResult = (await failResponse.json()) as LabSampleView;
    expect(failedResult.decision).toBe('FAIL');
    expect(failedResult.reprocessingDecision).toBe(true);
    const failedBatchRead = (await (
      await request.get(`/api/batches/${failedBatch.id}`, {
        headers: bearer(auth.token),
      })
    ).json()) as BatchView;
    expect(failedBatchRead.status).toBe('REPROCESSING');
    expect(failedBatchRead.laboratoryStatus).toBe('FAIL');
    expect(failedBatchRead.releaseStatus).toBe('REPROCESSING_REQUIRED');

    const holdBatch = await createStageTwoCompletedBatch(
      request,
      auth.token,
      `${runId}-HOLD`,
    );
    const holdSample = await sendSample(request, auth.token, holdBatch.id);
    const holdResponse = await request.post(
      `/api/lab/samples/${holdSample.id}/results`,
      {
        headers: bearer(auth.token),
        data: {
          decision: 'HOLD',
          comments: 'PW held for management review.',
          additionalResults: [],
        },
      },
    );
    expect(holdResponse.status()).toBe(200);
    const holdBatchRead = (await (
      await request.get(`/api/batches/${holdBatch.id}`, {
        headers: bearer(auth.token),
      })
    ).json()) as BatchView;
    expect(holdBatchRead.status).toBe('ON_HOLD');
    expect(holdBatchRead.laboratoryStatus).toBe('HOLD');
    expect(holdBatchRead.releaseStatus).toBe('BLOCKED');

    const retestBatch = await createStageTwoCompletedBatch(
      request,
      auth.token,
      `${runId}-RETEST`,
    );
    const retestSample = await sendSample(request, auth.token, retestBatch.id);
    const retestResponse = await request.post(
      `/api/lab/samples/${retestSample.id}/results`,
      {
        headers: bearer(auth.token),
        data: {
          decision: 'RETEST',
          comments: 'PW retest required.',
          additionalResults: [],
        },
      },
    );
    expect(retestResponse.status()).toBe(200);
    const retestBatchRead = (await (
      await request.get(`/api/batches/${retestBatch.id}`, {
        headers: bearer(auth.token),
      })
    ).json()) as BatchView;
    expect(retestBatchRead.status).toBe('RETEST_REQUIRED');
    expect(retestBatchRead.laboratoryStatus).toBe('RETEST');
    expect(retestBatchRead.releaseStatus).toBe('BLOCKED');

    const secondSample = await sendSample(request, auth.token, retestBatch.id);
    expect(secondSample.id).not.toBe(retestSample.id);
    expect(secondSample.decision).toBe('PENDING');
    const retestQueuedBatch = (await (
      await request.get(`/api/batches/${retestBatch.id}`, {
        headers: bearer(auth.token),
      })
    ).json()) as BatchView;
    expect(retestQueuedBatch.status).toBe('WAITING_FOR_LAB');
  });
});
