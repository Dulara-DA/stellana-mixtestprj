import { expect, test } from '@playwright/test';
import {
  bearer,
  createReleasedMixingBatch,
  loginAsAdmin,
  type TestCompoundStock,
} from './helpers/workflows';

type BlankingBatch = {
  id: number;
  batchNumber: string;
  mixingBatchNumber: string;
  approvedMaterialBatchId: number;
  status: string;
  availableGoodBlankQuantity: number;
};
type Cart = {
  id: number;
  cartNumber: string;
  blankingBatchId: number;
  mixingBatchNumber: string;
  quantity: number;
  remainingQuantity: number;
  status: string;
};
type Genealogy = {
  compoundStock: TestCompoundStock;
  blankingBatches: BlankingBatch[];
  carts: Cart[];
  inventoryTransactions: Array<{
    id: number;
    sourceRecordId?: number;
    destinationRecordId?: number;
    actor: { id: number };
    transactionTime: string;
  }>;
};

test.describe('H2 Data Persistence and Relationship Integrity', () => {
  test('TEST production chain survives reload, a fresh browser context and repeated reads', async ({
    browser,
    page,
    request,
  }, testInfo) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const { batch, stock } = await createReleasedMixingBatch(request, auth.token, unique, 150);

    const receipt = await request.patch(`/api/blanking/compound-stock/${stock.id}/receipt`, {
      headers: bearer(auth.token),
      data: {
        receivedQuantityKg: 150,
        reason: `TEST persistence receipt ${unique}.`,
      },
    });
    expect(receipt.status()).toBe(200);

    const blankingNumber = `TEST-BLK-PERSIST-${unique}`;
    const createBlanking = await request.post('/api/blanking/batches', {
      headers: bearer(auth.token),
      data: {
        batchNumber: blankingNumber,
        approvedMaterialBatchId: stock.id,
        materialConsumedKg: 15,
        plannedProductionQuantity: 75,
        itemCode: `TEST-ITEM-PERSIST-${unique}`,
        millOperator: `TEST-MILL-PERSIST-${unique} - TEST Mill Operator`,
        preformerOperator: `TEST-PREF-PERSIST-${unique} - TEST Performer Operator`,
        averageBlankWeightGrams: 200,
        notes: 'TEST durable relationship verification.',
        startImmediately: false,
      },
    });
    expect(createBlanking.status()).toBe(200);
    const planned = (await createBlanking.json()) as BlankingBatch;

    const start = await request.post(`/api/blanking/batches/${planned.id}/start`, {
      headers: bearer(auth.token),
    });
    expect(start.status()).toBe(200);
    const complete = await request.post(`/api/blanking/batches/${planned.id}/complete`, {
      headers: bearer(auth.token),
      data: {
        productionQuantity: 75,
        actualGoodBlankQuantity: 75,
        rejectedQuantity: 0,
        rejectedMaterialWeightKg: 0,
        measuredRemainingCompoundWeightKg: 0,
        supervisorConfirmation: false,
        notes: 'TEST persistence completion.',
      },
    });
    expect(complete.status()).toBe(200);
    const blanking = (await complete.json()) as BlankingBatch;
    expect(blanking.status).toBe('READY');

    const cartNumber = `TEST-CART-PERSIST-${unique}`;
    const createCart = await request.post('/api/blanking/carts', {
      headers: bearer(auth.token),
      data: {
        cartNumber,
        blankingBatchId: blanking.id,
        quantity: 70,
        averageBlankWeightGrams: 200,
        destinationPressId: null,
        blankingNote: 'TEST persistence cart.',
      },
    });
    expect(createCart.status()).toBe(200);
    const cart = (await createCart.json()) as Cart;

    await page.goto(`/batches/${batch.id}`);
    await expect(page.getByText(batch.factoryReference, { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(batch.factoryReference, { exact: true }).first()).toBeVisible();

    const baseURL = String(testInfo.project.use.baseURL);
    const freshContext = await browser.newContext({
      baseURL,
      storageState: 'playwright/.auth/admin.json',
    });
    try {
      const freshPage = await freshContext.newPage();
      await freshPage.goto(`/blanking/batches`);
      await expect(freshPage.getByText(blankingNumber, { exact: true }).first()).toBeVisible();
      await expect(freshPage.getByText(cartNumber, { exact: true }).first()).toBeVisible();

      await freshPage.goto('/blanking/stock');
      await freshPage
        .getByPlaceholder(/compound code, name or batch no/i)
        .fill(batch.batchNumber);
      await expect(freshPage.getByText(batch.batchNumber, { exact: true })).toBeVisible();
      await expect(
        freshPage.locator('tbody tr').filter({ hasText: batch.batchNumber }).first(),
      ).toContainText('135.000 kg available');
    } finally {
      await freshContext.close();
    }

    const readBatch = async () => {
      const response = await request.get(`/api/batches/${batch.id}`, {
        headers: bearer(auth.token),
      });
      expect(response.status()).toBe(200);
      return response.json();
    };
    const firstBatch = await readBatch();
    const secondBatch = await readBatch();
    for (const field of [
      'id',
      'batchNumber',
      'recipeRevisionId',
      'traceabilityCode',
      'status',
      'laboratoryStatus',
      'releaseStatus',
      'stage1StartedAt',
      'stage2CompletedAt',
    ]) {
      expect(secondBatch[field], `stable batch field ${field}`).toEqual(firstBatch[field]);
    }

    const readGenealogy = async () => {
      const response = await request.get(
        `/api/production-manager/genealogy/${encodeURIComponent(batch.batchNumber)}`,
        { headers: bearer(auth.token) },
      );
      expect(response.status()).toBe(200);
      return (await response.json()) as Genealogy;
    };
    const firstGenealogy = await readGenealogy();
    const secondGenealogy = await readGenealogy();
    expect(firstGenealogy.compoundStock.id).toBe(stock.id);
    expect(firstGenealogy.compoundStock.mixingBatchNumber).toBe(batch.batchNumber);
    expect(firstGenealogy.compoundStock.availableQuantityKg).toBe(135);
    expect(firstGenealogy.blankingBatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: blanking.id,
          batchNumber: blankingNumber,
          mixingBatchNumber: batch.batchNumber,
          approvedMaterialBatchId: stock.id,
        }),
      ]),
    );
    expect(firstGenealogy.carts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: cart.id,
          cartNumber,
          blankingBatchId: blanking.id,
          mixingBatchNumber: batch.batchNumber,
          quantity: 70,
          remainingQuantity: 70,
        }),
      ]),
    );
    expect(firstGenealogy.inventoryTransactions.length).toBeGreaterThanOrEqual(4);
    expect(firstGenealogy.inventoryTransactions.every((item) => item.actor.id > 0)).toBe(true);
    expect(secondGenealogy.inventoryTransactions.map((item) => item.id)).toEqual(
      firstGenealogy.inventoryTransactions.map((item) => item.id),
    );
  });
});
