import { expect, test } from '@playwright/test';
import { bearer, loginAsAdmin } from './helpers/workflows';

type PressView = {
  id: number;
  pressNumber: string;
  pressName: string;
  status: string;
  currentItemCode?: string;
  availableBlankQuantity: number;
  goodTyreQuantity: number;
  rejectedTyreQuantity: number;
  rejectedBlankQuantity: number;
  cartsWaitingToBeReceived: number;
  active: boolean;
};

type BlankingCartView = {
  id: number;
  cartNumber: string;
  blankingBatchId: number;
  quantity: number;
  remainingQuantity: number;
  itemCode?: string;
  destinationPressId?: number;
  destinationPressNumber?: string;
  status: string;
};

type BlankingProductionRecordView = {
  batch: { id: number; batchNumber: string; status: string };
  cart: BlankingCartView;
};

type ReceiptView = {
  id: number;
  receiptNumber: string;
  cartId: number;
  cartNumber: string;
  blankingBatchNumber: string;
  receivedQuantity: number;
  productionDate: string;
  shift: string;
  receivedAt: string;
  receivingOperator: { id: number; role: string; employeeId: string };
  receivingOperatorEmployeeId: string;
  pressId: number;
  pressNumber: string;
  dispatchTime: string;
  receiptStatus: string;
};

type MouldingRecordView = {
  id: number;
  pressId: number;
  pressNumber: string;
  productionDate: string;
  shift: string;
  startTime: string;
  endTime?: string;
  operator: { id: number; role: string; employeeId: string };
  operatorEmployeeId: string;
  cartId: number;
  cartNumber: string;
  blankingBatchId: number;
  blankingBatchNumber: string;
  itemCode?: string;
  compoundCode: string;
  compoundBatchNumber: string;
  quantityReceived: number;
  goodTyreQuantity: number;
  rejectedTyreQuantity: number;
  rejectedTyreWeightPerItemGrams: number;
  totalRejectedTyreWeightGrams: number;
  rejectedBlankQuantity: number;
  remainingBlankQuantity: number;
  downtimeMinutes: number;
  downtimeReason?: string;
  operatorNote?: string;
  status: string;
};

