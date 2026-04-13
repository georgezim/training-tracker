import { createSupabaseServer } from './supabase-server';

export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
