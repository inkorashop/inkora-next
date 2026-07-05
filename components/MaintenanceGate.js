'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ServiceUnavailable from './ServiceUnavailable';

// Rutas de uso interno: nunca se bloquean ni muestran el aviso de
// mantenimiento, para que el staff pueda seguir trabajando.
const EXEMPT_PREFIXES = ['/admin', '/operarios', '/produccion'];

const POLL_MS = 15000;

export default function MaintenanceGate({ children }) {
  const pathname = usePathname() || '';
  const exempt = EXEMPT_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));

  const [activatesAt, setActivatesAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [supabaseDown, setSupabaseDown] = useState(false);

  useEffect(() => {
    if (exempt) return;

    function on402() { setSupabaseDown(true); }
    window.addEventListener('inkora:supabase-402', on402);

    let cancelled = false;
    async function tick() {
      setNow(Date.now());
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'maintenance_activates_at');
        if (!cancelled) {
          const val = data?.[0]?.value;
          setActivatesAt(val ? new Date(val) : null);
        }
      } catch {
        // Si falla la lectura de settings, se conserva el ultimo estado conocido.
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('inkora:supabase-402', on402);
    };
  }, [exempt]);

  if (exempt) return children;

  if (supabaseDown) {
    return <ServiceUnavailable variant="error" />;
  }

  const activatesAtMs = activatesAt ? activatesAt.getTime() : null;

  if (activatesAtMs && now >= activatesAtMs) {
    return <ServiceUnavailable variant="maintenance" />;
  }

  if (activatesAtMs) {
    const minutesLeft = Math.max(1, Math.ceil((activatesAtMs - now) / 60000));
    return (
      <>
        <div style={{
          position: 'sticky', top: 0, zIndex: 9998, background: '#c53030', color: 'white',
          textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 700,
          fontFamily: 'Barlow, sans-serif',
        }}>
          La pagina entrara en servicio tecnico en {minutesLeft} minuto{minutesLeft !== 1 ? 's' : ''}
        </div>
        {children}
      </>
    );
  }

  return children;
}
