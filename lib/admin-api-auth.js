import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export class AdminAuthError extends Error {
  constructor(message = 'No autorizado', status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAdmin(supabaseAdmin) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!url || !anonKey) {
    throw new AdminAuthError('Faltan variables de Supabase en el servidor', 500);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers may be rendered in contexts where cookie writes are unavailable.
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const email = data?.user?.email?.trim().toLowerCase();

  if (error || !email) {
    throw new AdminAuthError('No autorizado', 401);
  }

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('admins')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!adminRow) throw new AdminAuthError('No autorizado', 403);

  return { user: data.user, email };
}

export function adminAuthStatus(error) {
  return Number(error?.status || 500);
}
