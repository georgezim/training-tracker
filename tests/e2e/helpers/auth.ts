import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars in worker processes
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  const key = SERVICE_ROLE_KEY ?? ANON_KEY;
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(emailPrefix = 'test') {
  const email = `${emailPrefix}+${Date.now()}@dromos.test`;
  const password = 'TestPassword123!';

  if (SERVICE_ROLE_KEY) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    return { userId: data.user.id, email, password };
  }

  // Public path — works when Supabase email confirmation is disabled
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.user) throw new Error('signUp returned no user — email confirmation may be enabled; add SUPABASE_SERVICE_ROLE_KEY to .env.local');
  return { userId: data.user.id, email, password };
}

export async function deleteTestUser(userId: string) {
  if (!SERVICE_ROLE_KEY) return;
  const admin = getSupabaseAdmin();
  await admin.auth.admin.deleteUser(userId);
}

/**
 * Log in via the UI and capture the Supabase access token from the auth response.
 * Returns the access token so it can be passed to setupProfile().
 */
export async function loginAs(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // waitForResponse + click in parallel so we don't miss the response
  const [response] = await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/auth/v1/token') && resp.status() === 200,
      { timeout: 15000 }
    ),
    page.click('button[type="submit"]'),
  ]);

  let token = '';
  try {
    const body = await response.json();
    token = body.access_token ?? '';
  } catch { /* ignore */ }

  await page.waitForURL(
    (url) => !url.pathname.includes('/login') && !url.pathname.includes('/signup'),
    { timeout: 15000 }
  );

  return token;
}

/**
 * Update a user's profile using their session access token.
 * Must be called AFTER loginAs().
 */
export async function setupProfile(
  _page: Page,
  userId: string,
  profileData: Record<string, unknown>,
  accessToken?: string
) {
  // Prefer admin client if available (fastest path)
  if (SERVICE_ROLE_KEY) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('profiles').update(profileData).eq('id', userId);
    if (error) throw new Error(`Profile setup (admin) failed: ${error.message}`);
    return;
  }

  if (!accessToken) {
    throw new Error('accessToken required for setupProfile without SERVICE_ROLE_KEY. Pass the token returned by loginAs().');
  }

  const res = await _page.request.patch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      data: profileData,
    }
  );
  if (!res.ok()) throw new Error(`Profile setup (REST) failed: ${res.status()} ${await res.text()}`);
}

/**
 * Upsert a daily checkin using the user's session token.
 */
export async function upsertCheckin(
  page: Page,
  checkinData: Record<string, unknown>,
  accessToken?: string
) {
  if (SERVICE_ROLE_KEY) {
    const admin = getSupabaseAdmin();
    await admin.from('daily_checkins').upsert(checkinData, { onConflict: 'user_id,date' });
    return;
  }
  if (!accessToken) return;

  await page.request.post(`${SUPABASE_URL}/rest/v1/daily_checkins`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    data: checkinData,
  });
}

/**
 * Backdate a user's created_at — requires admin key, silently skips if unavailable.
 */
export async function backdateUser(userId: string, isoDateStr: string) {
  if (!SERVICE_ROLE_KEY) return;
  const admin = getSupabaseAdmin();
  // @ts-ignore
  await admin.auth.admin.updateUserById(userId, { created_at: isoDateStr });
}
