import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

/**
 * Load private Playwright test credentials.
 *
 * frontend/.env.playwright
 *
 * Example:
 * TEST_EMAIL=...
 * TEST_PASSWORD=...
 */
dotenv.config({
  path: path.resolve(process.cwd(), '.env.playwright'),
});

const ADMIN_AUTH_FILE = 'playwright/.auth/admin.json';

/**
 * Stellana Mixing Tracker - Playwright Configuration
 *
 * Local frontend:
 * http://127.0.0.1:5173
 *
 * Public Cloudflare testing:
 *
 * PLAYWRIGHT_BASE_URL=https://xxxx.trycloudflare.com \
 * npx playwright test --project=chromium
 */
export default defineConfig({
  /**
   * Test files:
   *
   * frontend/e2e/
   */
  testDir: './e2e',

  /**
   * Keep tests sequential while they interact
   * with the same backend/database.
   */
  fullyParallel: false,

  /**
   * Prevent accidentally committed test.only()
   * from passing in CI.
   */
  forbidOnly: !!process.env.CI,

  /**
   * Retry only in CI.
   */
  retries: process.env.CI ? 2 : 0,

  /**
   * One worker prevents test-data conflicts.
   */
  workers: 1,

  /**
   * Maximum duration for one test.
   */
  timeout: 60_000,

  /**
   * Assertion timeout.
   */
  expect: {
    timeout: 10_000,
  },

  /**
   * Test reports.
   */
  reporter: [
    ['list'],

    [
      'html',
      {
        outputFolder: 'playwright-report',
        open: 'never',
      },
    ],

    [
      'json',
      {
        outputFile: 'test-results/results.json',
      },
    ],

    [
      'junit',
      {
        outputFile: 'test-results/results.xml',
      },
    ],
  ],

  /**
   * Shared settings.
   */
  use: {
    /**
     * Default site being tested.
     *
     * Can be overridden:
     *
     * PLAYWRIGHT_BASE_URL=https://xxxx.trycloudflare.com
     */
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://127.0.0.1:5173',

    /**
     * Keep trace when a test fails.
     */
    trace: 'retain-on-failure',

    /**
     * Screenshot failed tests.
     */
    screenshot: 'only-on-failure',

    /**
     * Keep video for failed tests.
     */
    video: 'retain-on-failure',

    /**
     * Desktop viewport.
     */
    viewport: {
      width: 1440,
      height: 900,
    },

    /**
     * Navigation timeout.
     */
    navigationTimeout: 30_000,

    /**
     * Click/fill/action timeout.
     */
    actionTimeout: 15_000,

    /**
     * Useful for temporary HTTPS testing.
     */
    ignoreHTTPSErrors: true,
  },

  /**
   * Playwright projects.
   *
   * IMPORTANT:
   *
   * 00-health.spec.ts
   * 01-authentication.spec.ts
   *
   * run WITHOUT saved authentication.
   *
   * 02-....spec.ts onward
   *
   * run using SYSTEM_ADMIN authentication.
   */
  projects: [
    /**
     * --------------------------------------------------
     * AUTHENTICATION SETUP
     * --------------------------------------------------
     *
     * Runs:
     * e2e/auth/admin.setup.ts
     *
     * Saves:
     * playwright/.auth/admin.json
     */
    {
      name: 'setup-admin',
      testMatch: /admin\.setup\.ts/,
    },

    /**
     * --------------------------------------------------
     * UNAUTHENTICATED CHROMIUM
     * --------------------------------------------------
     *
     * Health + Authentication tests.
     *
     * We intentionally DO NOT load admin.json here,
     * because authentication tests need to verify:
     *
     * - unauthenticated 401
     * - login
     * - invalid password
     * - JWT generation
     */
    {
      name: 'chromium',
      testMatch: /0[01]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    /**
     * Firefox unauthenticated tests.
     */
    {
      name: 'firefox',
      testMatch: /0[01]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
      },
    },

    /**
     * Safari/WebKit unauthenticated tests.
     */
    {
      name: 'webkit',
      testMatch: /0[01]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
      },
    },

    /**
     * --------------------------------------------------
     * AUTHENTICATED SYSTEM ADMIN - CHROMIUM
     * --------------------------------------------------
     *
     * Runs actual Stellana feature tests:
     *
     * 02-dashboard.spec.ts
     * 03-users.spec.ts
     * 04-recipes.spec.ts
     * 05-material-requests.spec.ts
     * ...
     *
     * SYSTEM_ADMIN is already logged in.
     */
    {
      name: 'chromium-admin',

      testMatch: /(?:0[2-9]|[1-9][0-9])-.*\.spec\.ts/,

      dependencies: ['setup-admin'],

      use: {
        ...devices['Desktop Chrome'],

        storageState: ADMIN_AUTH_FILE,
      },
    },

    /**
     * --------------------------------------------------
     * AUTHENTICATED SYSTEM ADMIN - FIREFOX
     * --------------------------------------------------
     *
     * We'll mainly use this after Chromium feature
     * tests become stable.
     */
    {
      name: 'firefox-admin',

      testMatch: /(?:0[2-9]|[1-9][0-9])-.*\.spec\.ts/,

      dependencies: ['setup-admin'],

      use: {
        ...devices['Desktop Firefox'],

        storageState: ADMIN_AUTH_FILE,
      },
    },

    /**
     * --------------------------------------------------
     * AUTHENTICATED SYSTEM ADMIN - SAFARI/WEBKIT
     * --------------------------------------------------
     */
    {
      name: 'webkit-admin',

      testMatch: /(?:0[2-9]|[1-9][0-9])-.*\.spec\.ts/,

      dependencies: ['setup-admin'],

      use: {
        ...devices['Desktop Safari'],

        storageState: ADMIN_AUTH_FILE,
      },
    },

    /**
     * --------------------------------------------------
     * MOBILE TESTING
     * --------------------------------------------------
     *
     * Enable these later after desktop functionality
     * is stable.
     */

    /*
    {
      name: 'mobile-chrome-admin',

      testMatch: /(?:0[2-9]|[1-9][0-9])-.*\.spec\.ts/,

      dependencies: ['setup-admin'],

      use: {
        ...devices['Pixel 7'],

        storageState: ADMIN_AUTH_FILE,
      },
    },
    */

    /*
    {
      name: 'mobile-safari-admin',

      testMatch: /(?:0[2-9]|[1-9][0-9])-.*\.spec\.ts/,

      dependencies: ['setup-admin'],

      use: {
        ...devices['iPhone 14'],

        storageState: ADMIN_AUTH_FILE,
      },
    },
    */
  ],

  /**
   * Playwright artifacts:
   *
   * screenshots
   * videos
   * traces
   * error contexts
   */
  outputDir: 'test-results/artifacts',

  /**
   * We are currently starting frontend/backend manually.
   *
   * Keep:
   *
   * Terminal 1:
   * Spring Boot -> localhost:8080
   *
   * Terminal 2:
   * npm run dev -> localhost:5173
   *
   * We can automate server startup later.
   */
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://127.0.0.1:5173',
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  // },
});