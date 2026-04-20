'use client';

import { supabase } from '@/lib/supabase';

export function createBrowserSupabaseClient() {
  return supabase;
}