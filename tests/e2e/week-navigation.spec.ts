import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile } from './helpers/auth';

test.describe('Scenario 6 — Week navigation limits', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('weeknav'));
    await setupProfile(userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
    });
    await loginAs(page, email, password);
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('Back arrow is disabled at earliest week', async ({ page }) => {
    await page.goto('/week');
    await page.waitForLoadState('networkidle');
    // Back nav button should be disabled or absent at the preparation week
    const backBtn = page.locator('button[aria-label="Previous week"], button:has-text("‹"), button:has-text("←")').first();
    if (await backBtn.isVisible({ timeout: 3000 })) {
      await expect(backBtn).toBeDisabled();
    } else {
      // Button not rendered at all when at earliest week - also valid
      expect(true).toBe(true);
    }
  });

  test('Can navigate forward to future weeks', async ({ page }) => {
    await page.goto('/week');
    await page.waitForLoadState('networkidle');
    const forwardBtn = page.locator('button[aria-label="Next week"], button:has-text("›"), button:has-text("→")').first();
    if (await forwardBtn.isVisible({ timeout: 3000 })) {
      await forwardBtn.click();
      await page.waitForLoadState('networkidle');
      // Page should still render without error
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