test.describe('Stellana Moulding Cart Receipt and Press Production', () => {
  test('moulding dashboard and production page load current press data', async ({ page }) => {
    const pressesPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/moulding/presses',
    );
    const cartsPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/moulding/upcoming-carts',
    );
    await page.goto('/moulding');
    expect((await pressesPromise).status()).toBe(200);
    expect((await cartsPromise).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Press inventory and incoming carts' }),
    ).toBeVisible();

    await page.goto('/moulding/production');
    await expect(
      page.getByRole('heading', { name: /press production entry details/i }),
    ).toBeVisible();
  });

  test('cart assignment, receipt and press production preserve quantities and operator identity', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const pressesResponse = await request.get('/api/moulding/presses', {
      headers: bearer(auth.token),
    });
    expect(pressesResponse.status()).toBe(200);
    const presses = (await pressesResponse.json()) as PressView[];
    const recordsBeforeResponse = await request.get('/api/moulding/records', {
      headers: bearer(auth.token),
    });
    expect(recordsBeforeResponse.status()).toBe(200);
    const activePressIds = new Set(
      ((await recordsBeforeResponse.json()) as MouldingRecordView[])
        .filter((record) => !record.endTime)
        .map((record) => record.pressId),
    );
    const press = presses.find(
      (item) =>
        item.active &&
        item.availableBlankQuantity === 0 &&
        !activePressIds.has(item.id),
    );
    expect(press, 'an active empty press is required for the isolated PW workflow').toBeTruthy();
    const selectedPress = press!;
    const initialGood = selectedPress.goodTyreQuantity;
    const initialRejectedTyres = selectedPress.rejectedTyreQuantity;
    const initialRejectedBlanks = selectedPress.rejectedBlankQuantity;
    const itemCode = `TEST-ITEM-MOULD-${unique}`;

    const productionRecordResponse = await request.post(
      '/api/blanking/production-records',
      {
        headers: bearer(auth.token),
        data: {
          batchNumber: `TEST-BLK-MOULD-${unique}`,
          materialCode: `PW-CMP-MOULD-${unique}`,
          itemCode,
          millOperator: `PW-MILL-${unique} - PW Mill Operator`,
          preformerOperator: `PW-PREF-${unique} - PW Performer Operator`,
          cartNumber: `TEST-CART-MOULD-${unique}`,
          quantity: 40,
          averageBlankWeightGrams: 200,
          notes: 'PW combined blanking record for Moulding test.',
        },
      },
    );
    expect(productionRecordResponse.status()).toBe(200);
    const prepared = (await productionRecordResponse.json()) as BlankingProductionRecordView;
    expect(prepared.batch.status).toBe('READY');
    expect(prepared.cart.status).toBe('PREPARED');
    expect(prepared.cart.remainingQuantity).toBe(40);

    const itemResponse = await request.patch(
      `/api/moulding/presses/${selectedPress.id}/current-item`,
      {
        headers: bearer(auth.token),
        data: { itemCode },
      },
    );
    expect(itemResponse.status()).toBe(200);
    expect(((await itemResponse.json()) as PressView).currentItemCode).toBe(itemCode);

    const assignResponse = await request.patch(
      `/api/moulding/carts/${prepared.cart.id}/assign`,
      {
        headers: bearer(auth.token),
        data: { pressId: selectedPress.id },
      },
    );
    expect(assignResponse.status()).toBe(200);
    const assigned = (await assignResponse.json()) as BlankingCartView;
    expect(assigned.destinationPressId).toBe(selectedPress.id);
    expect(assigned.destinationPressNumber).toBe(selectedPress.pressNumber);

    const duplicateAssignResponse = await request.patch(
      `/api/moulding/carts/${prepared.cart.id}/assign`,
      {
        headers: bearer(auth.token),
        data: { pressId: selectedPress.id },
      },
    );
    expect(duplicateAssignResponse.status()).toBe(409);
    expect((await duplicateAssignResponse.json()).message).toMatch(/already assigned/i);

    const dispatchResponse = await request.post(
      `/api/blanking/carts/${prepared.cart.id}/dispatch`,
      {
        headers: bearer(auth.token),
        data: { note: 'PW dispatched to assigned press.' },
      },
    );
    expect(dispatchResponse.status()).toBe(200);
    expect(((await dispatchResponse.json()) as BlankingCartView).status).toBe('DISPATCHED');

    const receiveResponse = await request.post(
      `/api/moulding/carts/${prepared.cart.id}/receive`,
      {
        headers: bearer(auth.token),
        data: {
          pressId: selectedPress.id,
          supervisorOverride: false,
          overrideReason: null,
        },
      },
    );
    expect(receiveResponse.status()).toBe(200);
    const receipt = (await receiveResponse.json()) as ReceiptView;
    expect(receipt.cartId).toBe(prepared.cart.id);
    expect(receipt.receivedQuantity).toBe(40);
    expect(receipt.pressId).toBe(selectedPress.id);
    expect(receipt.receiptStatus).toBe('RECEIVED');
    expect(receipt.productionDate).toBeTruthy();
    expect(receipt.shift).toMatch(/^SHIFT_[ABC]$/);
    expect(receipt.receivedAt).toBeTruthy();
    expect(receipt.dispatchTime).toBeTruthy();
    expect(receipt.receivingOperator.role).toBe('SYSTEM_ADMIN');
    expect(receipt.receivingOperatorEmployeeId).toBe(auth.user.employeeId);

    const duplicateReceiptResponse = await request.post(
      `/api/moulding/carts/${prepared.cart.id}/receive`,
      {
        headers: bearer(auth.token),
        data: { pressId: selectedPress.id },
      },
    );
    expect(duplicateReceiptResponse.status()).toBe(409);
    expect((await duplicateReceiptResponse.json()).message).toMatch(
      /only a dispatched cart can be received|already been received/i,
    );

    const startResponse = await request.post('/api/moulding/records/start', {
      headers: bearer(auth.token),
      data: { pressId: selectedPress.id, cartId: prepared.cart.id },
    });
    expect(startResponse.status()).toBe(200);
    const started = (await startResponse.json()) as MouldingRecordView;
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.quantityReceived).toBe(40);
    expect(started.remainingBlankQuantity).toBe(40);
    expect(started.startTime).toBeTruthy();
    expect(started.operator.role).toBe('SYSTEM_ADMIN');
    expect(started.operatorEmployeeId).toBe(auth.user.employeeId);

    const duplicateStartResponse = await request.post('/api/moulding/records/start', {
      headers: bearer(auth.token),
      data: { pressId: selectedPress.id, cartId: prepared.cart.id },
    });
    expect(duplicateStartResponse.status()).toBe(409);

    const excessiveResponse = await request.post(
      `/api/moulding/records/${started.id}/complete`,
      {
        headers: bearer(auth.token),
        data: {
          goodTyreQuantity: 40,
          rejectedTyreQuantity: 1,
          rejectedTyreWeightPerItemGrams: 1500,
          rejectedBlankQuantity: 0,
          downtimeMinutes: 0,
          downtimeReason: null,
          operatorNote: 'PW invalid over-consumption.',
        },
      },
    );
    expect(excessiveResponse.status()).toBe(409);
    expect((await excessiveResponse.json()).message).toMatch(/exceed received blanks/i);

    const completeResponse = await request.post(
      `/api/moulding/records/${started.id}/complete`,
      {
        headers: bearer(auth.token),
        data: {
          goodTyreQuantity: 35,
          rejectedTyreQuantity: 2,
          rejectedTyreWeightPerItemGrams: 1500,
          rejectedBlankQuantity: 1,
          downtimeMinutes: 5,
          downtimeReason: 'PW controlled press adjustment.',
          operatorNote: 'PW first production entry leaves two blanks.',
        },
      },
    );
    expect(completeResponse.status()).toBe(200);
    const completed = (await completeResponse.json()) as MouldingRecordView;
    expect(completed.status).toBe('COMPLETED');
    expect(completed.endTime).toBeTruthy();
    expect(completed.goodTyreQuantity).toBe(35);
    expect(completed.rejectedTyreQuantity).toBe(2);
    expect(completed.rejectedTyreWeightPerItemGrams).toBe(1500);
    expect(completed.totalRejectedTyreWeightGrams).toBe(3000);
    expect(completed.rejectedBlankQuantity).toBe(1);
    expect(completed.remainingBlankQuantity).toBe(2);
    expect(completed.downtimeMinutes).toBe(5);

    const cartsAfterFirstResponse = await request.get('/api/blanking/carts', {
      headers: bearer(auth.token),
    });
    const cartAfterFirst = (
      (await cartsAfterFirstResponse.json()) as BlankingCartView[]
    ).find((cart) => cart.id === prepared.cart.id)!;
    expect(cartAfterFirst.status).toBe('PARTIALLY_CONSUMED');
    expect(cartAfterFirst.remainingQuantity).toBe(2);

    const pressesAfterFirstResponse = await request.get('/api/moulding/presses', {
      headers: bearer(auth.token),
    });
    const pressAfterFirst = (
      (await pressesAfterFirstResponse.json()) as PressView[]
    ).find((item) => item.id === selectedPress.id)!;
    expect(pressAfterFirst.availableBlankQuantity).toBe(2);
    expect(pressAfterFirst.goodTyreQuantity).toBe(initialGood + 35);
    expect(pressAfterFirst.rejectedTyreQuantity).toBe(initialRejectedTyres + 2);
    expect(pressAfterFirst.rejectedBlankQuantity).toBe(initialRejectedBlanks + 1);

    const finalStartResponse = await request.post('/api/moulding/records/start', {
      headers: bearer(auth.token),
      data: { pressId: selectedPress.id, cartId: prepared.cart.id },
    });
    expect(finalStartResponse.status()).toBe(200);
    const finalStarted = (await finalStartResponse.json()) as MouldingRecordView;
    expect(finalStarted.quantityReceived).toBe(2);

    const finalCompleteResponse = await request.post(
      `/api/moulding/records/${finalStarted.id}/complete`,
      {
        headers: bearer(auth.token),
        data: {
          goodTyreQuantity: 2,
          rejectedTyreQuantity: 0,
          rejectedTyreWeightPerItemGrams: 0,
          rejectedBlankQuantity: 0,
          downtimeMinutes: 0,
          downtimeReason: null,
          operatorNote: 'PW final two blanks consumed.',
        },
      },
    );
    expect(finalCompleteResponse.status()).toBe(200);
    const finalCompleted = (await finalCompleteResponse.json()) as MouldingRecordView;
    expect(finalCompleted.remainingBlankQuantity).toBe(0);

    const finalCartsResponse = await request.get('/api/blanking/carts', {
      headers: bearer(auth.token),
    });
    const finalCart = ((await finalCartsResponse.json()) as BlankingCartView[]).find(
      (cart) => cart.id === prepared.cart.id,
    )!;
    expect(finalCart.status).toBe('FULLY_CONSUMED');
    expect(finalCart.remainingQuantity).toBe(0);

    const finalPressesResponse = await request.get('/api/moulding/presses', {
      headers: bearer(auth.token),
    });
    const finalPress = ((await finalPressesResponse.json()) as PressView[]).find(
      (item) => item.id === selectedPress.id,
    )!;
    expect(finalPress.availableBlankQuantity).toBe(0);
    expect(finalPress.goodTyreQuantity).toBe(initialGood + 37);
    expect(finalPress.status).toBe('WAITING_FOR_BLANKS');

    const persistedRecordsResponse = await request.get('/api/moulding/records', {
      headers: bearer(auth.token),
    });
    const persistedRecords = (await persistedRecordsResponse.json()) as MouldingRecordView[];
    expect(persistedRecords.some((record) => record.id === completed.id)).toBeTruthy();
    expect(persistedRecords.some((record) => record.id === finalCompleted.id)).toBeTruthy();

    await page.goto(`/moulding/production?press=${selectedPress.id}`);
    await expect(page.locator('body')).toContainText(prepared.cart.cartNumber);
    await page.goto('/moulding');
    const pressCard = page.locator('article.card').filter({ hasText: selectedPress.pressNumber });
    await expect(pressCard).toContainText('0');
    await expect(pressCard.getByLabel('Ongoing item code')).toHaveValue(itemCode);
  });
});
