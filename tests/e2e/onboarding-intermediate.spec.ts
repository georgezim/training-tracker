import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile, getSupabaseAdmin } from './helpers/auth';

test.describe('Scenario 2 — Intermediate half marathon, Monday signup', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('intermediate'));
    // Simulate Monday signup
    const supabase = getSupabaseAdmin();
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMon = new Date(today);
    lastMon.setDate(today.getDate() - daysToLastMon);
    // @ts-ignore — admin API types don't expose created_at but it works at runtime
    await supabase.auth.admin.updateUserById(userId, { created_at: lastMon.toISOString() });
    await setupProfile(userId, {
      goal: 'half_marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run', 'bike'],
      preferred_long_day: 'Sat',
    });
    await loginAs(page, email, password);
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('Monday signup still gets runway period (planStart = following Monday)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Monday signup → planStart = next Monday → runway shown this week
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/plan starts|preparation|optional/i);
  });

  test('Week tab labeled Preparation for Monday signup', async ({ page }) => {
    await page.goto('/week');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Preparation')).toBeVisible({ timeout: 8000 });
  });
});
