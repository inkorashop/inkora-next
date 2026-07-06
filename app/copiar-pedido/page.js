'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const LOGO = 'https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png';

function CopyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="5" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 9v8a2 2 0 0 0 2 2h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CopiarPedidoContent() {
  const params = useSearchParams();
  const text = useMemo(() => params.get('texto') || '', [params]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function copyText() {
    if (!text.trim()) {
      setError('No hay texto de pedido para copiar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError('');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('El navegador no permitio copiar automaticamente. Selecciona el texto y copialo manualmente.');
    }
  }

  useEffect(() => {
    copyText();
    // Solo al abrir el link desde el email.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <main style={{ minHeight: '100vh', background: '#eef2f8', fontFamily: 'Barlow, Arial, sans-serif', color: '#1B2F5E', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <section style={{ width: '100%', maxWidth: 620, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 48px rgba(27,47,94,0.14)' }}>
        <div style={{ background: '#1B2F5E', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="INKORA" style={{ width: 34, height: 34, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 style={{ color: 'white', margin: 0, fontSize: 20, fontWeight: 900 }}>Copiar pedido</h1>
            <p style={{ color: 'rgba(255,255,255,0.68)', margin: '2px 0 0', fontSize: 12, fontWeight: 700 }}>Texto listo para WhatsApp</p>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: copied ? '#15803d' : '#5a6380' }}>
              {copied ? 'Pedido copiado al portapapeles.' : 'Si no se copio solo, usa el boton.'}
            </span>
            <button
              type="button"
              onClick={copyText}
              style={{ border: '1.5px solid #2D6BE4', borderRadius: 9, background: copied ? '#e8f7ef' : '#2D6BE4', color: copied ? '#15803d' : 'white', padding: '9px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'Barlow, Arial, sans-serif' }}
            >
              <CopyIcon />
              {copied ? 'Copiado' : 'Copiar pedido'}
            </button>
          </div>

          {error && (
            <div style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              {error}
            </div>
          )}

          <textarea
            value={text}
            readOnly
            onFocus={event => event.currentTarget.select()}
            style={{ width: '100%', minHeight: 290, boxSizing: 'border-box', border: '1.5px solid #dde1ef', borderRadius: 10, background: '#f8faff', padding: 14, color: '#1B2F5E', fontFamily: 'Consolas, monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
          />
        </div>
      </section>
    </main>
  );
}

export default function CopiarPedidoPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#eef2f8' }} />}>
      <CopiarPedidoContent />
    </Suspense>
  );
}
