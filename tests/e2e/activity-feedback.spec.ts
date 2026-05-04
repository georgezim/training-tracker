import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile } from './helpers/auth';

// Today as YYYY-MM-DD
const TODAY = new Date().toISOString().split('T')[0];

// getPlanStart uses profile.created_at (next Monday after creation). Backdating
// 14 days ensures planStart is already past → active training, not runway.
const twoWeeksAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString();
})();

// Race date 26 weeks out (satisfies marathon goal, keeps user in training)
const raceDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 26 * 7);
  return d.toISOString().split('T')[0];
})();

// Set today's custom_plan slot as 'run'. This guarantees workout.type === 'run'
// → plannedSession is non-null → reconcile returns 'match' when Strava loads.
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayDayName = DAY_NAMES[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
const CUSTOM_PLAN = DAY_NAMES.map(day => ({
  day,
  type: day === todayDayName ? 'run' : 'rest',
  label: day === todayDayName ? 'Easy Run' : 'Rest',
  description: day === todayDayName ? 'Easy run today' : '',
  color: day === todayDayName ? 'blue' : 'gray',
}));

// Strava Run activity (10km) — reconciles as 'match' against the planned run
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

// Dismiss the morning check-in modal if it appears.
// The modal is triggered inside React's async load() effect, AFTER Supabase
// queries complete — which happens well after the 'load' event fires.
// We give it up to 8 seconds so slow CI Supabase round-trips don't miss it.
async function dismissCheckinModal(page: Page) {
  try {
    const closeBtn = page.locator('button[aria-label="Close"], button:has-text("×")').first();
    await closeBtn.waitFor({ state: 'visible', timeout: 8000 });
    await closeBtn.click();
  } catch {
    // Modal didn't appear — fine
  }
}

// Set up all Strava + background mocks.
// Must be called BEFORE page navigation so routes are in place when the home
// page first loads (loginAs redirects to '/' after auth).
// All patterns use regex — string patterns match the full URL including origin,
// so '/api/strava/status' would NOT match 'http://localhost:3000/api/strava/status'.
async function mockStravaRoutes(page: Page) {
  await page.route(/\/api\/strava\/status/, route =>
    route.fulfill({ json: { connected: true } })
  );
  await page.route(/\/api\/strava\/activities/, route =>
    route.fulfill({ json: { activities: [MOCK_ACTIVITY] } })
  );
  // Stub background calls so they don't block networkidle or hit real Gemini
  await page.route(/\/api\/generate-runway/, route =>
    route.fulfill({ json: { runway: null } })
  );
  await page.route(/\/api\/weekly-report/, route =>
    route.fulfill({ json: {} })
  );
}

test.describe('Activity feedback card', () => {
  // Block service workers so page.route() mocks intercept all API calls.
  // The PWA service worker proxies /api/* through its own fetch(), which
  // bypasses page.route() interception when workers are active.
  test.use({ serviceWorkers: 'block' });

  let userId: string;
  let email: string;
  let password: string;

  // Create user and set up profile via admin — no page navigation yet.
  // Each test then installs its own activity-feedback mock, THEN logs in.
  // This ensures all mocks are in place before the home page first loads.
  test.beforeEach(async () => {
    ({ userId, email, password } = await createTestUser('feedback'));
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  // Helper: set up profile + all mocks + activity-feedback mock, then log in.
  // After loginAs the page is on '/' with all mocks active.
  async function loginWithMocks(page: Page, feedbackJson: object) {
    // Set up profile via admin (no page navigation needed)
    // We pass page only for the REST fallback path; admin path uses supabase directly
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
      race_date: raceDate,
      custom_plan: CUSTOM_PLAN,
      created_at: twoWeeksAgo,
    });

    // Install all mocks before any navigation
    await mockStravaRoutes(page);
    await page.route(/\/api\/activity-feedback/, route =>
      route.fulfill({ json: feedbackJson })
    );

    // Log in — the post-auth redirect to '/' will load with mocks active.
    // NOTE: plannedSession is a new object reference each render, causing the
    // useStravaActivity effect to keep re-fetching. With instant mock responses
    // this creates a rapid cycle that prevents networkidle from ever being reached.
    // Use 'load' (initial HTML/resources done) instead of 'networkidle'.
    await loginAs(page, email, password);
    // Wait for initial page load FIRST, then dismiss the modal.
    // The check-in modal fires inside React's async load() effect after Supabase
    // queries complete — always AFTER the 'load' event, so we must wait for load
    // before looking for the modal (8 s timeout handles slow CI round-trips).
    await page.waitForLoadState('load');
    await dismissCheckinModal(page);
  }

  test('renders coach feedback when API returns valid response', async ({ page }) => {
    await loginWithMocks(page, {
      summary: 'Great steady run at the right pace for your marathon goal.',
      effort_rating: 'right',
      injury_flag: false,
      tip: 'Keep the easy days truly easy — aim for conversational pace.',
    });

    await expect(page.getByText('Coach feedback')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Great steady run at the right pace')).toBeVisible();
    await expect(page.getByText('Effort: right')).toBeVisible();
  });

  test('shows injury warning when injury_flag is true', async ({ page }) => {
    await loginWithMocks(page, {
      summary: 'Hard effort today — watch the total load this week.',
      effort_rating: 'too_hard',
      injury_flag: true,
      tip: 'Take tomorrow completely off to protect your injury.',
    });

    await expect(page.getByText('Coach feedback')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Effort: too hard')).toBeVisible();
    await expect(page.getByText('High injury load — monitor recovery tonight')).toBeVisible();
  });

  test('page does not crash when activity-feedback API returns 502', async ({ page }) => {
    // Regression: Gemini fails → route returns 502 → client must NOT crash
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
      race_date: raceDate,
      custom_plan: CUSTOM_PLAN,
      created_at: twoWeeksAgo,
    });
    await mockStravaRoutes(page);
    await page.route(/\/api\/activity-feedback/, route =>
      route.fulfill({ status: 502, json: { error: 'AI unavailable' } })
    );

    await loginAs(page, email, password);
    await page.waitForLoadState('load');
    await dismissCheckinModal(page);

    expect(errors).toHaveLength(0);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Coach feedback')).not.toBeVisible();
  });

  test('page does not crash when activity-feedback returns empty object', async ({ page }) => {
    // Regression for exact production crash:
    // Route returned {} → effortData was undefined → .badgeClass access threw
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await loginWithMocks(page, {});

    expect(errors).toHaveLength(0);
    await expect(page.locator('body')).toBeVisible();
  });

  test('too_easy effort renders with correct label', async ({ page }) => {
    // Inline feedback shows all three effort states — verify too_easy renders
    await loginWithMocks(page, {
      summary: 'Very comfortable session, you have more in the tank.',
      effort_rating: 'too_easy',
      injury_flag: false,
      tip: 'Push a bit harder next time.',
    });

    await expect(page.getByText('Coach feedback')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Effort: too easy')).toBeVisible();
  });
});
