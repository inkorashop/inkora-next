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
    const handler = (e) => {
      if (e.origin !== 'https://www.inkora.com.ar') return;
      if (e.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', handler);
        popup?.close();
        resolve({ error: null });
      }
    };
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
