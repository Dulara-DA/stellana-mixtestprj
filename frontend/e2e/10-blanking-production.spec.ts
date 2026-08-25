import { expect, test } from '@playwright/test';
import {
  bearer,
  createReleasedMixingBatch,
  loginAsAdmin,
  TestCompoundStock,
} from './helpers/workflows';

type BlankingBatchView = {
  id: number;
  batchNumber: string;
  approvedMaterialBatchId?: number;
  mixingBatchNumber: string;
  materialCode: string;
  itemCode?: string;
  millOperator?: string;
  preformerOperator?: string;
  materialConsumedKg: number;
  averageBlankWeightGrams?: number;
  productionQuantity?: number;
  actualGoodBlankQuantity?: number;
  rejectedQuantity?: number;
  rejectedMaterialWeightKg?: number;
  actualUsedCompoundWeightKg?: number;
  remainingCompoundWeightKg?: number;
  availableGoodBlankQuantity: number;
  assignedToCartsQuantity: number;
  productionDate: string;
  shift: string;
  startTime?: string;
  endTime?: string;
  operator: { id: number; fullName: string; employeeId: string; role: string };
  operatorEmployeeId: string;
  notes?: string;
  status: string;
};

type BlankingCartView = {
  id: number;
  cartNumber: string;
  blankingBatchId: number;
  blankingBatchNumber: string;
  mixingBatchNumber: string;
  materialCode: string;
  itemCode?: string;
  quantity: number;
  remainingQuantity: number;
  averageBlankWeightGrams: number;
  materialWeightKg: number;
  productionDate: string;
  shift: string;
  createdAt: string;
  createdBy: { id: number; role: string };
  status: string;
};

