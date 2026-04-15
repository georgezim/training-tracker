import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile } from './helpers/auth';

test.describe('Scenario 4 — Advanced 10K with race date', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('advanced'));
    const token = await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: '10k',
      training_level: 'advanced',
      days_per_week: 5,
      preferred_activities: ['run', 'gym'],
      race_date: '2026-06-23',
    }, token);
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('Phase 1 (Base Building) visible in early weeks', async ({ page }) => {
    await page.goto('/week');
    await page.waitForLoadState('networkidle');
    const phaseText = await page.locator('body').textContent();
    // Should show Base Building or Preparation (if still in runway)
    expect(phaseText).toMatch(/base building|preparation|build/i);
  });
});
