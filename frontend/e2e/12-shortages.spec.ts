import { expect, test } from '@playwright/test';
import { bearer, loginAsAdmin } from './helpers/workflows';

type Press = { id: number; pressNumber: string; active: boolean };
type Cart = { id: number; cartNumber: string; status: string; destinationPressId?: number };
type ProductionRecord = { cart: Cart };
type Shortage = {
  id: number;
  requestNumber: string;
  pressId: number;
  pressNumber: string;
  requestedBlankQuantity: number;
  requiredMaterialCode: string;
  priority: string;
  status: string;
  linkedCartId?: number;
  messages: Array<{ message: string; statusSnapshot: string }>;
};

test.describe('Cross-section Material Shortages', () => {
  test('shortage mailbox loads its live API data', async ({ page }) => {
    const shortages = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/shortages',
    );
    await page.goto('/shortages');
    expect((await shortages).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Material shortage requests' }),
    ).toBeVisible();
  });

  test('request, conversation, controlled status flow and linked cart remain traceable', async ({
    page,
    request,
  }) => {
    const auth = await loginAsAdmin(request);
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const pressesResponse = await request.get('/api/moulding/presses', {
      headers: bearer(auth.token),
    });
    expect(pressesResponse.status()).toBe(200);
    const press = ((await pressesResponse.json()) as Press[]).find((item) => item.active);
    expect(press).toBeTruthy();

    const preparedResponse = await request.post('/api/blanking/production-records', {
      headers: bearer(auth.token),
      data: {
        batchNumber: `TEST-BLK-SHORT-${unique}`,
        materialCode: `PW-CMP-SHORT-${unique}`,
        itemCode: `TEST-ITEM-SHORT-${unique}`,
        millOperator: `PW-MILL-${unique} - PW Mill Operator`,
        preformerOperator: `PW-PREF-${unique} - PW Performer Operator`,
        cartNumber: `TEST-CART-SHORT-${unique}`,
        quantity: 25,
        averageBlankWeightGrams: 180,
        notes: 'PW cart reserved for shortage traceability.',
      },
    });
    expect(preparedResponse.status()).toBe(200);
    const prepared = (await preparedResponse.json()) as ProductionRecord;

    const assignResponse = await request.patch(
      `/api/moulding/carts/${prepared.cart.id}/assign`,
      { headers: bearer(auth.token), data: { pressId: press!.id } },
    );
    expect(assignResponse.status()).toBe(200);

    await page.goto('/shortages');
    await page.getByRole('button', { name: /request blanks/i }).click();
    const modal = page.locator('form').filter({ hasText: 'Request blanks from Blanking' });
    await modal.getByLabel('Press').selectOption(String(press!.id));
    await modal.getByLabel('Requested blanks').fill('25');
    await modal.getByLabel('Required material code').fill(`pw-short-${unique}`);
    await modal.getByLabel('Priority').selectOption('URGENT');
    await modal
      .getByLabel('Operational message')
      .fill(`PW urgent shortage ${unique}: send the prepared cart.`);
    await modal.getByRole('button', { name: /send request/i }).click();

    await expect(page.getByText(`PW urgent shortage ${unique}: send the prepared cart.`)).toBeVisible();
    await expect(page.getByText(new RegExp(`25 PW-SHORT-${unique} blanks`, 'i'))).toBeVisible();

    const listResponse = await request.get('/api/shortages', {
      headers: bearer(auth.token),
    });
    expect(listResponse.status()).toBe(200);
    const shortage = ((await listResponse.json()) as Shortage[]).find(
      (item) => item.requiredMaterialCode === `PW-SHORT-${unique}`,
    );
    expect(shortage).toBeTruthy();
    expect(shortage).toMatchObject({
      pressId: press!.id,
      requestedBlankQuantity: 25,
      priority: 'URGENT',
      status: 'OPEN',
    });

    const illegalResponse = await request.patch(`/api/shortages/${shortage!.id}/status`, {
      headers: bearer(auth.token),
      data: { status: 'FULFILLED', linkedCartId: prepared.cart.id },
    });
    expect(illegalResponse.status()).toBe(409);
    expect((await illegalResponse.json()).message).toMatch(/invalid shortage transition/i);

    const reply = `PW Blanking reply ${unique}: cart is being prepared.`;
    await page.getByRole('button').filter({ hasText: shortage!.requestNumber }).click();
    await page.getByLabel('Conversation reply').fill(reply);
    await page.getByRole('button', { name: /^send$/i }).click();
    await expect(page.getByText(reply)).toBeVisible();

    const change = async (status: string, response: string, linkedCartId?: number) => {
      const result = await request.patch(`/api/shortages/${shortage!.id}/status`, {
        headers: bearer(auth.token),
        data: { status, response, linkedCartId: linkedCartId ?? null },
      });
      expect(result.status()).toBe(200);
      return (await result.json()) as Shortage;
    };

    expect((await change('ACKNOWLEDGED', `PW acknowledged ${unique}`)).status).toBe('ACKNOWLEDGED');
    const preparing = await change('PREPARING', `PW linked cart ${unique}`, prepared.cart.id);
    expect(preparing.status).toBe('PREPARING');
    expect(preparing.linkedCartId).toBe(prepared.cart.id);

    const prematureDispatch = await request.patch(`/api/shortages/${shortage!.id}/status`, {
      headers: bearer(auth.token),
      data: { status: 'DISPATCHED', linkedCartId: prepared.cart.id },
    });
    expect(prematureDispatch.status()).toBe(409);
    expect((await prematureDispatch.json()).message).toMatch(/cart has not been dispatched/i);

    const cartDispatch = await request.post(`/api/blanking/carts/${prepared.cart.id}/dispatch`, {
      headers: bearer(auth.token),
      data: { note: `PW shortage dispatch ${unique}` },
    });
    expect(cartDispatch.status()).toBe(200);
    expect(((await cartDispatch.json()) as Cart).status).toBe('DISPATCHED');

    expect(
      (await change('DISPATCHED', `PW cart dispatched ${unique}`, prepared.cart.id)).status,
    ).toBe('DISPATCHED');
    const fulfilled = await change('FULFILLED', `PW request fulfilled ${unique}`, prepared.cart.id);
    expect(fulfilled.status).toBe('FULFILLED');
    expect(fulfilled.messages.map((message) => message.statusSnapshot)).toEqual(
      expect.arrayContaining(['OPEN', 'ACKNOWLEDGED', 'PREPARING', 'DISPATCHED', 'FULFILLED']),
    );
    expect(fulfilled.messages.map((message) => message.message)).toContain(reply);

    await page.reload();
    await page.getByRole('button').filter({ hasText: shortage!.requestNumber }).click();
    await expect(page.locator('section').getByText('Fulfilled', { exact: true })).toBeVisible();
    await expect(page.getByText(`PW request fulfilled ${unique}`)).toBeVisible();
  });
});
