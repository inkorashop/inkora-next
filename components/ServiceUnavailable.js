'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DEFAULT_WA = process.env.NEXT_PUBLIC_WHATSAPP || '3765211017';

// Misma logica que se usa al confirmar un pedido / icono de WhatsApp del
// catalogo: numero del vendedor asignado si existe, si no el numero por defecto.
function resolveWaNumber(profile) {
  const rawWA = profile?.sellers?.phone?.replace(/\D/g, '') || DEFAULT_WA;
  return rawWA.startsWith('549') ? rawWA : `549${rawWA}`;
}

export default function ServiceUnavailable({ variant = 'error', title, message }) {
  const [waNumber, setWaNumber] = useState(() => resolveWaNumber(null));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('profiles')
          .select('*, sellers(id, name, phone)')
          .eq('id', user.id)
          .single();
        if (!cancelled && data) setWaNumber(resolveWaNumber(data));
      } catch {
        // Si falla (p. ej. Supabase caido), se mantiene el numero por defecto.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isMaintenance = variant === 'maintenance';
  const heading = title || (isMaintenance ? 'Estamos en mantenimiento' : 'Servicio no disponible');
  const body = message || (isMaintenance
    ? 'Estamos realizando tareas de mantenimiento en la pagina. Volvemos en breve, gracias por tu paciencia.'
    : 'Estamos teniendo un problema tecnico temporal. Ya estamos trabajando para solucionarlo, disculpa las molestias.');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(160deg, #0f1b3d, #1B2F5E)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, maxWidth: 440, width: '100%',
        padding: '40px 32px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>{isMaintenance ? '\u{1F6E0}\u{FE0F}' : '⚠️'}</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1B2F5E', margin: '0 0 12px', fontFamily: 'Barlow, sans-serif' }}>
          {heading}
        </h1>
        <p style={{ fontSize: 14, color: '#5a6380', lineHeight: 1.6, margin: '0 0 28px', fontFamily: 'Barlow, sans-serif' }}>
          {body}
        </p>
        <a
          href={`https://wa.me/${waNumber}?text=${encodeURIComponent('Hola! Te escribo porque vi que la pagina esta con un problema tecnico / en mantenimiento.')}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25D366',
            color: 'white', fontWeight: 700, fontSize: 14, padding: '12px 22px', borderRadius: 12,
            textDecoration: 'none', fontFamily: 'Barlow, sans-serif',
          }}
        >
          Escribinos por WhatsApp
        </a>
      </div>
    </div>
  );
}
