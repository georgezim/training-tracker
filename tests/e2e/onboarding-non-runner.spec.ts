import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile, backdateUser } from './helpers/auth';

test.describe('Scenario 3 — Non-runner (bike + gym only)', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('nonrunner'));
    // Sign up yesterday so runway is active
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await backdateUser(userId, yesterday.toISOString());
    await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['gym', 'bike'],
      equipment: ['gym', 'bike'],
    });
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('During runway, no run sessions suggested', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Check that workout content doesn't mention running
    const bodyText = await page.locator('body').textContent();
    // Should not show a "Run" type session as primary content for non-runner
    // The runway card type should be gym or bike, not run
    expect(bodyText).not.toMatch(/long run|easy run/i);
  });

  test('Week tab runway cards have no run types', async ({ page }) => {
    await page.goto('/week');
    await page.waitForLoadState('networkidle');
    // Verify Preparation week shows no Run sessions
    const weekContent = await page.locator('main').textContent();
    expect(weekContent).not.toMatch(/\bLong Run\b/);
  });
});