test.describe('Stellana Blanking Production and Compound Stock', () => {
  test('blanking production and compound stock pages load their operational APIs', async ({
    page,
  }) => {
    const batchesPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/blanking/batches',
    );
    const cartsPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/blanking/carts',
    );
    await page.goto('/blanking/batches');
    expect((await batchesPromise).status()).toBe(200);
    expect((await cartsPromise).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Blanking production records' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Record batch and cart' })).toBeVisible();

    const stockPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/blanking/compound-stock',
    );
    await page.goto('/blanking/stock');
    expect((await stockPromise).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Compound stock' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Compound-wise stock table' }),
    ).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Remaining Quantity' })).toBeVisible();
    const showBatchRecords = page.getByRole('button', { name: /show dated batch records/i }).first();
    await expect(showBatchRecords).toBeVisible();
    await showBatchRecords.click();
    await expect(page.getByRole('button', {
      name: /view distribution for batch .+ kg remaining/i,
    }).first()).toBeVisible();
  });

  test('approved compound receipt, blanking output, rejects and cart balances persist', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const { batch: mixingBatch, stock: queuedStock } =
      await createReleasedMixingBatch(request, auth.token, unique, 200);
    expect(queuedStock.stockStatus).toBe('AWAITING_RECEIPT');
    expect(queuedStock.receivedQuantityKg).toBe(0);
    expect(queuedStock.availableQuantityKg).toBe(0);

    await page.goto('/blanking/stock');
    await page
      .getByPlaceholder(/compound code, name or batch no/i)
      .fill(mixingBatch.batchNumber);
    const stockRow = page.locator('tbody tr').filter({ hasText: mixingBatch.batchNumber }).first();
    await expect(stockRow).toContainText('Awaiting Receipt');
    await stockRow.getByRole('button', { name: /receive compound/i }).click();
    await page.getByLabel('Actual total received (kg)').fill('200');
    await page
      .getByLabel('Reason for manual update')
      .fill('TEST physical scale receipt confirmed for blanking test.');
    const receiptPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/blanking/compound-stock/${queuedStock.id}/receipt`,
    );
    await page.getByRole('button', { name: /save receipt update/i }).click();
    const receiptResponse = await receiptPromise;
    expect(receiptResponse.status()).toBe(200);
    const receivedStock = (await receiptResponse.json()) as TestCompoundStock;
    expect(receivedStock.receivedQuantityKg).toBe(200);
    expect(receivedStock.availableQuantityKg).toBe(200);
    expect(receivedStock.stockStatus).toBe('AVAILABLE');

    const blankingBatchNumber = `TEST-BLK-${unique}`;
    const itemCode = `TEST-ITEM-${unique}`;
    const createResponse = await request.post('/api/blanking/batches', {
      headers: bearer(auth.token),
      data: {
        batchNumber: blankingBatchNumber,
        approvedMaterialBatchId: queuedStock.id,
        materialConsumedKg: 20,
        plannedProductionQuantity: 100,
        itemCode,
        millOperator: `TEST-EPF-MILL-${unique} - TEST Mill Operator`,
        preformerOperator: `TEST-EPF-PREF-${unique} - TEST Performer Operator`,
        averageBlankWeightGrams: 180,
        notes: 'TEST approved compound blanking batch.',
        startImmediately: false,
      },
    });
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()) as BlankingBatchView;
    expect(created.status).toBe('PLANNED');
    expect(created.approvedMaterialBatchId).toBe(queuedStock.id);
    expect(created.mixingBatchNumber).toBe(mixingBatch.batchNumber);
    expect(created.materialConsumedKg).toBe(20);
    expect(created.itemCode).toBe(itemCode);
    expect(created.productionDate).toBeTruthy();
    expect(created.shift).toMatch(/^SHIFT_[ABC]$/);
    expect(created.operator.role).toBe('SYSTEM_ADMIN');
    expect(created.operatorEmployeeId).toBeTruthy();

    const stockAfterReserveResponse = await request.get('/api/blanking/compound-stock', {
      headers: bearer(auth.token),
    });
    const stockAfterReserve = (
      (await stockAfterReserveResponse.json()) as TestCompoundStock[]
    ).find((item) => item.id === queuedStock.id)!;
    expect(stockAfterReserve.availableQuantityKg).toBe(180);
    expect(stockAfterReserve.reservedQuantityKg).toBe(20);
    expect(stockAfterReserve.stockStatus).toBe('PARTIALLY_USED');

    await page.goto('/blanking/stock');
    await page
      .getByPlaceholder(/compound code, name or batch no/i)
      .fill(mixingBatch.batchNumber);
    await page.getByRole('button', { name: /show dated batch records/i }).click();
    const remainingStockRow = page.locator('tbody tr').filter({
      hasText: mixingBatch.batchNumber,
    }).first();
    await expect(remainingStockRow.getByRole('button', {
      name: new RegExp(`view distribution for batch ${mixingBatch.batchNumber}, 180\\.000 kg remaining`, 'i'),
    })).toBeVisible();
    await expect(remainingStockRow).toContainText('Original received 200.000 kg');
    await expect(remainingStockRow).toContainText('20.000 kg allocated to Blanking');

    const startResponse = await request.post(
      `/api/blanking/batches/${created.id}/start`,
      { headers: bearer(auth.token) },
    );
    expect(startResponse.status()).toBe(200);
    const started = (await startResponse.json()) as BlankingBatchView;
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.startTime).toBeTruthy();

    const invalidBalanceResponse = await request.post(
      `/api/blanking/batches/${created.id}/complete`,
      {
        headers: bearer(auth.token),
        data: {
          productionQuantity: 100,
          actualGoodBlankQuantity: 100,
          rejectedQuantity: 5,
          rejectedMaterialWeightKg: 1,
        },
      },
    );
    expect(invalidBalanceResponse.status()).toBe(409);
    expect((await invalidBalanceResponse.json()).message).toMatch(
      /total production must equal actual good blanks plus rejected/i,
    );

    const completeResponse = await request.post(
      `/api/blanking/batches/${created.id}/complete`,
      {
        headers: bearer(auth.token),
        data: {
          productionQuantity: 100,
          actualGoodBlankQuantity: 95,
          rejectedQuantity: 5,
          rejectedMaterialWeightKg: 1,
          measuredRemainingCompoundWeightKg: 1.9,
          supervisorConfirmation: false,
          notes: 'TEST blanking completion with five rejected blanks.',
        },
      },
    );
    expect(completeResponse.status()).toBe(200);
    const completed = (await completeResponse.json()) as BlankingBatchView;
    expect(completed.status).toBe('READY');
    expect(completed.productionQuantity).toBe(100);
    expect(completed.actualGoodBlankQuantity).toBe(95);
    expect(completed.rejectedQuantity).toBe(5);
    expect(completed.rejectedMaterialWeightKg).toBe(1);
    expect(completed.actualUsedCompoundWeightKg).toBe(17.1);
    expect(completed.remainingCompoundWeightKg).toBe(1.9);
    expect(completed.availableGoodBlankQuantity).toBe(95);
    expect(completed.endTime).toBeTruthy();

    const stockAfterCompletionResponse = await request.get(
      '/api/blanking/compound-stock',
      { headers: bearer(auth.token) },
    );
    const stockAfterCompletion = (
      (await stockAfterCompletionResponse.json()) as TestCompoundStock[]
    ).find((item) => item.id === queuedStock.id)!;
    expect(stockAfterCompletion.availableQuantityKg).toBe(181.9);
    expect(stockAfterCompletion.reservedQuantityKg).toBe(0);
    expect(stockAfterCompletion.consumedQuantityKg).toBe(18.1);
    expect(stockAfterCompletion.returnedQuantityKg).toBe(1.9);

    const cartNumber = `TEST-CART-${unique}`;
    const cartResponse = await request.post('/api/blanking/carts', {
      headers: bearer(auth.token),
      data: {
        cartNumber,
        blankingBatchId: created.id,
        quantity: 90,
        averageBlankWeightGrams: 180,
        destinationPressId: null,
        blankingNote: 'TEST cart prepared for Moulding.',
      },
    });
    expect(cartResponse.status()).toBe(200);
    const cart = (await cartResponse.json()) as BlankingCartView;
    expect(cart.status).toBe('PREPARED');
    expect(cart.quantity).toBe(90);
    expect(cart.remainingQuantity).toBe(90);
    expect(cart.averageBlankWeightGrams).toBe(180);
    expect(cart.materialWeightKg).toBe(16.2);
    expect(cart.productionDate).toBeTruthy();
    expect(cart.shift).toMatch(/^SHIFT_[ABC]$/);
    expect(cart.createdAt).toBeTruthy();
    expect(cart.createdBy.role).toBe('SYSTEM_ADMIN');

    const batchesResponse = await request.get('/api/blanking/batches', {
      headers: bearer(auth.token),
    });
    const persistedBatch = (
      (await batchesResponse.json()) as BlankingBatchView[]
    ).find((item) => item.id === created.id)!;
    expect(persistedBatch.assignedToCartsQuantity).toBe(90);
    expect(persistedBatch.availableGoodBlankQuantity).toBe(5);

    await page.goto('/blanking/batches');
    await expect(page.getByText(blankingBatchNumber, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(cartNumber, { exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).toContainText(itemCode);
    await expect(page.locator('body')).toContainText('TEST Mill Operator');
  });
});
