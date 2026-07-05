import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

// Cooldown propio del navegador para no disparar un aviso por cada request
// que falle en loop; el endpoint /api/notify-error tiene su propio cooldown
// del lado del servidor, esto es una capa extra.
let lastNotifiedAt = 0;
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

async function supabaseFetch(input, init) {
  const response = await fetch(input, init);

  if (response.status === 402 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inkora:supabase-402'));

    const now = Date.now();
    if (now - lastNotifiedAt > NOTIFY_COOLDOWN_MS) {
      lastNotifiedAt = now;
      fetch('/api/notify-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'supabase_402',
          message: 'Supabase devolvio 402 (Fair Use Policy / cuota excedida)',
        }),
      }).catch(() => {});
    }
  }

  return response;
}

export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
  global: { fetch: supabaseFetch },
});
