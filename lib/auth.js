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
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://www.inkora.com.ar/auth/callback' },
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
