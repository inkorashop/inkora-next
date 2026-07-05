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
  const waText = isMaintenance
    ? 'Hola! Te escribo porque vi que la pagina esta en mantenimiento.'
    : 'Hola! Te escribo porque vi que la pagina esta teniendo un problema tecnico.';

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
          href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25D366',
            color: 'white', fontWeight: 700, fontSize: 14, padding: '12px 22px', borderRadius: 12,
            textDecoration: 'none', fontFamily: 'Barlow, sans-serif',
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="white" style={{ flexShrink: 0 }}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.934 1.395 5.604L0 24l6.532-1.372A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.368l-.36-.214-3.724.782.795-3.632-.235-.374A9.818 9.818 0 012.182 12C2.182 6.578 6.578 2.182 12 2.182S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/>
          </svg>
          Escribinos por WhatsApp
        </a>
      </div>
    </div>
  );
}
