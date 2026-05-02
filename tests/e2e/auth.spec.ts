import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './helpers/auth';

test.describe('Auth — sign in page', () => {
  test('shows password field masked by default', async ({ page }) => {
    await page.goto('/signin');
    const input = page.locator('input[type="password"]');
    await expect(input).toBeVisible();
  });

  test('eye toggle reveals and hides password', async ({ page }) => {
    await page.goto('/signin');

    const input = page.locator('input[autocomplete="current-password"]');
    await input.fill('mySecret123');

    // Initially masked
    await expect(input).toHaveAttribute('type', 'password');

    // Click the eye button — should reveal
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(input).toHaveAttribute('type', 'text');

    // Click again — should mask
    const hideToggle = page.getByRole('button', { name: 'Hide password' });
    await hideToggle.click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/signin');
    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[autocomplete="current-password"]', 'wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('text=/invalid|credentials|password/i')).toBeVisible({ timeout: 8000 });
  });

  test('redirects to home after successful sign in', async ({ page }) => {
    const { userId, email, password } = await createTestUser('signin-test');
    try {
      await page.goto('/signin');
      await page.fill('input[type="email"]', email);
      await page.fill('input[autocomplete="current-password"]', password);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL('/', { timeout: 10000 });
      expect(page.url()).toContain('/');
    } finally {
      await deleteTestUser(userId);
    }
  });
});

test.describe('Auth — sign up page', () => {
  test('eye toggle reveals and hides password on signup', async ({ page }) => {
    await page.goto('/signup');

    const input = page.locator('input[autocomplete="new-password"]');
    await input.fill('mySecret123');

    // Initially masked
    await expect(input).toHaveAttribute('type', 'password');

    // Click the eye button — should reveal
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(input).toHaveAttribute('type', 'text');

    // Click again — should mask
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('blocks submission when password is too short', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('input[type="email"]', `test+${Date.now()}@dromos.test`);
    await page.fill('input[autocomplete="new-password"]', '123');
    // Step 1 submit button says "Continue →"
    await page.getByRole('button', { name: 'Continue →' }).click();
    // HTML5 minLength=6 prevents form submission — password field stays on screen
    await expect(page.locator('input[autocomplete="new-password"]')).toBeVisible();
  });
});
