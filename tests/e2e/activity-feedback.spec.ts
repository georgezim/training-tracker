import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile } from './helpers/auth';

// Strava activity fixture used across all tests
const TODAY = new Date().toISOString().split('T')[0];
const MOCK_ACTIVITY = {
  strava_id: 99999,
  activity_date: TODAY,
  name: 'Morning Run',
  sport_type: 'Run',
  distance_m: 10000,
  moving_time_s: 3600,
  elevation_m: 50,
  avg_heartrate: 145,
  max_heartrate: 165,
  avg_speed_ms: 2.78,
  strava_url: 'https://www.strava.com/activities/99999',
};

async function mockStrava(page: Parameters<typeof test>[1] extends { page: infer P } ? P : never) {
  // Note: `planned` is null for users without a custom plan → reconcile returns
  // rest_day_activity whenever there is a Strava activity, which triggers feedback.
  await page.route('/api/strava/status', route =>
    route.fulfill({ json: { connected: true } })
  );
  await page.route(`/api/strava/activities?date=${TODAY}`, route =>
    route.fulfill({ json: { activities: [MOCK_ACTIVITY] } })
  );
}

test.describe('Activity feedback card', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('feedback'));
    const token = await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
    }, token);
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('renders coach feedback when API returns valid response', async ({ page }) => {
    await mockStrava(page);

    await page.route('/api/activity-feedback', route =>
      route.fulfill({
        json: {
          summary: 'Great steady run at the right pace for your marathon goal.',
          effort_rating: 'right',
          injury_flag: false,
          tip: 'Keep the easy days truly easy — aim for conversational pace.',
        },
      })
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Coach feedback')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Great steady run at the right pace')).toBeVisible();
    await expect(page.getByText('Effort: Just right')).toBeVisible();
    await expect(page.getByText('Keep the easy days truly easy')).toBeVisible();
  });

  test('shows injury warning when injury_flag is true', async ({ page }) => {
    await mockStrava(page);

    await page.route('/api/activity-feedback', route =>
      route.fulfill({
        json: {
          summary: 'Hard effort on a rest day — watch the total load this week.',
          effort_rating: 'too_hard',
          injury_flag: true,
          tip: 'Take tomorrow completely off to protect your injury.',
        },
      })
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Coach feedback')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Effort: Too hard')).toBeVisible();
    await expect(page.getByText('High injury load — monitor recovery tonight')).toBeVisible();
  });

  test('page does not crash when activity-feedback API returns 502', async ({ page }) => {
    await mockStrava(page);

    // Simulate the scenario that caused the production crash:
    // Gemini fails → route returns 502 → client must not crash
    await page.route('/api/activity-feedback', route =>
      route.fulfill({ status: 502, json: { error: 'AI unavailable' } })
    );

    // Listen for any uncaught exceptions
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // No unhandled JS error
    expect(errors).toHaveLength(0);

    // Page is still functional
    await expect(page.locator('body')).toBeVisible();

    // Card must NOT appear when the API failed
    await expect(page.getByText('Coach feedback')).not.toBeVisible();
  });

  test('page does not crash when activity-feedback returns empty object', async ({ page }) => {
    await mockStrava(page);

    // Regression test for the exact production crash:
    // Route returned {} → effortData was undefined → badgeClass access threw
    await page.route('/api/activity-feedback', route =>
      route.fulfill({ json: {} })
    );

    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
    await expect(page.locator('body')).toBeVisible();
  });

  test('dismiss button removes the feedback card', async ({ page }) => {
    await mockStrava(page);

    await page.route('/api/activity-feedback', route =>
      route.fulfill({
        json: {
          summary: 'Solid session.',
          effort_rating: 'right',
          injury_flag: false,
          tip: 'Stay consistent.',
        },
      })
    );

    await page.goto('/');
    await expect(page.getByText('Coach feedback')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Dismiss feedback' }).click();

    await expect(page.getByText('Coach feedback')).not.toBeVisible();
  });
});
