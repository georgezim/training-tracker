import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile, backdateUser } from './helpers/auth';

test.describe('Scenario 1 — Beginner marathon, Wednesday signup', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('beginner'));
    // Simulate Wednesday signup by backdating created_at and setting profile
    // Set created_at to last Wednesday
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const daysToLastWed = (dayOfWeek + 4) % 7; // days back to reach Wednesday
    const lastWed = new Date(today);
    lastWed.setDate(today.getDate() - daysToLastWed);
    const wednesdayStr = lastWed.toISOString();

    await backdateUser(userId, wednesdayStr);
    await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'beginner',
      days_per_week: 3,
      preferred_activities: ['run', 'gym'],
      preferred_long_day: 'Sat',
      equipment: ['outdoor_running', 'gym'],
    });
  });

  test.afterEach(async () => {
    await deleteTestUser(userId);
  });

  test('Today tab shows runway card during preparation week', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Should show preparation/runway content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/plan starts|preparation|get ready/i);
  });

  test('Today tab shows OPTIONAL badge during runway', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const optional = page.getByText('Optional');
    await expect(optional).toBeVisible({ timeout: 8000 });
  });

  test('Today tab has no Done/Missed buttons during runway', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const doneBtn = page.getByRole('button', { name: /done|completed/i });
    const missedBtn = page.getByRole('button', { name: /missed|didn't do/i });
    await expect(doneBtn).toHaveCount(0);
    await expect(missedBtn).toHaveCount(0);
  });

  test('Week tab shows Preparation header during runway', async ({ page }) => {
    await page.goto('/week');
    await page.waitForLoadState('networkidle');
    const prep = page.getByText('Preparation');
    await expect(prep).toBeVisible({ timeout: 8000 });
  });
});
