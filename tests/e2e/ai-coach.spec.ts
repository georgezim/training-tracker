import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile, backdateUser } from './helpers/auth';

/** Upsert a daily_checkin row using the user's browser session (respects RLS). */
async function upsertCheckinViaPage(page: Page, checkinData: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name.includes('auth-token'));
  let accessToken: string | undefined;
  if (authCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(authCookie.value));
      accessToken = Array.isArray(parsed) ? parsed[0]?.access_token : parsed?.access_token;
    } catch { /* ignore */ }
  }
  if (!accessToken) return; // Skip if can't get token

  await page.request.post(
    `${supabaseUrl}/rest/v1/daily_checkins`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      data: checkinData,
    }
  );
}

test.describe('Scenario 5 — AI coach red metrics', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('aicoach'));
    // Set up user past runway so AI coach can fire
    // Created 14 days ago → plan already started
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    await backdateUser(userId, twoWeeksAgo.toISOString());
    await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
      has_sleep_tracker: true,
    });
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
    // Pre-seed a yellow checkin via the browser session (respects RLS)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    await upsertCheckinViaPage(page, {
      user_id: userId,
      date: todayStr,
      whoop_recovery: 50,
      sleep_score: 55,
      feeling: 'tired',
    });

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
