import { expect, test } from '@playwright/test';
import {
  bearer,
  createReleasedMixingBatch,
  loginAsAdmin,
  type TestBatch,
} from './helpers/workflows';

type Traceability = {
  batchNumber: string;
  factoryReference: string;
  recipeCode: string;
  compoundName: string;
  revisionNumber: string;
  actualOutputQuantityKg: number;
  currentStatus: string;
  laboratoryDecision: string;
  sampleId: string;
  testDateTime: string;
  releaseStatus: string;
  stage1StartedAt: string;
  stage1CompletedAt: string;
  stage2StartedAt: string;
  stage2CompletedAt: string;
};

test.describe('QR and Public Batch Traceability', () => {
  test('released batch exposes safe public production facts and a PNG QR', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const { batch } = await createReleasedMixingBatch(request, auth.token, unique, 175);

    const publicResponse = await request.get(`/api/public/trace/${batch.traceabilityCode}`);
    expect(publicResponse.status()).toBe(200);
    const trace = (await publicResponse.json()) as Traceability;
    expect(trace).toMatchObject({
      batchNumber: batch.batchNumber,
      factoryReference: batch.factoryReference,
      recipeCode: batch.recipeCode,
      actualOutputQuantityKg: 175,
      currentStatus: 'RELEASED_TO_BLANKING',
      laboratoryDecision: 'PASS',
      releaseStatus: 'APPROVED_FOR_BLANKING',
    });
    expect(trace.sampleId).toBeTruthy();
    expect(trace.testDateTime).toBeTruthy();
    expect(trace.stage1StartedAt).toBeTruthy();
    expect(trace.stage1CompletedAt).toBeTruthy();
    expect(trace.stage2StartedAt).toBeTruthy();
    expect(trace.stage2CompletedAt).toBeTruthy();
    expect(JSON.stringify(trace)).not.toContain(auth.token);
    expect(JSON.stringify(trace)).not.toContain(auth.user.email);

    const origin = 'http://192.168.10.25:5173';
    const qrResponse = await request.get(`/api/batches/${batch.id}/qr`, {
      headers: { ...bearer(auth.token), 'X-Traceability-Origin': origin },
    });
    expect(qrResponse.status()).toBe(200);
    expect(qrResponse.headers()['content-type']).toContain('image/png');
    expect(qrResponse.headers()['cache-control']).toContain('no-store');
    const qr = await qrResponse.body();
    expect(qr.byteLength).toBeGreaterThan(500);
    expect(Array.from(qr.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    await page.goto(`/batches/${batch.id}`);
    await expect(page.getByRole('heading', { name: /batch qr traceability/i })).toBeVisible();
    await expect(page.getByAltText(`QR code for ${batch.batchNumber}`)).toBeVisible();
    const traceLink = page.getByRole('link', { name: /open public trace page/i });
    await expect(traceLink).toHaveAttribute(
      'href',
      `${new URL(page.url()).origin}/trace/${batch.traceabilityCode}`,
    );

    await page.goto(`/trace/${batch.traceabilityCode}`);
    await expect(page.getByText('Batch traceability')).toBeVisible();
    await expect(page.getByRole('heading', { name: batch.factoryReference })).toBeVisible();
    await expect(page.getByText(`${trace.compoundName} · Batch ${batch.batchNumber}`)).toBeVisible();
    await expect(page.getByText(`Revision ${trace.revisionNumber}`)).toBeVisible();
    await expect(page.getByText('Safe production reference')).toBeVisible();
    await expect(page.getByText(/authentication and user information are not encoded/i)).toBeVisible();
  });

  test('unknown traceability codes return a controlled not-found result', async ({ page, request }) => {
    const missing = `PW-NOT-FOUND-${Date.now()}`;
    const response = await request.get(`/api/public/trace/${missing}`);
    expect(response.status()).toBe(404);
    expect((await response.json()).message).toMatch(/traceability record not found/i);

    await page.goto(`/trace/${missing}`);
    await expect(page.getByRole('main').getByText(/traceability record not found/i)).toBeVisible();
  });

  test('stored traceability reference is stable across repeated batch reads', async ({ request }) => {
    const auth = await loginAsAdmin(request);
    const batchesResponse = await request.get('/api/batches', { headers: bearer(auth.token) });
    expect(batchesResponse.status()).toBe(200);
    const batches = (await batchesResponse.json()) as TestBatch[];
    const batch = batches.find((item) => item.traceabilityCode);
    expect(batch).toBeTruthy();

    const first = await request.get(`/api/batches/${batch!.id}`, { headers: bearer(auth.token) });
    const second = await request.get(`/api/batches/${batch!.id}`, { headers: bearer(auth.token) });
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect(((await first.json()) as TestBatch).traceabilityCode).toBe(batch!.traceabilityCode);
    expect(((await second.json()) as TestBatch).traceabilityCode).toBe(batch!.traceabilityCode);
  });
});
