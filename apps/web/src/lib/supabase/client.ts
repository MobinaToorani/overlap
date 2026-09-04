'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

/** The browser-side Supabase client. Only holds the public anon key. */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
