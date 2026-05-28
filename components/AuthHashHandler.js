'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthHashHandler() {
  useEffect(() => {
    const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return;

    let cancelled = false;

    async function restoreSession() {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      if (error) {
        const nextUrl = new URL(cleanUrl || '/', window.location.origin);
        nextUrl.searchParams.set('auth_error', error.message);
        window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}`);
        return;
      }

      window.history.replaceState(null, '', cleanUrl || '/');
      window.dispatchEvent(new CustomEvent('inkora_auth_restored'));
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
