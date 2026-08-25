import { APIRequestContext, expect } from '@playwright/test';

export type TestUser = {
  id: number;
  fullName: string;
  employeeId: string;
  email: string;
  role: string;
  active: boolean;
};

export type TestBatch = {
  id: number;
  batchNumber: string;
  factoryReference: string;
  recipeCode: string;
  status: string;
  laboratoryStatus: string;
  releaseStatus: string;
  actualOutputQuantityKg?: number;
  traceabilityCode: string;
};

export type TestCompoundStock = {
  id: number;
  mixingBatchId?: number;
  mixingBatchNumber: string;
  materialCode: string;
  compoundName: string;
  labStatus: string;
  approvedQuantityKg: number;
  availableQuantityKg: number;
  plannedQuantityKg: number;
  receivedQuantityKg: number;
  reservedQuantityKg: number;
  consumedQuantityKg: number;
  returnedQuantityKg: number;
  stockStatus: string;
};

export async function loginAsAdmin(request: APIRequestContext) {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('TEST_EMAIL or TEST_PASSWORD is missing from .env.playwright');
  }
  const response = await request.post('/api/auth/login', {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { token: string; user: TestUser };
  expect(body.token).toBeTruthy();
  expect(body.user.role).toBe('SYSTEM_ADMIN');
  return body;
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function alphabeticTestSuffix(value: string) {
  const digits = value.replace(/\D/g, '');
  let number = BigInt(digits || Date.now().toString());
  let suffix = '';

  do {
    suffix = String.fromCharCode(65 + Number(number % 26n)) + suffix;
    number /= 26n;
  } while (number > 0n);

  return suffix;
}

export async function getMixingOfficers(
  request: APIRequestContext,
  token: string,
) {
  const response = await request.get('/api/users/officers', {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  const officers = (await response.json()) as TestUser[];
  expect(officers.length).toBeGreaterThan(0);
  return officers;
}

export async function createReleasedMixingBatch(
  request: APIRequestContext,
  token: string,
  unique: string,
  outputQuantityKg = 200,
) {
  const suffix = alphabeticTestSuffix(unique);
  const recipeResponse = await request.post('/api/recipes/revisions', {
    headers: bearer(token),
    data: {
      recipeCode: `TEST-A-96-50-${suffix}`,
      compoundName: `TEST A-96-50 Compound ${suffix}`,
      revisionNumber: '1',
      effectiveDate: new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
      revisionNotes: 'TEST recipe for downstream production workflows.',
      ingredients: [
        {
          materialCode: `TEST-RM-A-96-50-${suffix}-A`,
          materialName: 'TEST A-96-50 Base Rubber',
          requiredQuantity: outputQuantityKg - 5,
          unit: 'kg',
          additionSequence: 1,
          stageNumber: 1,
        },
        {
          materialCode: `TEST-RM-A-96-50-${suffix}-B`,
          materialName: 'TEST A-96-50 Sulphur',
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
  const officers = await getMixingOfficers(request, token);

  const batchResponse = await request.post('/api/batches', {
    headers: bearer(token),
    data: {
      batchNumber: `TEST-6160-${suffix}`,
      recipeRevisionId: recipe.id,
      plannedQuantityKg: outputQuantityKg,
      machine: `TEST-MIXER-A-96-50-${suffix}`,
      assignedOfficerId: officers[0].id,
    },
  });
  expect(batchResponse.status()).toBe(200);
  let batch = (await batchResponse.json()) as TestBatch;

  const readyResponse = await request.post(`/api/batches/${batch.id}/transition`, {
    headers: bearer(token),
    data: { status: 'READY_FOR_STAGE_1', reason: 'TEST downstream setup.' },
  });
  expect(readyResponse.status()).toBe(200);

  const stageOneStart = await request.post('/api/stages/start', {
    headers: bearer(token),
    data: { batchId: batch.id, stageNumber: 1, machine: `TEST-MIXER-A-96-50-${suffix}` },
  });
  expect(stageOneStart.status()).toBe(200);
  const stageOne = (await stageOneStart.json()) as { id: number };
  expect(
    (
      await request.post(`/api/stages/${stageOne.id}/complete`, {
        headers: bearer(token),
        data: { actualQuantity: outputQuantityKg, mixingTimeSeconds: 480 },
      })
    ).status(),
  ).toBe(200);

  const stageTwoStart = await request.post('/api/stages/start', {
    headers: bearer(token),
    data: { batchId: batch.id, stageNumber: 2, machine: `TEST-MIXER-A-96-50-${suffix}` },
  });
  expect(stageTwoStart.status()).toBe(200);
  const stageTwo = (await stageTwoStart.json()) as { id: number };
  expect(
    (
      await request.post(`/api/stages/${stageTwo.id}/complete`, {
        headers: bearer(token),
        data: { actualQuantity: outputQuantityKg, mixingTimeSeconds: 240 },
      })
    ).status(),
  ).toBe(200);

  const sampleResponse = await request.post(`/api/lab/batches/${batch.id}/send-sample`, {
    headers: bearer(token),
  });
  expect(sampleResponse.status()).toBe(200);
  const sample = (await sampleResponse.json()) as { id: number };
  const resultResponse = await request.post(`/api/lab/samples/${sample.id}/results`, {
    headers: bearer(token),
    data: {
      decision: 'PASS',
      comments: 'TEST downstream stock setup PASS.',
      additionalResults: [],
    },
  });
  expect(resultResponse.status()).toBe(200);

  const releaseResponse = await request.post(`/api/batches/${batch.id}/transition`, {
    headers: bearer(token),
    data: {
      status: 'RELEASED_TO_BLANKING',
      reason: 'TEST release for downstream production testing.',
    },
  });
  expect(releaseResponse.status()).toBe(200);
  batch = (await releaseResponse.json()) as TestBatch;

  const stockResponse = await request.get('/api/blanking/compound-stock', {
    headers: bearer(token),
  });
  expect(stockResponse.status()).toBe(200);
  const stockList = (await stockResponse.json()) as TestCompoundStock[];
  const stock = stockList.find((item) => item.mixingBatchId === batch.id);
  expect(stock, 'released Mixing batch should have a compound stock record').toBeTruthy();
  return { batch, stock: stock! };
}
