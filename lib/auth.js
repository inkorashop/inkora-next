import { supabase } from '@/lib/supabase';

export async function signUp({ email, password, name }) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
}

export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInWithGoogle() {
  const hint = typeof window !== 'undefined' ? localStorage.getItem('inkora_login_hint') || '' : '';
  const hintEnabled = typeof window !== 'undefined' ? localStorage.getItem('inkora_google_hint_enabled') === 'true' : false;
  const url = `/api/auth/google${hintEnabled && hint ? `?hint=${encodeURIComponent(hint)}` : ''}`;
  const popup = window.open(url, 'google-auth', 'width=500,height=600,top=100,left=100');
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      settled = true;
      window.removeEventListener('message', handler);
      clearInterval(closedTimer);
      clearTimeout(timeoutTimer);
    };
    const handler = (e) => {
      const allowedOrigins = new Set([
        window.location.origin,
        'https://www.inkora.com.ar',
        'https://inkora.com.ar',
      ]);
      if (!allowedOrigins.has(e.origin)) return;
      if (e.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        cleanup();
        popup?.close();
        resolve({ error: null });
      }
    };
    const closedTimer = setInterval(() => {
      if (!popup || popup.closed) {
        cleanup();
        resolve({ error: new Error('Se cerro la ventana de Google antes de terminar.') });
      }
    }, 700);
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      cleanup();
      popup?.close();
      resolve({ error: new Error('Google demoro demasiado. Intenta de nuevo.') });
    }, 45000);
    window.addEventListener('message', handler);
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('*, localities(*)')
    .eq('id', userId)
    .single();
  return data;
}
