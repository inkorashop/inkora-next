'use client';
import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function PopupCallback() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );
    let handled = false;
    supabase.auth.onAuthStateChange((event, session) => {
      // El login ya se completo del lado del servidor (app/api/auth/google/callback)
      // antes de que esta pagina cargue, asi que la sesion casi siempre llega
      // como INITIAL_SESSION (sesion ya existente al iniciar el cliente) y no
      // como SIGNED_IN (transicion en vivo). Solo esperar SIGNED_IN dejaba el
      // popup colgado en "Iniciando sesion..." para siempre en ese caso, aunque
      // la sesion ya estuviera creada.
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && !handled) {
        handled = true;
        if (session.user?.email) {
          localStorage.setItem('inkora_login_hint', session.user.email);
        }
        // Sincronizar el setting desde Supabase
        supabase.from('settings').select('value').eq('key', 'google_login_hint').single()
          .then(({ data }) => {
            localStorage.setItem('inkora_google_hint_enabled', data?.value === 'true' ? 'true' : 'false');
        });
        if (window.opener) {
          ['https://www.inkora.com.ar', 'https://inkora.com.ar'].forEach(origin => {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, origin);
          });
          window.close();
        }
      }
    });
  }, []);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const errorParam = searchParams?.get('error');

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#1B2F5E' }}>
      {errorParam ? `Error: ${errorParam}` : 'Iniciando sesión...'}
    </div>
  );
}
