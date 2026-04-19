'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProductoPage({ params }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/catalogo?producto=${params.producto}`);
  }, [params.producto, router]);
  return null;
}