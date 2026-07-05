'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ServiceUnavailable from './ServiceUnavailable';

// Rutas de uso interno: nunca se bloquean ni muestran el aviso de
// mantenimiento, para que el staff pueda seguir trabajando.
const EXEMPT_PREFIXES = ['/admin', '/operarios', '/produccion'];

const POLL_MS = 15000;
const SESSION_VISITED_KEY = 'inkora_session_active';

// Distingue un reload real (F5, boton de recargar, location.reload()) de una
// navegacion normal (click en un link, aunque sea un <a> que recarga el
// documento) o de la carga inicial de la pestana.
function isHardReload() {
  if (typeof window === 'undefined' || !window.performance) return false;
  try {
    const [entry] = window.performance.getEntriesByType('navigation');
    if (entry) return entry.type === 'reload';
  } catch {
    // noop
  }
  return false;
}

export default function MaintenanceGate({ children }) {
  const pathname = usePathname() || '';
  const exempt = EXEMPT_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));

  const [activatesAt, setActivatesAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [supabaseDown, setSupabaseDown] = useState(false);
  // Si al CARGAR la pagina ya habia mantenimiento programado/activo, y esta
  // carga es un reload real o la primera de la pestana (no una navegacion
  // interna dentro de una sesion ya en curso), se bloquea directo sin
  // esperar el resto de la cuenta regresiva.
  const [freshLoadBlocked, setFreshLoadBlocked] = useState(false);
  const firstFetchDoneRef = useRef(false);
  const activatesAtMsRef = useRef(null);
  const freshLoadBlockedRef = useRef(false);

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
        const parsedMs = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : null;

        const wasBlocked = freshLoadBlockedRef.current
          || (activatesAtMsRef.current !== null && Date.now() >= activatesAtMsRef.current);

        let nextFreshLoadBlocked = freshLoadBlockedRef.current;
        if (!firstFetchDoneRef.current) {
          firstFetchDoneRef.current = true;
          let sessionAlreadyActive = false;
          try { sessionAlreadyActive = sessionStorage.getItem(SESSION_VISITED_KEY) === 'true'; } catch {}
          try { sessionStorage.setItem(SESSION_VISITED_KEY, 'true'); } catch {}
          nextFreshLoadBlocked = parsedMs !== null && (isHardReload() || !sessionAlreadyActive);
        } else if (parsedMs === null) {
          nextFreshLoadBlocked = false;
        }

        const willBeBlocked = nextFreshLoadBlocked || (parsedMs !== null && Date.now() >= parsedMs);

        activatesAtMsRef.current = parsedMs;
        freshLoadBlockedRef.current = nextFreshLoadBlocked;
        setActivatesAt(parsedMs !== null ? new Date(parsedMs) : null);
        setFreshLoadBlocked(nextFreshLoadBlocked);

        // Si el usuario estaba viendo la pantalla de mantenimiento y ya se
        // desactivo, se recarga de una para que vea la pagina real y
        // actualizada, en vez de destaparla en silencio con contenido viejo.
        if (wasBlocked && !willBeBlocked) {
          window.location.reload();
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

  const activatesAtMs = activatesAt ? activatesAt.getTime() : null;
  const blockedByMaintenance = freshLoadBlocked || (activatesAtMs !== null && now >= activatesAtMs);
  const showCountdownBanner = !blockedByMaintenance && activatesAtMs !== null;
  const minutesLeft = showCountdownBanner ? Math.max(1, Math.ceil((activatesAtMs - now) / 60000)) : 0;

  // El contenido real de la pagina se mantiene montado (no se destruye su
  // estado) y el aviso se superpone encima, para que no se sienta como que
  // la pagina "se reinicia" al entrar en mantenimiento o al detectar un 402.
  return (
    <>
      {showCountdownBanner && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 9998, background: '#c53030', color: 'white',
          textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 700,
          fontFamily: 'Barlow, sans-serif',
        }}>
          La pagina entrara en servicio tecnico en {minutesLeft} minuto{minutesLeft !== 1 ? 's' : ''}
        </div>
      )}
      {children}
      {supabaseDown && <ServiceUnavailable variant="error" />}
      {!supabaseDown && blockedByMaintenance && <ServiceUnavailable variant="maintenance" />}
    </>
  );
}
