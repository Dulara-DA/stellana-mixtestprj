import { test, expect, Page } from '@playwright/test';

type DashboardSummary = {
  activeBatches: number;
  waitingForMaterials: number;
  waitingForLab: number;
  passedBatches: number;
  failedBatches: number;
  unreadIssues: number;
  scheduledBatches: number;
  readyToStart: number;
  dueSoon: number;
  overdue: number;
  scheduleBoard?: Array<{
    id: number;
    batchNumber: string;
    factoryReference: string;
    compoundName: string;
  }>;
  batchBoard?: Array<{
    id: number;
    batchNumber: string;
    factoryReference: string;
    compoundName: string;
  }>;
};

type ProductionManagerSummary = {
  compoundRequiredKg: number;
  compoundReceivedKg: number;
  compoundUsedKg: number;
  compoundAvailableKg: number;

  expectedBlankQuantity: number;
  actualGoodBlankQuantity: number;
  blankingProductionVariance: number;
  blankingRejectedQuantity: number;
  blankingRejectedWeightKg: number;

  blankingBatchesProduced: number;
  blanksProduced: number;
  blanksDispatched: number;
  goodTyres: number;
  rejectedTyres: number;
  rejectedBlanks: number;
  rejectedTyreWeightGrams: number;

  blanksAvailableAtBlanking: number;
  blanksAvailableAtPresses: number;
  rejectionPercentage: number;
  openShortageRequests: number;
  delayedCartTransfers: number;

  cartsPrepared: number;
  cartsHeld: number;
  cartsDispatched: number;
  cartsReceived: number;
  cartsReturned: number;
  returnedBlankQuantity: number;
  returnVariances: number;
  unbalancedRecords: number;

  averageCartTransferMinutes: number;

  presses: unknown[];
  cartTransfers: unknown[];
  operatorProductivity: unknown[];
};

type ProductionRecords = {
  mixingRecords: unknown[];
  blankingRecords: unknown[];
  mouldingRecords: unknown[];
};

/**
 * Returns a dashboard card that contains the supplied label.
 */
function cardWithLabel(page: Page, label: string) {
  return page
    .locator('.card')
    .filter({
      has: page.getByText(label, { exact: true }),
    })
    .first();
}

/**
 * Assert that an API response completed successfully.
 */
function expectSuccessfulResponse(
  response: Awaited<ReturnType<Page['waitForResponse']>>,
  endpoint: string
) {
  expect(
    response.status(),
    `${endpoint} should return a successful HTTP response`
  ).toBeGreaterThanOrEqual(200);

  expect(
    response.status(),
    `${endpoint} should not return an error`
  ).toBeLessThan(300);
}

