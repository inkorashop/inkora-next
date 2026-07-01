'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DesignsContext = createContext(null);

export function DesignsProvider({ designs = [], children }) {
  const [lightbox, setLightbox] = useState(null); // { imageUrl, name } | null

  const designById = useMemo(() => {
    const m = new Map();
    for (const d of designs) if (d.id) m.set(String(d.id), d);
    return m;
  }, [designs]);

  const designByName = useMemo(() => {
    const m = new Map();
    for (const d of designs) if (d.name) m.set(d.name.toLowerCase(), d);
    return m;
  }, [designs]);

  const openLightbox = useCallback((imageUrl, name) => {
    setLightbox({ imageUrl, name: name || '' });
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  // Close on Escape
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === 'Escape') closeLightbox(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, closeLightbox]);

  const overlayRef = useRef(null);

  const value = useMemo(() => ({
    designs, designById, designByName, openLightbox,
  }), [designs, designById, designByName, openLightbox]);

  return (
    <DesignsContext.Provider value={value}>
      {children}

      {lightbox && (
        <div
          ref={overlayRef}
          onClick={(e) => { if (e.target === overlayRef.current) closeLightbox(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '85vw', maxHeight: '85vh' }}>
            <img
              src={lightbox.imageUrl}
              alt={lightbox.name}
              style={{
                display: 'block',
                maxWidth: '85vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: 10,
                boxShadow: '0 8px 48px rgba(0,0,0,0.5)',
              }}
            />
            {lightbox.name && (
              <div style={{
                position: 'absolute', bottom: -32, left: 0, right: 0,
                textAlign: 'center', color: 'white', fontSize: 13, fontWeight: 600,
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}>
                {lightbox.name}
              </div>
            )}
            <button
              onClick={closeLightbox}
              aria-label="Cerrar"
              style={{
                position: 'absolute', top: -14, right: -14,
                width: 30, height: 30, borderRadius: '50%',
                background: 'white', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#1B2F5E',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </DesignsContext.Provider>
  );
}

export function useDesigns() {
  const ctx = useContext(DesignsContext);
  if (!ctx) throw new Error('useDesigns must be used inside DesignsProvider');
  return ctx;
}
