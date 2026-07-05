'use client';

import { useEffect, useRef, useState } from 'react';
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
  // Si al CARGAR la pagina (mount) ya habia un mantenimiento programado o
  // activo, esta carga cuenta como "usuario recien llegado / que recargo" y
  // se bloquea directo, sin esperar a que se cumpla la cuenta regresiva. Si
  // en cambio el mantenimiento se programa mientras la pestana ya estaba
  // abierta (detectado en un poll posterior al primero), se muestra el
  // cartel con cuenta regresiva y solo se bloquea cuando esta llega a cero.
  const [freshLoadBlocked, setFreshLoadBlocked] = useState(false);
  const firstFetchDoneRef = useRef(false);

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
        if (cancelled) return;

        const val = data?.[0]?.value;
        const parsed = val ? new Date(val) : null;
        setActivatesAt(parsed);

        if (!firstFetchDoneRef.current) {
          firstFetchDoneRef.current = true;
          setFreshLoadBlocked(!!parsed);
        } else if (!parsed) {
          // Se desactivo desde Admin: se libera en vivo, sin recargar.
          setFreshLoadBlocked(false);
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

  if (freshLoadBlocked || (activatesAtMs && now >= activatesAtMs)) {
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
