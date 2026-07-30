'use client';

import { useEffect, useRef, useState } from 'react';
import { getStoredBridgeConfig, fetchBridgePdfBlob } from '@/lib/print-bridge-client';

// Ventana flotante que muestra un PDF vinculado sin subirlo a la web: pide
// los bytes al Bridge (que es quien tiene acceso a la carpeta local) y los
// renderiza con el visor nativo del navegador (<embed>), que ya trae zoom y
// scroll con la rueda del mouse sin tener que reimplementarlos.
export default function PdfFloatingViewer({ rootName, relativePath, fileName, onClose }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    async function load() {
      setStatus('loading');
      setError('');
      try {
        const { url, token } = getStoredBridgeConfig();
        if (!token) throw new Error('El Bridge de impresión todavía no está vinculado en este navegador.');
        const blob = await fetchBridgePdfBlob(url, token, { rootName, relativePath });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'No se pudo abrir el PDF.');
        setStatus('error');
      }
    }

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rootName, relativePath]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' || e.key === 'Enter') closeRef.current?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(17,32,64,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        style={{
          width: '90vw', height: '90vh', maxWidth: 1100, background: 'white', borderRadius: 16,
          border: '1.5px solid #dde1ef', boxShadow: '0 8px 40px rgba(27,47,94,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'Barlow, sans-serif',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 16px', borderBottom: '1px solid #eef1f8', flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
            {fileName}
          </div>
          <button
            onClick={() => onClose?.()}
            title="Cerrar (Esc)"
            style={{
              border: 'none', background: '#eef4ff', color: '#1B2F5E', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer', fontSize: 16, fontWeight: 800, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#525659' }}>
          {status === 'loading' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700 }}>
              Cargando PDF...
            </div>
          )}
          {status === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, padding: 24, textAlign: 'center' }}>
              <span>No se pudo abrir el PDF</span>
              <span style={{ fontWeight: 400, opacity: 0.8, fontSize: 12 }}>{error}</span>
            </div>
          )}
          {status === 'ready' && blobUrl && (
            <embed src={blobUrl} type="application/pdf" style={{ width: '100%', height: '100%', border: 'none' }} />
          )}
        </div>
      </div>
    </div>
  );
}
