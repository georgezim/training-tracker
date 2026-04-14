import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/supabase-server';

// Uses service role key so it can create the bucket and upload on behalf of user
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  // Ensure the avatars bucket exists
  const { data: buckets } = await adminSupabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === 'avatars');
  if (!bucketExists) {
    const { error: bucketError } = await adminSupabase.storage.createBucket('avatars', { public: true });
    if (bucketError) {
      console.error('[avatar] Failed to create bucket:', bucketError);
      return NextResponse.json({ error: 'Bucket creation failed' }, { status: 500 });
    }
    console.log('[avatar] Created avatars bucket');
  }

  const path = `${user.id}/avatar.jpg`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await adminSupabase.storage
    .from('avatars')
    .upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error('[avatar] Upload error:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = adminSupabase.storage
    .from('avatars')
    .getPublicUrl(path);

  // Add cache-busting so the browser doesn't show the old image
  const urlWithBust = `${publicUrl}?t=${Date.now()}`;

  // Save to profile
  await adminSupabase
    .from('profiles')
    .update({ avatar_url: urlWithBust })
    .eq('id', user.id);

  return NextResponse.json({ url: urlWithBust });
}