test.describe('Stellana Dashboard Data Verification', () => {

  test('Mixing dashboard API data matches KPI cards', async ({ page }) => {
    const dashboardResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/dashboard') &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    await page.goto('/mixing');

    const dashboardResponse = await dashboardResponsePromise;

    expectSuccessfulResponse(
      dashboardResponse,
      '/api/dashboard'
    );

    const summary =
      (await dashboardResponse.json()) as DashboardSummary;

    await expect(
      page.getByText('Live production overview', { exact: true })
    ).toBeVisible();

    const expectedCards = [
      {
        label: 'Active mixing',
        value: summary.activeBatches,
      },
      {
        label: 'Waiting materials',
        value: summary.waitingForMaterials,
      },
      {
        label: 'Waiting laboratory',
        value: summary.waitingForLab,
      },
      {
        label: 'Passed / released',
        value: summary.passedBatches,
      },
      {
        label: 'Failed / reprocess',
        value: summary.failedBatches,
      },
      {
        label: 'Unread issues',
        value: summary.unreadIssues,
      },
    ];

    for (const item of expectedCards) {
      const card = cardWithLabel(page, item.label);

      await expect(
        card,
        `${item.label} card should be visible`
      ).toBeVisible();

      await expect(
        card,
        `${item.label} should display API value ${item.value}`
      ).toContainText(String(item.value));
    }
  });


  test('Mixing production schedule values match API response', async ({ page }) => {
    const dashboardResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/dashboard') &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    await page.goto('/mixing');

    const response = await dashboardResponsePromise;

    expectSuccessfulResponse(
      response,
      '/api/dashboard'
    );

    const summary =
      (await response.json()) as DashboardSummary;

    const scheduleSection = page
      .locator('section')
      .filter({
        has: page.getByText(
          'Mixing production schedule',
          { exact: true }
        ),
      })
      .first();

    await expect(scheduleSection).toBeVisible();

    const metrics = [
      {
        label: 'Upcoming',
        value: summary.scheduledBatches,
      },
      {
        label: 'Ready to start',
        value: summary.readyToStart,
      },
      {
        label: 'Due soon',
        value: summary.dueSoon,
      },
      {
        label: 'Overdue',
        value: summary.overdue,
      },
    ];

    /**
     * The page may contain multiple texts such as "Overdue"
     * because StatusBadge components can use the same wording.
     *
     * Instead of searching the whole section for the text,
     * target the exact <p> used as the schedule metric label.
     */
    for (const metric of metrics) {
      const metricLabel = scheduleSection
        .locator('p.text-xs.font-semibold.text-slate-500')
        .filter({
          hasText: metric.label,
        })
        .first();

      await expect(
        metricLabel,
        `${metric.label} schedule metric label should be visible`
      ).toHaveText(metric.label);

      /**
       * In DashboardPage.tsx the metric structure is:
       *
       * <div>
       *   <p className="text-2xl ...">{metric.value}</p>
       *   <p className="text-xs ...">{metric.label}</p>
       * </div>
       *
       * So the parent of the label contains the matching value.
       */
      const metricContent = metricLabel.locator('..');

      await expect(
        metricContent.locator('p.text-2xl').first(),
        `${metric.label} should display API value ${metric.value}`
      ).toHaveText(String(metric.value));
    }

    const scheduleBoard =
      summary.scheduleBoard ?? [];

    if (scheduleBoard.length === 0) {
      await expect(
        scheduleSection.getByText(
          /No active time-window schedules/i
        )
      ).toBeVisible();
    } else {
      const firstBatch = scheduleBoard[0];

      await expect(
        scheduleSection.getByText(
          firstBatch.factoryReference,
          { exact: true }
        )
      ).toBeVisible();

      await expect(
        scheduleSection
          .getByText(
            firstBatch.compoundName,
            { exact: false }
          )
          .first()
      ).toBeVisible();
    }
  });


  test('Mixing live batch board reflects backend batch data', async ({ page }) => {
    const dashboardResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/dashboard') &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    await page.goto('/mixing');

    const response = await dashboardResponsePromise;

    expectSuccessfulResponse(
      response,
      '/api/dashboard'
    );

    const summary =
      (await response.json()) as DashboardSummary;

    const batchSection = page
      .locator('section')
      .filter({
        has: page.getByText(
          'Live batch board',
          { exact: true }
        ),
      })
      .first();

    await expect(batchSection).toBeVisible();

    const batches =
      summary.batchBoard ?? [];

    if (batches.length === 0) {
      await expect(
        batchSection.getByText(
          'No batches have been added',
          { exact: true }
        )
      ).toBeVisible();
    } else {
      const firstBatch = batches[0];

      await expect(
        batchSection.getByText(
          firstBatch.batchNumber,
          { exact: true }
        )
      ).toBeVisible();

      await expect(
        batchSection.getByText(
          firstBatch.factoryReference,
          { exact: true }
        )
      ).toBeVisible();

      await expect(
        batchSection.getByText(
          firstBatch.compoundName,
          { exact: true }
        )
      ).toBeVisible();
    }
  });


  test('Production Manager summary API matches dashboard values', async ({ page }) => {
    const summaryResponsePromise = page.waitForResponse(
      response =>
        response.url().includes(
          '/api/production-manager/summary?'
        ) &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    const recordsResponsePromise = page.waitForResponse(
      response =>
        response.url().includes(
          '/api/production-manager/records?'
        ) &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    await page.goto('/production-manager');

    const [
      summaryResponse,
      recordsResponse,
    ] = await Promise.all([
      summaryResponsePromise,
      recordsResponsePromise,
    ]);

    expectSuccessfulResponse(
      summaryResponse,
      '/api/production-manager/summary'
    );

    expectSuccessfulResponse(
      recordsResponse,
      '/api/production-manager/records'
    );

    const summary =
      (await summaryResponse.json()) as ProductionManagerSummary;

    await expect(
      page.getByText(
        'Mixing, Blanking and Moulding report',
        { exact: true }
      )
    ).toBeVisible();

    const requiredReceived =
      cardWithLabel(
        page,
        'Compound required / received'
      );

    await expect(requiredReceived).toContainText(
      String(summary.compoundRequiredKg)
    );

    await expect(requiredReceived).toContainText(
      String(summary.compoundReceivedKg)
    );

    const usedAvailable =
      cardWithLabel(
        page,
        'Compound used / available'
      );

    await expect(usedAvailable).toContainText(
      String(summary.compoundUsedKg)
    );

    await expect(usedAvailable).toContainText(
      String(summary.compoundAvailableKg)
    );

    const expectedActual =
      cardWithLabel(
        page,
        'Expected / actual good blanks'
      );

    await expect(expectedActual).toContainText(
      String(summary.expectedBlankQuantity)
    );

    await expect(expectedActual).toContainText(
      String(summary.actualGoodBlankQuantity)
    );

    await expect(expectedActual).toContainText(
      String(summary.blankingProductionVariance)
    );

    const blankingRejection =
      cardWithLabel(
        page,
        'Blanking rejection'
      );

    await expect(blankingRejection).toContainText(
      String(summary.blankingRejectedQuantity)
    );

    await expect(blankingRejection).toContainText(
      String(summary.blankingRejectedWeightKg)
    );
  });


  test('Production Manager KPI cards match backend summary', async ({ page }) => {
    const summaryResponsePromise = page.waitForResponse(
      response =>
        response.url().includes(
          '/api/production-manager/summary?'
        ) &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    await page.goto('/production-manager');

    const response =
      await summaryResponsePromise;

    expectSuccessfulResponse(
      response,
      '/api/production-manager/summary'
    );

    const summary =
      (await response.json()) as ProductionManagerSummary;

    const kpis = [
      {
        label: 'Blanking batches',
        value: summary.blankingBatchesProduced,
      },
      {
        label: 'Blanks produced',
        value: summary.blanksProduced,
      },
      {
        label: 'Blanks dispatched',
        value: summary.blanksDispatched,
      },
      {
        label: 'Good tyres',
        value: summary.goodTyres,
      },
      {
        label: 'Rejected items',
        value:
          summary.rejectedTyres +
          summary.rejectedBlanks,
      },
      {
        label: 'Rejected tyre weight',
        value: summary.rejectedTyreWeightGrams,
      },
      {
        label: 'At Blanking',
        value: summary.blanksAvailableAtBlanking,
      },
      {
        label: 'At presses',
        value: summary.blanksAvailableAtPresses,
      },
      {
        label: 'Rejection %',
        value: summary.rejectionPercentage,
      },
      {
        label: 'Open shortages',
        value: summary.openShortageRequests,
      },
      {
        label: 'Delayed transfers',
        value: summary.delayedCartTransfers,
      },
    ];

    for (const item of kpis) {
      const card =
        cardWithLabel(page, item.label);

      await expect(
        card,
        `${item.label} should be visible`
      ).toBeVisible();

      await expect(
        card,
        `${item.label} should show ${item.value}`
      ).toContainText(String(item.value));
    }
  });


  test('Production Manager detailed record counts match API', async ({ page }) => {
    const recordsResponsePromise = page.waitForResponse(
      response =>
        response.url().includes(
          '/api/production-manager/records?'
        ) &&
        response.request().method() === 'GET' &&
        response.status() === 200
    );

    await page.goto('/production-manager');

    const response =
      await recordsResponsePromise;

    expectSuccessfulResponse(
      response,
      '/api/production-manager/records'
    );

    const records =
      (await response.json()) as ProductionRecords;

    const mixingSection = page
      .locator('section')
      .filter({
        has: page.getByText(
          'Mixing records',
          { exact: true }
        ),
      })
      .first();

    await expect(mixingSection).toContainText(
      `${records.mixingRecords.length} batches`
    );

    const blankingSection = page
      .locator('section')
      .filter({
        has: page.getByText(
          'Blanking records',
          { exact: true }
        ),
      })
      .first();

    await expect(blankingSection).toContainText(
      `${records.blankingRecords.length} batches`
    );

    const mouldingSection = page
      .locator('section')
      .filter({
        has: page.getByText(
          'Moulding records',
          { exact: true }
        ),
      })
      .first();

    await expect(mouldingSection).toContainText(
      `${records.mouldingRecords.length} press entries`
    );
  });


  test('Blanking dashboard required APIs all load successfully', async ({ page }) => {
    const endpoints = [
      '/api/blanking/approved-materials',
      '/api/blanking/batches',
      '/api/blanking/carts',
      '/api/moulding/presses',
      '/api/shortages',
    ];

    const responsePromises =
      endpoints.map(endpoint =>
        page.waitForResponse(
          response =>
            new URL(response.url()).pathname === endpoint &&
            response.request().method() === 'GET'
        )
      );

    await page.goto('/blanking');

    const responses =
      await Promise.all(responsePromises);

    responses.forEach(
      (response, index) => {
        expectSuccessfulResponse(
          response,
          endpoints[index]
        );
      }
    );

    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page.locator('body')
    ).toBeVisible();
  });


  test('Moulding dashboard required APIs all load successfully', async ({ page }) => {
    const endpoints = [
      '/api/moulding/presses',
      '/api/moulding/upcoming-carts',
      '/api/shortages',
    ];

    const responsePromises =
      endpoints.map(endpoint =>
        page.waitForResponse(
          response =>
            new URL(response.url()).pathname === endpoint &&
            response.request().method() === 'GET'
        )
      );

    await page.goto('/moulding');

    const responses =
      await Promise.all(responsePromises);

    responses.forEach(
      (response, index) => {
        expectSuccessfulResponse(
          response,
          endpoints[index]
        );
      }
    );

    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page.locator('body')
    ).toBeVisible();
  });

});