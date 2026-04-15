import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile, backdateUser, upsertCheckin } from './helpers/auth';

test.describe('Scenario 5 — AI coach red metrics', () => {
  let userId: string;
  let email: string;
  let password: string;
  let token: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('aicoach'));
    // Set up user past runway so AI coach can fire
    // Created 14 days ago → plan already started
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    await backdateUser(userId, twoWeeksAgo.toISOString());
    token = await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
      has_sleep_tracker: true,
    }, token);
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('Green metrics — no AI badge shown', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Open check-in modal
    const checkinBtn = page.getByRole('button', { name: /check.?in|morning/i });
    if (await checkinBtn.isVisible({ timeout: 3000 })) {
      await checkinBtn.click();
      // Set green metrics (sliders default to 70)
      await page.locator('button:has-text("Great"), button:has-text("Good")').first().click();
      await page.getByRole('button', { name: /save check-in/i }).click();
      await page.waitForLoadState('networkidle');
      // No AI badge since metrics are green
      const aiBadge = page.getByText('Adapted by AI');
      await expect(aiBadge).toHaveCount(0);
    }
  });

  test('Yellow metrics — tip shown, no AI badge', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Pre-seed a yellow checkin via the helper (uses token for RLS)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    await upsertCheckin(page, { user_id: userId, date: todayStr, whoop_recovery: 50, sleep_score: 55, feeling: 'tired' }, token);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should show yellow tip
    const tip = page.getByText(/feeling a bit off/i);
    await expect(tip).toBeVisible({ timeout: 8000 });
    // Should NOT show AI badge
    const aiBadge = page.getByText('Adapted by AI');
    await expect(aiBadge).toHaveCount(0);
  });
});
