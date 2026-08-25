import { expect, test } from '@playwright/test';
import {
  bearer,
  createReleasedMixingBatch,
  loginAsAdmin,
} from './helpers/workflows';

type BlankingBatch = {
  id: number;
  batchNumber: string;
  mixingBatchNumber: string;
  materialCode: string;
  status: string;
};
type ReportRecords = {
  mixingRecords: Array<{ batchNumber: string; laboratoryDecision: string; releaseStatus: string }>;
  blankingRecords: BlankingBatch[];
  mouldingRecords: Array<{ id: number }>;
};
type Genealogy = {
  compoundStock: { id: number; mixingBatchNumber: string; availableQuantityKg: number };
  blankingBatches: BlankingBatch[];
  carts: unknown[];
  receipts: unknown[];
  productionRecords: unknown[];
  returns: unknown[];
  inventoryTransactions: Array<{ transactionType: string; actor: { id: number } }>;
};

test.describe('Production Manager Reports', () => {
  test('manager page keeps Mixing, Blanking and Moulding in ordered sections', async ({ page }) => {
    const summary = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/production-manager/summary',
    );
    const records = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/production-manager/records',
    );
    await page.goto('/production-manager');
    expect((await summary).status()).toBe(200);
    expect((await records).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Mixing, Blanking and Moulding report' }),
    ).toBeVisible();
    const sectionTitles = await page
      .locator('section h2')
      .filter({ hasText: /^(Mixing|Blanking|Moulding) records$/ })
      .allTextContents();
    expect(sectionTitles).toEqual(['Mixing records', 'Blanking records', 'Moulding records']);
    await expect(page.getByLabel('PDF report')).toHaveValue('COMBINED');
  });

  test('exact batch filter, genealogy and inventory movements agree across UI and APIs', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const { batch, stock } = await createReleasedMixingBatch(request, auth.token, unique, 160);

    const receiptResponse = await request.patch(
      `/api/blanking/compound-stock/${stock.id}/receipt`,
      {
        headers: bearer(auth.token),
        data: {
          receivedQuantityKg: 160,
          reason: `TEST production report physical receipt ${unique}.`,
        },
      },
    );
    expect(receiptResponse.status()).toBe(200);

    const blankingNumber = `TEST-BLK-REPORT-${unique}`;
    const blankingResponse = await request.post('/api/blanking/batches', {
      headers: bearer(auth.token),
      data: {
        batchNumber: blankingNumber,
        approvedMaterialBatchId: stock.id,
        materialConsumedKg: 16,
        plannedProductionQuantity: 80,
        itemCode: `TEST-ITEM-REPORT-${unique}`,
        millOperator: `TEST-MILL-REPORT-${unique} - TEST Mill Operator`,
        preformerOperator: `TEST-PREF-REPORT-${unique} - TEST Performer Operator`,
        averageBlankWeightGrams: 200,
        notes: 'TEST batch for sectioned management reporting.',
        startImmediately: false,
      },
    });
    expect(blankingResponse.status()).toBe(200);
    const blanking = (await blankingResponse.json()) as BlankingBatch;
    expect(blanking.mixingBatchNumber).toBe(batch.batchNumber);

    const query = `mixingBatch=${encodeURIComponent(batch.batchNumber)}`;
    const recordsResponse = await request.get(`/api/production-manager/records?${query}`, {
      headers: bearer(auth.token),
    });
    expect(recordsResponse.status()).toBe(200);
    const records = (await recordsResponse.json()) as ReportRecords;
    expect(records.mixingRecords.map((item) => item.batchNumber)).toEqual([batch.batchNumber]);
    expect(records.mixingRecords[0]).toMatchObject({
      laboratoryDecision: 'PASS',
      releaseStatus: 'APPROVED_FOR_BLANKING',
    });
    expect(records.blankingRecords.map((item) => item.batchNumber)).toContain(blankingNumber);
    expect(records.mouldingRecords).toHaveLength(0);

    const summaryResponse = await request.get(`/api/production-manager/summary?${query}`, {
      headers: bearer(auth.token),
    });
    expect(summaryResponse.status()).toBe(200);
    const summary = (await summaryResponse.json()) as {
      compoundRequiredKg: number;
      compoundReceivedKg: number;
      compoundAvailableKg: number;
    };
    expect(summary.compoundRequiredKg).toBe(160);
    expect(summary.compoundReceivedKg).toBe(160);
    expect(summary.compoundAvailableKg).toBe(144);

    const genealogyResponse = await request.get(
      `/api/production-manager/genealogy/${encodeURIComponent(batch.batchNumber)}`,
      { headers: bearer(auth.token) },
    );
    expect(genealogyResponse.status()).toBe(200);
    const genealogy = (await genealogyResponse.json()) as Genealogy;
    expect(genealogy.compoundStock.id).toBe(stock.id);
    expect(genealogy.compoundStock.mixingBatchNumber).toBe(batch.batchNumber);
    expect(genealogy.blankingBatches.map((item) => item.id)).toContain(blanking.id);
    expect(genealogy.inventoryTransactions.length).toBeGreaterThanOrEqual(2);
    expect(genealogy.inventoryTransactions.map((item) => item.transactionType)).toEqual(
      expect.arrayContaining(['COMPOUND_RECEIVED', 'COMPOUND_RESERVED']),
    );
    expect(genealogy.inventoryTransactions.every((item) => item.actor.id > 0)).toBe(true);

    await page.goto('/production-manager');
    await page.getByLabel('Mixing batch').fill(batch.batchNumber);
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/production-manager/records' &&
        url.searchParams.get('mixingBatch') === batch.batchNumber
      );
    });
    await page.getByRole('button', { name: 'Apply filters' }).click();
    expect((await filtered).status()).toBe(200);
    await expect(page.getByText(batch.batchNumber, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(blankingNumber, { exact: true })).toBeVisible();

    await page
      .getByPlaceholder('Enter Mixing/compound batch number')
      .fill(batch.batchNumber);
    await page.getByRole('button', { name: /trace batch/i }).click();
    await expect(page.getByText(stock.materialCode, { exact: true })).toBeVisible();
    await expect(page.getByText('Blanking batches').last()).toBeVisible();
    await expect(page.getByText('1', { exact: true }).last()).toBeVisible();
  });

  test('combined and per-section downloads are valid non-empty PDF files', async ({ request }) => {
    const auth = await loginAsAdmin(request);
    for (const section of ['COMBINED', 'MIXING', 'BLANKING', 'MOULDING'] as const) {
      const response = await request.get(
        `/api/production-manager/report.pdf?section=${section}`,
        { headers: bearer(auth.token) },
      );
      expect(response.status(), `${section} report status`).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect(response.headers()['content-disposition']).toMatch(/attachment;.*filename=/i);
      const pdf = await response.body();
      expect(pdf.byteLength, `${section} report size`).toBeGreaterThan(1000);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('latin1')).toContain('%%EOF');
    }
  });
});
