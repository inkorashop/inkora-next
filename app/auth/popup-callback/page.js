'use client';
import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function PopupCallback() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (session.user?.email) {
          localStorage.setItem('inkora_login_hint', session.user.email);
        }
        if (window.opener) {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, 'https://www.inkora.com.ar');
          window.close();
        }
      }
    });
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#1B2F5E' }}>
      Iniciando sesión...
    </div>
  );
}