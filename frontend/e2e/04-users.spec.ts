import {
  test,
  expect,
  APIRequestContext,
  Page,
} from '@playwright/test';

type UserView = {
  id: number;
  fullName: string;
  employeeId: string;
  email: string;
  role:
    | 'MANAGER'
    | 'MIXING_OFFICER'
    | 'BLANKING_OPERATOR'
    | 'BLANKING_SUPERVISOR'
    | 'MOULDING_OPERATOR'
    | 'MOULDING_SUPERVISOR'
    | 'SYSTEM_ADMIN'
    | 'STORES_OFFICER'
    | 'LAB_OFFICER';
  active: boolean;
};

type AuthResponse = {
  token: string;
  user: UserView;
};

/**
 * Login directly through the API using the SYSTEM_ADMIN
 * credentials stored in .env.playwright.
 *
 * This gives API tests their own JWT instead of depending
 * on browser localStorage.
 */
async function loginAsAdmin(
  request: APIRequestContext
): Promise<AuthResponse> {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL or TEST_PASSWORD is missing from .env.playwright'
    );
  }

  const response = await request.post('/api/auth/login', {
    data: {
      email,
      password,
    },
  });

  expect(
    response.status(),
    'SYSTEM_ADMIN API login should succeed'
  ).toBe(200);

  const body =
    (await response.json()) as AuthResponse;

  expect(body.token).toBeTruthy();
  expect(body.user).toBeTruthy();
  expect(body.user.role).toBe('SYSTEM_ADMIN');

  return body;
}

/**
 * Authorization header for protected API requests.
 */
function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Find a user card using the user's full name.
 */
function userCard(
  page: Page,
  fullName: string
) {
  return page
    .locator('.card')
    .filter({
      has: page.getByText(
        fullName,
        { exact: true }
      ),
    })
    .first();
}

