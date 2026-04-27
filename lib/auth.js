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
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://www.inkora.com.ar/auth/popup-callback',
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) return { error };
  const popup = window.open(data.url, 'google-auth', 'width=500,height=600,top=100,left=100');
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
