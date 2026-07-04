import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export class AdminAuthError extends Error {
  constructor(message = 'No autorizado', status = 401) {
    super(message);
    this.status = status;
  }
}

// Resuelve el email del usuario logueado a partir de un request. Si el
// request trae un header "Authorization: Bearer <token>" (patron usado por
// paginas que ya tienen el access_token en JS, ej. el bridge de impresion),
// se valida ese token. Si no, cae a la sesion por cookies (patron estandar
// de los Route Handlers). `request` es opcional para no romper compatibilidad
// con los llamados existentes que ya funcionaban solo con cookies.
async function getRequestUserEmail(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !anonKey) {
    throw new AdminAuthError('Faltan variables de Supabase en el servidor', 500);
  }

  const authHeader = request?.headers?.get?.('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const supabaseAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user?.email) return null;
    return data.user.email.trim().toLowerCase();
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
  if (error || !data?.user?.email) return null;
  return data.user.email.trim().toLowerCase();
}

export async function requireAdmin(supabaseAdmin, request) {
  const email = await getRequestUserEmail(request);
  if (!email) throw new AdminAuthError('No autorizado', 401);

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('admins')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!adminRow) throw new AdminAuthError('No autorizado', 403);

  return { user: { email }, email };
}

// Igual que requireAdmin, pero tambien deja pasar a operarios de produccion
// activos (tabla production_operators). Usar en endpoints que ambos roles
// necesitan de verdad (ej. config del bridge de impresion, subida de
// imagenes del chat interno), no como default general.
export async function requireAdminOrOperator(supabaseAdmin, request) {
  const email = await getRequestUserEmail(request);
  if (!email) throw new AdminAuthError('No autorizado', 401);

  const [{ data: adminRow, error: adminError }, { data: operatorRow, error: operatorError }] = await Promise.all([
    supabaseAdmin.from('admins').select('email').eq('email', email).maybeSingle(),
    supabaseAdmin.from('production_operators').select('email, active').eq('email', email).maybeSingle(),
  ]);

  if (adminError) throw adminError;
  if (operatorError) throw operatorError;

  if (adminRow) return { user: { email }, email, role: 'admin' };
  if (operatorRow && operatorRow.active !== false) return { user: { email }, email, role: 'operator' };

  throw new AdminAuthError('No autorizado', 403);
}

export function adminAuthStatus(error) {
  return Number(error?.status || 500);
}