test.describe('Stellana User Management', () => {

  test('SYSTEM_ADMIN users page loads and backend user list is available', async ({
    page,
  }) => {
    const usersResponsePromise =
      page.waitForResponse(
        response =>
          new URL(response.url()).pathname ===
            '/api/users' &&
          response.request().method() === 'GET'
      );

    await page.goto('/users');

    const usersResponse =
      await usersResponsePromise;

    expect(
      usersResponse.status()
    ).toBe(200);

    const users =
      (await usersResponse.json()) as UserView[];

    expect(
      Array.isArray(users)
    ).toBeTruthy();

    expect(
      users.length,
      'At least the SYSTEM_ADMIN account should exist'
    ).toBeGreaterThan(0);

    expect(
      users.some(
        user =>
          user.role === 'SYSTEM_ADMIN'
      ),
      'User list should contain a SYSTEM_ADMIN account'
    ).toBeTruthy();

    await expect(
      page.getByText(
        'User management',
        { exact: true }
      )
    ).toBeVisible();

    await expect(
      page.getByRole('button', {
        name: /add user/i,
      })
    ).toBeVisible();
  });


  test('SYSTEM_ADMIN cannot deactivate its own account', async ({
    request,
  }) => {
    const auth =
      await loginAsAdmin(request);

    const response =
      await request.patch(
        `/api/users/${auth.user.id}/active`,
        {
          headers: bearer(auth.token),
          data: {
            active: false,
          },
        }
      );

    expect(
      response.status()
    ).toBe(409);

    const body =
      await response.json();

    expect(
      body.message
    ).toMatch(
      /cannot deactivate your own account/i
    );

    /**
     * Verify the SYSTEM_ADMIN account remained active.
     */
    const usersResponse =
      await request.get(
        '/api/users',
        {
          headers: bearer(auth.token),
        }
      );

    expect(
      usersResponse.status()
    ).toBe(200);

    const users =
      (await usersResponse.json()) as UserView[];

    const admin =
      users.find(
        user =>
          user.id === auth.user.id
      );

    expect(admin).toBeTruthy();

    expect(
      admin?.active
    ).toBe(true);
  });


  test('user API validation rejects invalid account data', async ({
    request,
  }) => {
    const auth =
      await loginAsAdmin(request);

    const response =
      await request.post(
        '/api/users',
        {
          headers: bearer(auth.token),
          data: {
            fullName: '',
            employeeId: '',
            email: 'not-an-email',
            password: '123',
            role: null,
          },
        }
      );

    expect(
      response.status()
    ).toBe(400);

    const body =
      await response.json();

    expect(
      body.error
    ).toBe('Bad Request');

    expect(
      body.fieldErrors
    ).toBeTruthy();

    /**
     * Validation rules confirmed from ApiModels.java:
     *
     * fullName     -> @NotBlank
     * employeeId   -> @NotBlank
     * email        -> @NotBlank @Email
     * password     -> @Size(min = 8)
     * role         -> @NotNull
     */
    expect(
      body.fieldErrors.fullName
    ).toBeTruthy();

    expect(
      body.fieldErrors.employeeId
    ).toBeTruthy();

    expect(
      body.fieldErrors.email
    ).toBeTruthy();

    expect(
      body.fieldErrors.password
    ).toBeTruthy();

    expect(
      body.fieldErrors.role
    ).toBeTruthy();
  });


  test('complete user lifecycle persists correctly through UI, API and database', async ({
    page,
    request,
  }) => {
    /**
     * Generate unique Playwright identifiers so a previous test
     * run cannot cause duplicate email/employee ID failures.
     */
    const unique =
      `${Date.now()}${Math.floor(
        Math.random() * 1000
      )}`;

    const testUser = {
      fullName:
        `PW Test Mixing Officer ${unique}`,

      employeeId:
        `PW-MIX-${unique}`,

      /**
       * Intentionally uppercase some characters.
       *
       * Backend should save email lowercase.
       */
      email:
        `PW-MIX-${unique}@Example.Test`,

      password:
        `PwTest-${unique}!`,

      role:
        'MIXING_OFFICER' as const,
    };

    const expectedEmail =
      testUser.email.toLowerCase();

    const expectedEmployeeId =
      testUser.employeeId.toUpperCase();

    const adminAuth =
      await loginAsAdmin(request);

    let createdUser:
      | UserView
      | undefined;

    try {
      /**
       * ==================================================
       * STEP 1
       * OPEN USER MANAGEMENT
       * ==================================================
       */

      const initialUsersPromise =
        page.waitForResponse(
          response =>
            new URL(
              response.url()
            ).pathname === '/api/users' &&
            response.request().method() ===
              'GET' &&
            response.status() === 200
        );

      await page.goto('/users');

      await initialUsersPromise;

      await expect(
        page.getByText(
          'User management',
          { exact: true }
        )
      ).toBeVisible();


      /**
       * ==================================================
       * STEP 2
       * OPEN CREATE USER FORM
       * ==================================================
       */

      await page
        .getByRole('button', {
          name: /add user/i,
        })
        .click();

      await expect(
        page.getByText(
          'Create user account',
          { exact: true }
        )
      ).toBeVisible();


      /**
       * ==================================================
       * STEP 3
       * FILL REAL USER FORM
       * ==================================================
       */

      await page
        .getByLabel('Full name')
        .fill(testUser.fullName);

      await page
        .getByLabel('Employee ID')
        .fill(testUser.employeeId);

      await page
        .getByLabel('Email')
        .fill(testUser.email);

      await page
        .getByLabel(
          'Temporary password'
        )
        .fill(testUser.password);

      await page
        .getByLabel('Role')
        .selectOption(
          testUser.role
        );


      /**
       * ==================================================
       * STEP 4
       * CREATE USER THROUGH REACT UI
       * ==================================================
       */

      const createResponsePromise =
        page.waitForResponse(
          response =>
            new URL(
              response.url()
            ).pathname === '/api/users' &&
            response.request().method() ===
              'POST'
        );

      await page
        .getByRole('button', {
          name: /create account/i,
        })
        .click();

      const createResponse =
        await createResponsePromise;

      expect(
        createResponse.status(),
        'POST /api/users should succeed'
      ).toBe(200);

      createdUser =
        (await createResponse.json()) as UserView;


      /**
       * ==================================================
       * STEP 5
       * VERIFY BACKEND NORMALIZATION
       * ==================================================
       */

      expect(
        createdUser.id
      ).toBeTruthy();

      expect(
        createdUser.fullName
      ).toBe(testUser.fullName);

      expect(
        createdUser.employeeId
      ).toBe(expectedEmployeeId);

      expect(
        createdUser.email
      ).toBe(expectedEmail);

      expect(
        createdUser.role
      ).toBe('MIXING_OFFICER');

      expect(
        createdUser.active
      ).toBe(true);


      /**
       * ==================================================
       * STEP 6
       * VERIFY USER APPEARS IN REACT UI
       * ==================================================
       */

      const createdCard =
        userCard(
          page,
          testUser.fullName
        );

      await expect(
        createdCard
      ).toBeVisible();

      await expect(
        createdCard
      ).toContainText(
        expectedEmail
      );

      await expect(
        createdCard
      ).toContainText(
        expectedEmployeeId
      );

      await expect(
        createdCard
      ).toContainText(
        'Mixing Officer'
      );

      await expect(
        createdCard.getByText(
          'Active',
          { exact: true }
        )
      ).toBeVisible();

      await expect(
        createdCard.getByRole(
          'button',
          {
            name: /deactivate/i,
          }
        )
      ).toBeVisible();


      /**
       * ==================================================
       * STEP 7
       * RELOAD BROWSER
       *
       * This verifies that the record was not merely
       * held in React component state.
       * ==================================================
       */

      const reloadUsersPromise =
        page.waitForResponse(
          response =>
            new URL(
              response.url()
            ).pathname === '/api/users' &&
            response.request().method() ===
              'GET' &&
            response.status() === 200
        );

      await page.reload();

      await reloadUsersPromise;

      const persistedCard =
        userCard(
          page,
          testUser.fullName
        );

      await expect(
        persistedCard
      ).toBeVisible();

      await expect(
        persistedCard
      ).toContainText(
        expectedEmail
      );


      /**
       * ==================================================
       * STEP 8
       * VERIFY DATABASE DATA THROUGH API
       * ==================================================
       */

      const listResponse =
        await request.get(
          '/api/users',
          {
            headers: bearer(
              adminAuth.token
            ),
          }
        );

      expect(
        listResponse.status()
      ).toBe(200);

      const users =
        (await listResponse.json()) as UserView[];

      const persistedUser =
        users.find(
          user =>
            user.id ===
            createdUser?.id
        );

      expect(
        persistedUser
      ).toBeTruthy();

      expect(
        persistedUser?.fullName
      ).toBe(testUser.fullName);

      expect(
        persistedUser?.employeeId
      ).toBe(
        expectedEmployeeId
      );

      expect(
        persistedUser?.email
      ).toBe(expectedEmail);

      expect(
        persistedUser?.role
      ).toBe(
        'MIXING_OFFICER'
      );

      expect(
        persistedUser?.active
      ).toBe(true);


      /**
       * ==================================================
       * STEP 9
       * VERIFY DUPLICATE EMAIL PROTECTION
       * ==================================================
       */

      const duplicateEmailResponse =
        await request.post(
          '/api/users',
          {
            headers: bearer(
              adminAuth.token
            ),
            data: {
              fullName:
                'PW Duplicate Email',
              employeeId:
                `PW-DUP-E-${unique}`,
              email:
                expectedEmail,
              password:
                'PwDuplicate123!',
              role:
                'MIXING_OFFICER',
            },
          }
        );

      expect(
        duplicateEmailResponse.status()
      ).toBe(409);

      const duplicateEmailBody =
        await duplicateEmailResponse.json();

      expect(
        duplicateEmailBody.message
      ).toMatch(
        /user with this email already exists/i
      );


      /**
       * ==================================================
       * STEP 10
       * VERIFY DUPLICATE EMPLOYEE ID PROTECTION
       * ==================================================
       */

      const duplicateEmployeeResponse =
        await request.post(
          '/api/users',
          {
            headers: bearer(
              adminAuth.token
            ),
            data: {
              fullName:
                'PW Duplicate Employee',
              employeeId:
                expectedEmployeeId,
              email:
                `pw-other-${unique}@example.test`,
              password:
                'PwDuplicate123!',
              role:
                'MIXING_OFFICER',
            },
          }
        );

      expect(
        duplicateEmployeeResponse.status()
      ).toBe(409);

      const duplicateEmployeeBody =
        await duplicateEmployeeResponse.json();

      expect(
        duplicateEmployeeBody.message
      ).toMatch(
        /user with this employee ID already exists/i
      );


      /**
       * ==================================================
       * STEP 11
       * DEACTIVATE THROUGH THE UI
       * ==================================================
       */

      page.once(
        'dialog',
        async dialog => {
          expect(
            dialog.type()
          ).toBe('confirm');

          expect(
            dialog.message()
          ).toContain(
            testUser.fullName
          );

          await dialog.accept();
        }
      );

      const deactivateResponsePromise =
        page.waitForResponse(
          response =>
            new URL(
              response.url()
            ).pathname ===
              `/api/users/${createdUser?.id}/active` &&
            response.request().method() ===
              'PATCH'
        );

      await userCard(
        page,
        testUser.fullName
      )
        .getByRole('button', {
          name: /deactivate/i,
        })
        .click();

      const deactivateResponse =
        await deactivateResponsePromise;

      expect(
        deactivateResponse.status()
      ).toBe(200);

      const deactivatedUser =
        (await deactivateResponse.json()) as UserView;

      expect(
        deactivatedUser.active
      ).toBe(false);


      /**
       * ==================================================
       * STEP 12
       * VERIFY UI CHANGES TO INACTIVE
       * ==================================================
       */

      const inactiveCard =
        userCard(
          page,
          testUser.fullName
        );

      await expect(
        inactiveCard.getByText(
          'Inactive',
          { exact: true }
        )
      ).toBeVisible();

      await expect(
        inactiveCard.getByRole(
          'button',
          {
            name: /^activate$/i,
          }
        )
      ).toBeVisible();


      /**
       * ==================================================
       * STEP 13
       * RELOAD AND VERIFY INACTIVE STATE PERSISTED
       * ==================================================
       */

      const inactiveReloadPromise =
        page.waitForResponse(
          response =>
            new URL(
              response.url()
            ).pathname === '/api/users' &&
            response.request().method() ===
              'GET' &&
            response.status() === 200
        );

      await page.reload();

      await inactiveReloadPromise;

      await expect(
        userCard(
          page,
          testUser.fullName
        ).getByText(
          'Inactive',
          { exact: true }
        )
      ).toBeVisible();


      /**
       * ==================================================
       * STEP 14
       * VERIFY DATABASE ALSO SAYS INACTIVE
       * ==================================================
       */

      const inactiveListResponse =
        await request.get(
          '/api/users',
          {
            headers: bearer(
              adminAuth.token
            ),
          }
        );

      expect(
        inactiveListResponse.status()
      ).toBe(200);

      const inactiveUsers =
        (await inactiveListResponse.json()) as UserView[];

      const inactiveBackendUser =
        inactiveUsers.find(
          user =>
            user.id ===
            createdUser?.id
        );

      expect(
        inactiveBackendUser?.active
      ).toBe(false);


      /**
       * ==================================================
       * STEP 15
       * REACTIVATE THROUGH UI
       * ==================================================
       */

      page.once(
        'dialog',
        async dialog => {
          expect(
            dialog.type()
          ).toBe('confirm');

          await dialog.accept();
        }
      );

      const activateResponsePromise =
        page.waitForResponse(
          response =>
            new URL(
              response.url()
            ).pathname ===
              `/api/users/${createdUser?.id}/active` &&
            response.request().method() ===
              'PATCH'
        );

      await userCard(
        page,
        testUser.fullName
      )
        .getByRole('button', {
          name: /^activate$/i,
        })
        .click();

      const activateResponse =
        await activateResponsePromise;

      expect(
        activateResponse.status()
      ).toBe(200);

      const activatedUser =
        (await activateResponse.json()) as UserView;

      expect(
        activatedUser.active
      ).toBe(true);

      await expect(
        userCard(
          page,
          testUser.fullName
        ).getByText(
          'Active',
          { exact: true }
        )
      ).toBeVisible();


      /**
       * ==================================================
       * STEP 16
       * VERIFY NEWLY CREATED USER CAN LOGIN
       * ==================================================
       */

      const testUserLogin =
        await request.post(
          '/api/auth/login',
          {
            data: {
              email:
                expectedEmail,
              password:
                testUser.password,
            },
          }
        );

      expect(
        testUserLogin.status(),
        'New active user should be able to authenticate'
      ).toBe(200);

      const testUserAuth =
        (await testUserLogin.json()) as AuthResponse;

      expect(
        testUserAuth.token
      ).toBeTruthy();

      expect(
        testUserAuth.user.id
      ).toBe(createdUser.id);

      expect(
        testUserAuth.user.role
      ).toBe(
        'MIXING_OFFICER'
      );


      /**
       * ==================================================
       * STEP 17
       * VERIFY OFFICERS ENDPOINT CONTAINS USER
       * ==================================================
       */

      const officersResponse =
        await request.get(
          '/api/users/officers',
          {
            headers: bearer(
              adminAuth.token
            ),
          }
        );

      expect(
        officersResponse.status()
      ).toBe(200);

      const officers =
        (await officersResponse.json()) as UserView[];

      expect(
        officers.some(
          officer =>
            officer.id ===
            createdUser?.id
        )
      ).toBeTruthy();

    } finally {
      /**
       * ==================================================
       * CLEANUP
       * ==================================================
       *
       * Users cannot be deleted because Stellana retains
       * historical ownership records.
       *
       * Therefore any Playwright-created user is left
       * INACTIVE after the test finishes.
       *
       * This cleanup also runs if an assertion fails after
       * the user has already been created.
       */
      if (createdUser?.id) {
        try {
          await request.patch(
            `/api/users/${createdUser.id}/active`,
            {
              headers: bearer(
                adminAuth.token
              ),
              data: {
                active: false,
              },
            }
          );
        } catch {
          /**
           * Don't hide the original test failure if cleanup
           * itself encounters a problem.
           */
        }
      }
    }
  });

});
