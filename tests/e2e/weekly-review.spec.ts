import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginAs, setupProfile, backdateUser, getSupabaseAdmin } from './helpers/auth';

test.describe('Scenario 7 — Weekly review API', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeEach(async ({ page }) => {
    ({ userId, email, password } = await createTestUser('review'));
    // Created 14+ days ago so a full week of data can exist
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    await backdateUser(userId, twoWeeksAgo.toISOString());
    await loginAs(page, email, password);
    await setupProfile(page, userId, {
      goal: 'marathon',
      training_level: 'intermediate',
      days_per_week: 4,
      preferred_activities: ['run'],
      custom_plan: [
        { day: 'Mon', type: 'run', label: 'Run', description: 'Easy run', color: 'blue' },
        { day: 'Tue', type: 'rest', label: 'Rest', description: '', color: 'gray' },
        { day: 'Wed', type: 'run', label: 'Run', description: 'Easy run', color: 'blue' },
        { day: 'Thu', type: 'rest', label: 'Rest', description: '', color: 'gray' },
        { day: 'Fri', type: 'run', label: 'Run', description: 'Easy run', color: 'blue' },
        { day: 'Sat', type: 'run', label: 'Long Run', description: 'Long run', color: 'blue' },
        { day: 'Sun', type: 'rest', label: 'Rest', description: '', color: 'gray' },
      ],
    });
  });

  test.afterEach(async () => { await deleteTestUser(userId); });

  test('review-week API returns valid action and multiplier', async ({ page }) => {
    // Use page.request to make authenticated POST (has session cookies)
    const response = await page.request.post('/api/review-week');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Should have an action and multiplier
    expect(['maintain', 'increase', 'reduce', 'recovery']).toContain(body.action);
    expect(typeof body.multiplier).toBe('number');
    expect(body.multiplier).toBeGreaterThan(0);

    // Verify plan_adjustment was saved to Supabase (requires service role key for RLS bypass)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from('profiles').select('plan_adjustment').eq('id', userId).single();
      expect(data?.plan_adjustment).toBeTruthy();
      expect(data?.plan_adjustment?.action).toBe(body.action);
    }
  });
});
