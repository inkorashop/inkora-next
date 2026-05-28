'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const INVALID_TOKEN_MESSAGE = 'El token no es valido';

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return atob(padded);
}

export default function InviteAccessClient({ token }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Cargando...');
  const [error, setError] = useState('');

  const params = useMemo(() => ({
    accessToken: token || searchParams.get('k'),
    encodedEmail: searchParams.get('e'),
    code: searchParams.get('c'),
    tokenHash: searchParams.get('t') || searchParams.get('token_hash'),
    next: searchParams.get('next') || '/',
  }), [searchParams, token]);

  useEffect(() => {
    let cancelled = false;

    async function signInFromInvite() {
      try {
        let response;
        let nextPath = params.next;

        if (params.accessToken) {
          const accessResponse = await fetch('/api/invite-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: params.accessToken }),
          });
          const accessData = await accessResponse.json();
          if (!accessResponse.ok) throw new Error(INVALID_TOKEN_MESSAGE);

          nextPath = accessData.next || nextPath;
          if (accessData.emailOtp && (accessData.email || accessData.encodedEmail)) {
            response = await supabase.auth.verifyOtp({
              email: accessData.email || decodeBase64Url(accessData.encodedEmail),
              token: accessData.emailOtp,
              type: 'magiclink',
            });
          } else if (accessData.tokenHash) {
            response = await supabase.auth.verifyOtp({
              token_hash: accessData.tokenHash,
              type: 'magiclink',
            });
          } else {
            throw new Error(INVALID_TOKEN_MESSAGE);
          }
        } else if (params.tokenHash) {
          response = await supabase.auth.verifyOtp({
            token_hash: params.tokenHash,
            type: 'magiclink',
          });
        } else if (params.encodedEmail && params.code) {
          response = await supabase.auth.verifyOtp({
            email: decodeBase64Url(params.encodedEmail),
            token: params.code,
            type: 'magiclink',
          });
        } else {
          throw new Error(INVALID_TOKEN_MESSAGE);
        }

        if (response.error || !response.data?.session) throw new Error(INVALID_TOKEN_MESSAGE);

        if (cancelled) return;
        setStatus('Cargando...');
        router.replace(nextPath.startsWith('/') ? nextPath : '/');
      } catch {
        if (cancelled) return;
        setError(INVALID_TOKEN_MESSAGE);
        setStatus('No pudimos iniciar sesion');
      }
    }

    signInFromInvite();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f4ff',
      color: '#1B2F5E',
      fontFamily: 'Barlow, Arial, sans-serif',
      padding: 24,
    }}>
      <section style={{
        width: '100%',
        maxWidth: 420,
        border: '1px solid #d9e1f1',
        borderRadius: 12,
        background: '#fff',
        boxShadow: '0 16px 44px rgba(27,47,94,0.12)',
        padding: 24,
        textAlign: 'center',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>{status}</h1>
        <p style={{ margin: 0, color: error ? '#b42318' : '#5f6b89', fontSize: 14, lineHeight: 1.45 }}>
          {error || 'Cargando...'}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => router.replace('/')}
            style={{
              marginTop: 18,
              height: 38,
              border: 'none',
              borderRadius: 8,
              background: '#1B2F5E',
              color: '#fff',
              fontWeight: 800,
              padding: '0 18px',
              cursor: 'pointer',
            }}
          >
            Ir al inicio
          </button>
        )}
      </section>
    </main>
  );
}
