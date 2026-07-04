'use client';

import { useEffect, useState } from 'react';

export default function PwaUpdateManager() {
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let refreshing = false;
    let registration = null;

    navigator.serviceWorker.register('/sw.js', { scope: '/admin/' }).then((reg) => {
      registration = reg;

      // Ya habia una version nueva esperando de antes de que se montara este componente.
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(installingWorker);
          }
        });
      });
    }).catch(() => {});

    function handleControllerChange() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 500, display: 'flex', alignItems: 'center', gap: 10, background: '#1B2F5E', color: 'white', borderRadius: 999, padding: '10px 10px 10px 16px', boxShadow: '0 8px 28px rgba(0,0,0,0.28)', fontFamily: 'Barlow, sans-serif' }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>Hay una versión nueva disponible</span>
      <button
        onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}
        style={{ border: 'none', background: '#2D6BE4', color: 'white', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
      >
        Actualizar ahora
      </button>
    </div>
  );
}
