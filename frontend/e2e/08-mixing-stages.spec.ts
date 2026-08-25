import { APIRequestContext, expect, Page, test } from '@playwright/test';

type UserView = {
  id: number;
  fullName: string;
  role: string;
};

type BatchView = {
  id: number;
  batchNumber: string;
  factoryReference: string;
  status: string;
  currentStage: number;
  actualOutputQuantityKg?: number;
  stage1StartedAt?: string;
  stage1CompletedAt?: string;
  stage2StartedAt?: string;
  stage2CompletedAt?: string;
};

type StageView = {
  id: number;
  batchId: number;
  stageNumber: number;
  startTime?: string;
  endTime?: string;
  officer: UserView;
  machine: string;
  plannedQuantity: number;
  actualQuantity?: number;
  temperatureCelsius?: number;
  mixingTimeSeconds?: number;
  speedRpm?: number;
  notes?: string;
  completionStatus: 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'OVERRIDDEN';
  managerOverride: boolean;
  pauseEvents: Array<{
    id: number;
    pausedAt: string;
    resumedAt?: string;
    reason: string;
  }>;
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

async function createReadyBatch(
  request: APIRequestContext,
  token: string,
  unique: string,
) {
  const recipeResponse = await request.post('/api/recipes/revisions', {
    headers: bearer(token),
    data: {
      recipeCode: `PW-REC-STAGE-${unique}`,
      compoundName: `PW Stage Compound ${unique}`,
      revisionNumber: '1',
      effectiveDate: new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
      revisionNotes: 'PW recipe for Stage 1 and Stage 2 controls.',
      ingredients: [
        {
          materialCode: `PW-RM-STAGE-${unique}-1`,
          materialName: 'PW Stage 1 Rubber',
          requiredQuantity: 195,
          unit: 'kg',
          additionSequence: 1,
          stageNumber: 1,
        },
        {
          materialCode: `PW-RM-STAGE-${unique}-2`,
          materialName: 'PW Stage 2 Sulphur',
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
      batchNumber: `PW-BATCH-STAGE-${unique}`,
      recipeRevisionId: recipe.id,
      plannedQuantityKg: 200,
      machine: `PW-MIXER-STAGE-${unique}`,
      assignedOfficerId: officers[0].id,
    },
  });
  expect(batchResponse.status()).toBe(200);
  const batch = (await batchResponse.json()) as BatchView;

  const readyResponse = await request.post(`/api/batches/${batch.id}/transition`, {
    headers: bearer(token),
    data: {
      status: 'READY_FOR_STAGE_1',
      reason: 'PW materials confirmed ready for stage testing.',
    },
  });
  expect(readyResponse.status()).toBe(200);
  expect(((await readyResponse.json()) as BatchView).status).toBe('READY_FOR_STAGE_1');
  return batch;
}

function stagePanel(page: Page, stageNumber: 1 | 2) {
  return page
    .locator('section')
    .filter({
      has: page.getByRole('heading', {
        name: `Stage ${stageNumber}`,
        exact: true,
      }),
    })
    .first();
}

test.describe('Stellana Mixing Stage Controls', () => {
  test('stage page loads batches and backend rejects Stage 2 without an override', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const batch = await createReadyBatch(request, auth.token, unique);

    const invalidStageTwoResponse = await request.post('/api/stages/start', {
      headers: bearer(auth.token),
      data: {
        batchId: batch.id,
        stageNumber: 2,
        machine: `PW-MIXER-STAGE-${unique}`,
        managerOverride: false,
      },
    });
    expect(invalidStageTwoResponse.status()).toBe(409);
    expect((await invalidStageTwoResponse.json()).message).toMatch(
      /stage 1 must be completed before stage 2/i,
    );

    await page.goto(`/stages?batch=${batch.id}`);
    await expect(
      page.getByRole('heading', { name: 'Mixing stage update' }),
    ).toBeVisible();
    await expect(page.getByLabel('Select assigned batch')).toHaveValue(String(batch.id));
    await expect(stagePanel(page, 1)).toContainText('Record IN & start Stage 1');
    await expect(stagePanel(page, 2)).toContainText('Record IN & start Stage 2');
  });

  test('Stage 1 and Stage 2 capture IN, pause/resume, OUT and process values', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const batch = await createReadyBatch(request, auth.token, unique);

    await page.goto(`/stages?batch=${batch.id}`);
    const stageOne = stagePanel(page, 1);
    page.once('dialog', (dialog) => dialog.accept());
    const startOnePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/stages/start' &&
        response.request().method() === 'POST',
    );
    await stageOne
      .getByRole('button', { name: /record in & start stage 1/i })
      .click();
    const startOneResponse = await startOnePromise;
    expect(startOneResponse.status()).toBe(200);
    const startedOne = (await startOneResponse.json()) as StageView;
    expect(startedOne.stageNumber).toBe(1);
    expect(startedOne.completionStatus).toBe('IN_PROGRESS');
    expect(startedOne.startTime).toBeTruthy();
    expect(startedOne.endTime).toBeFalsy();
    await expect(stageOne).toContainText('Processing…');
    await expect(stageOne).toContainText('Mixing time in minutes');

    page.once('dialog', (dialog) => dialog.accept('PW planned machine check.'));
    const pausePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/stages/${startedOne.id}/pause`,
    );
    await stageOne.getByRole('button', { name: /pause stage/i }).click();
    const pauseResponse = await pausePromise;
    expect(pauseResponse.status()).toBe(200);
    const paused = (await pauseResponse.json()) as StageView;
    expect(paused.completionStatus).toBe('PAUSED');
    expect(paused.pauseEvents).toHaveLength(1);
    expect(paused.pauseEvents[0].reason).toBe('PW planned machine check.');

    const completeWhilePaused = await request.post(
      `/api/stages/${startedOne.id}/complete`,
      {
        headers: bearer(auth.token),
        data: { actualQuantity: 198 },
      },
    );
    expect(completeWhilePaused.status()).toBe(409);
    expect((await completeWhilePaused.json()).message).toMatch(/resume the stage/i);

    const resumePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/stages/${startedOne.id}/resume`,
    );
    await stageOne.getByRole('button', { name: /resume stage 1/i }).click();
    const resumeResponse = await resumePromise;
    expect(resumeResponse.status()).toBe(200);
    const resumed = (await resumeResponse.json()) as StageView;
    expect(resumed.completionStatus).toBe('IN_PROGRESS');
    expect(resumed.pauseEvents[0].resumedAt).toBeTruthy();

    await stageOne.getByLabel('Actual quantity (kg)').fill('198');
    await stageOne.getByLabel('Temperature °C').fill('153');
    await stageOne.getByLabel('Mixing time (minutes)').fill('8');
    await stageOne.getByLabel('Speed RPM').fill('40');
    await stageOne.getByLabel('Notes').fill('PW Stage 1 completed normally.');
    page.once('dialog', (dialog) => dialog.accept());
    const completeOnePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/stages/${startedOne.id}/complete`,
    );
    await stageOne
      .getByRole('button', { name: /record out & complete stage 1/i })
      .click();
    const completeOneResponse = await completeOnePromise;
    expect(completeOneResponse.status()).toBe(200);
    const completedOne = (await completeOneResponse.json()) as StageView;
    expect(completedOne.completionStatus).toBe('COMPLETED');
    expect(completedOne.endTime).toBeTruthy();
    expect(completedOne.actualQuantity).toBe(198);
    expect(completedOne.temperatureCelsius).toBe(153);
    expect(completedOne.mixingTimeSeconds).toBe(480);
    expect(completedOne.speedRpm).toBe(40);
    expect(completedOne.notes).toBe('PW Stage 1 completed normally.');

    const afterOneResponse = await request.get(`/api/batches/${batch.id}`, {
      headers: bearer(auth.token),
    });
    const afterOne = (await afterOneResponse.json()) as BatchView;
    expect(afterOne.status).toBe('READY_FOR_STAGE_2');
    expect(afterOne.stage1StartedAt).toBeTruthy();
    expect(afterOne.stage1CompletedAt).toBeTruthy();
    await expect(stageOne).toContainText('Stage 1 issued to Stage 2');

    const stageTwo = stagePanel(page, 2);
    page.once('dialog', (dialog) => dialog.accept());
    const startTwoPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/stages/start' &&
        response.request().method() === 'POST',
    );
    await stageTwo
      .getByRole('button', { name: /record in & start stage 2/i })
      .click();
    const startTwoResponse = await startTwoPromise;
    expect(startTwoResponse.status()).toBe(200);
    const startedTwo = (await startTwoResponse.json()) as StageView;
    expect(startedTwo.stageNumber).toBe(2);
    expect(startedTwo.completionStatus).toBe('IN_PROGRESS');

    const invalidQuantityResponse = await request.post(
      `/api/stages/${startedTwo.id}/complete`,
      {
        headers: bearer(auth.token),
        data: { actualQuantity: 0 },
      },
    );
    expect(invalidQuantityResponse.status()).toBe(400);
    expect((await invalidQuantityResponse.json()).fieldErrors.actualQuantity).toBeTruthy();

    await stageTwo.getByLabel('Actual quantity (kg)').fill('196.5');
    await stageTwo.getByLabel('Temperature °C').fill('110');
    await stageTwo.getByLabel('Mixing time (minutes)').fill('4');
    await stageTwo.getByLabel('Speed RPM').fill('30');
    await stageTwo.getByLabel('Notes').fill('PW Stage 2 sulphur addition completed.');
    page.once('dialog', (dialog) => dialog.accept());
    const completeTwoPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/stages/${startedTwo.id}/complete`,
    );
    await stageTwo
      .getByRole('button', { name: /record out & complete stage 2/i })
      .click();
    const completeTwoResponse = await completeTwoPromise;
    expect(completeTwoResponse.status()).toBe(200);
    const completedTwo = (await completeTwoResponse.json()) as StageView;
    expect(completedTwo.completionStatus).toBe('COMPLETED');
    expect(completedTwo.actualQuantity).toBe(196.5);
    expect(completedTwo.mixingTimeSeconds).toBe(240);
    expect(completedTwo.endTime).toBeTruthy();

    const completedBatchResponse = await request.get(`/api/batches/${batch.id}`, {
      headers: bearer(auth.token),
    });
    expect(completedBatchResponse.status()).toBe(200);
    const completedBatch = (await completedBatchResponse.json()) as BatchView;
    expect(completedBatch.status).toBe('STAGE_2_COMPLETED');
    expect(completedBatch.currentStage).toBe(2);
    expect(completedBatch.actualOutputQuantityKg).toBe(196.5);
    expect(completedBatch.stage2StartedAt).toBeTruthy();
    expect(completedBatch.stage2CompletedAt).toBeTruthy();

    const stagesResponse = await request.get(`/api/stages/batch/${batch.id}`, {
      headers: bearer(auth.token),
    });
    expect(stagesResponse.status()).toBe(200);
    const persistedStages = (await stagesResponse.json()) as StageView[];
    expect(persistedStages).toHaveLength(2);
    expect(persistedStages.map((stage) => stage.stageNumber)).toEqual([1, 2]);
    expect(persistedStages.every((stage) => stage.endTime)).toBeTruthy();

    await page.reload();
    await expect(stagePanel(page, 1)).toContainText('Actual 198 kg');
    await expect(stagePanel(page, 2)).toContainText('Actual 196.5 kg');
  });
});
