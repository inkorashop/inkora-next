'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProductoPage({ params }) {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash.includes('access_token') || window.location.search.includes('auth_success')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]auth_success=1/, ''));
      setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            window.dispatchEvent(new Event('inkora_auth_success'));
          }
        });
      }, 500);
    }
    router.replace(`/catalogo?producto=${params.producto}`);
  }, [params.producto, router]);
  return null;
}