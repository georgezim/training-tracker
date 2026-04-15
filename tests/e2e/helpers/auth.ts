import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function createTestUser(emailPrefix = 'test') {
  const supabase = getSupabaseAdmin();
  const email = `${emailPrefix}+${Date.now()}@dromos.test`;
  const password = 'TestPassword123!';

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
  return { userId: data.user.id, email, password };
}

export async function deleteTestUser(userId: string) {
  const supabase = getSupabaseAdmin();
  await supabase.auth.admin.deleteUser(userId);
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
}

export async function setupProfile(userId: string, profileData: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  await supabase.from('profiles').update(profileData).eq('id', userId);
}
