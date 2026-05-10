'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

async function generateNonce() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  const nonce = btoa(String.fromCharCode(...randomBytes));
  const encoder = new TextEncoder();
  const encodedNonce = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { nonce, hashedNonce };
}

export default function GoogleOneTap({ enabled = true, onSuccess }) {
  const initializedRef = useRef(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) return;

      const previousGoogleEmail = localStorage.getItem('inkora_login_hint');

      // Esto hace que aparezca solo para usuarios que ya usaron Google antes.
      if (!previousGoogleEmail) return;

      setShouldLoad(true);
    });
  }, [enabled]);

  async function initializeGoogleOneTap() {
    if (initializedRef.current) return;
    if (!enabled) return;
    if (!window.google?.accounts?.id) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const previousGoogleEmail = localStorage.getItem('inkora_login_hint');

    if (!clientId || !previousGoogleEmail) return;

    initializedRef.current = true;

    const { nonce, hashedNonce } = await generateNonce();

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        if (!response?.credential) return;

        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce,
        });

        if (error) {
          console.error('Google One Tap error:', error.message);
          return;
        }

        if (data?.user?.email) {
          localStorage.setItem('inkora_login_hint', data.user.email);
          localStorage.setItem('inkora_google_hint_enabled', 'true');
        }

        window.dispatchEvent(new CustomEvent('inkora_auth_success'));

        if (onSuccess) {
          onSuccess(data?.user || null);
        }
      },
      nonce: hashedNonce,
      login_hint: previousGoogleEmail,
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
    });

    window.google.accounts.id.prompt();
  }

  if (!shouldLoad) return null;

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onReady={initializeGoogleOneTap}
    />
  );
}