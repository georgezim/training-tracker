import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars in worker processes
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Optional — enables admin operations (deleteUser, backdating created_at)
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  const key = SERVICE_ROLE_KEY ?? ANON_KEY;
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseAnon() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(emailPrefix = 'test') {
  const email = `${emailPrefix}+${Date.now()}@dromos.test`;
  const password = 'TestPassword123!';

  if (SERVICE_ROLE_KEY) {
    // Admin path: create user with email pre-confirmed
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    return { userId: data.user.id, email, password };
  }

  // Public path: signUp (works when Supabase email confirmation is disabled)
  const anon = getSupabaseAnon();
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.user) throw new Error('signUp returned no user — email confirmation may be enabled. Add SUPABASE_SERVICE_ROLE_KEY to .env.local');
  return { userId: data.user.id, email, password };
}

export async function deleteTestUser(userId: string) {
  if (!SERVICE_ROLE_KEY) return; // Skip cleanup if no admin key — emails are unique by timestamp so no collision
  const admin = getSupabaseAdmin();
  await admin.auth.admin.deleteUser(userId);
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login') && !url.pathname.includes('/signup'), { timeout: 15000 });
}

/**
 * Update a user's profile. Call AFTER loginAs() — uses the browser session
 * to make an authenticated Supabase REST call (RLS: user can update own profile).
 */
export async function setupProfile(page: Page, userId: string, profileData: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Extract the access token from the Supabase session cookie set by @supabase/ssr
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name.includes('auth-token'));
  let accessToken: string | undefined;

  if (authCookie) {
    try {
      const decoded = decodeURIComponent(authCookie.value);
      const parsed = JSON.parse(decoded);
      // @supabase/ssr stores session as array [session, expiry] or as object
      accessToken = Array.isArray(parsed) ? parsed[0]?.access_token : parsed?.access_token;
    } catch { /* ignore parse errors */ }
  }

  if (!accessToken && SERVICE_ROLE_KEY) {
    // Fall back to admin client if cookie parsing failed
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('profiles').update(profileData).eq('id', userId);
    if (error) throw new Error(`Profile setup failed: ${error.message}`);
    return;
  }

  if (!accessToken) throw new Error('Could not get access token for profile setup. Ensure loginAs() was called first.');

  const res = await page.request.patch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      data: profileData,
    }
  );
  if (!res.ok()) throw new Error(`Profile setup REST call failed: ${res.status()} ${await res.text()}`);
}

/**
 * Backdate created_at on a user account.
 * Requires SUPABASE_SERVICE_ROLE_KEY — skipped silently if not available.
 */
export async function backdateUser(userId: string, isoDateStr: string) {
  if (!SERVICE_ROLE_KEY) return; // Skip silently — user stays with today's created_at
  const admin = getSupabaseAdmin();
  // @ts-ignore — created_at not in the public type but works via admin API
  await admin.auth.admin.updateUserById(userId, { created_at: isoDateStr });
}
