'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredBridgeConfig, fetchBridgePdfBlob } from '@/lib/print-bridge-client';

// Ventana flotante que muestra un PDF vinculado sin subirlo a la web: pide
// los bytes al Bridge (que es quien tiene acceso a la carpeta local) y los
// dibuja nosotros mismos con pdf.js sobre <canvas>, en vez de delegarle el
// render al visor nativo del navegador (que trae su propia barra de
// herramientas y no se puede estilar). Asi el modal entero, con zoom,
// imprimir y descargar, queda con el estilo del resto de la web.

let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    // El worker se sirve como archivo estatico (copiado a public/pdfjs por
    // scripts/copy-pdf-worker.js en cada npm install) en vez de resolverse
    // por bundler: pdfjs-dist es ESM puro y Next no puede analizarlo bien
    // para el grafo de Server Components ni con el truco de webpack
    // `new URL(..., import.meta.url)`.
    pdfjsLibPromise = import('pdfjs-dist').then(pdfjsLib => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return pdfjsLib;
    });
  }
  return pdfjsLibPromise;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const DEFAULT_SCALE = 1.25;
const ZOOM_STEP = 0.15;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, +value.toFixed(2)));
}

const toolBtnStyle = {
  border: 'none',
  background: '#eef4ff',
  color: '#1B2F5E',
  borderRadius: 7,
  height: 30,
  width: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: 15,
  fontWeight: 800,
  fontFamily: 'Barlow, sans-serif',
};

function PrintIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function PdfFloatingViewer({ rootName, relativePath, fileName, onClose }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);

  const pdfDocRef = useRef(null);
  const canvasRefs = useRef([]);
  const renderTasksRef = useRef([]);
  const printFrameRef = useRef(null);
  const scrollBodyRef = useRef(null);
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

        const [pdfjsLib, arrayBuffer] = await Promise.all([loadPdfjs(), blob.arrayBuffer()]);
        if (cancelled) return;

        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) { pdfDoc.destroy(); return; }

        pdfDocRef.current = pdfDoc;
        canvasRefs.current = [];
        renderTasksRef.current = [];
        setNumPages(pdfDoc.numPages);
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
      renderTasksRef.current.forEach(task => task?.cancel?.());
      pdfDocRef.current?.destroy?.();
      pdfDocRef.current = null;
    };
  }, [rootName, relativePath]);

  const renderPage = useCallback(async (pageNumber, targetScale) => {
    const pdfDoc = pdfDocRef.current;
    const canvas = canvasRefs.current[pageNumber - 1];
    if (!pdfDoc || !canvas) return;

    renderTasksRef.current[pageNumber - 1]?.cancel?.();

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: targetScale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    renderTasksRef.current[pageNumber - 1] = task;
    try {
      await task.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') throw err;
    }
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !numPages) return;
    for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
      renderPage(pageNumber, scale);
    }
  }, [status, numPages, scale, renderPage]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' || e.key === 'Enter') closeRef.current?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (printFrameRef.current) {
        document.body.removeChild(printFrameRef.current);
        printFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    // React registra los listeners de "wheel" como pasivos (para no trabar
    // el scroll normal), y ahi preventDefault() no hace nada: Ctrl+rueda
    // terminaba zoomeando la pagina entera del navegador ademas de (o en vez
    // de) el PDF. Un listener nativo no-pasivo si puede frenar ese zoom.
    function handleWheel(e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale(prev => clampScale(prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  function handlePrint() {
    if (!blobUrl) return;
    let iframe = printFrameRef.current;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      printFrameRef.current = iframe;
    }
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
    iframe.src = blobUrl;
  }

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(17,32,64,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '90vw', height: '90vh', maxWidth: 1100, minHeight: 0, background: 'white', borderRadius: 16,
          border: '1.5px solid #dde1ef', boxShadow: '0 8px 40px rgba(27,47,94,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'Barlow, sans-serif', margin: 'auto', flexShrink: 0,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '10px 14px', borderBottom: '1px solid #eef1f8', flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={fileName}>
            {fileName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {status === 'ready' && (
              <>
                <button type="button" onClick={() => setScale(s => clampScale(s - ZOOM_STEP))} title="Alejar" style={toolBtnStyle}>−</button>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5f6b89', width: 38, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                <button type="button" onClick={() => setScale(s => clampScale(s + ZOOM_STEP))} title="Acercar" style={toolBtnStyle}>+</button>
                <div style={{ width: 1, height: 20, background: '#eef1f8', margin: '0 2px' }} />
                <button type="button" onClick={handlePrint} title="Imprimir" style={{ ...toolBtnStyle, width: 'auto', padding: '0 10px', gap: 6 }}>
                  <PrintIcon /> Imprimir
                </button>
                <a href={blobUrl} download={fileName} title="Descargar" style={{ ...toolBtnStyle, width: 'auto', padding: '0 10px', gap: 6, textDecoration: 'none' }}>
                  <DownloadIcon /> Descargar
                </a>
                <div style={{ width: 1, height: 20, background: '#eef1f8', margin: '0 2px' }} />
              </>
            )}
            <button
              type="button"
              onClick={() => onClose?.()}
              title="Cerrar (Esc)"
              style={{ ...toolBtnStyle, height: 32, width: 32, fontSize: 16 }}
            >
              ×
            </button>
          </div>
        </div>

        <div ref={scrollBodyRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#eef1f8', padding: 20 }}>
          {status === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#5f6b89', fontSize: 13, fontWeight: 700 }}>
              Cargando PDF...
            </div>
          )}
          {status === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', height: '100%', color: '#b91c1c', fontSize: 13, fontWeight: 700, padding: 24, textAlign: 'center' }}>
              <span>No se pudo abrir el PDF</span>
              <span style={{ fontWeight: 400, opacity: 0.85, fontSize: 12 }}>{error}</span>
            </div>
          )}
          {status === 'ready' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              {Array.from({ length: numPages }, (_, i) => (
                <canvas
                  key={i}
                  ref={el => { canvasRefs.current[i] = el; }}
                  style={{ background: 'white', boxShadow: '0 2px 14px rgba(27,47,94,0.16)', maxWidth: '100%' }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
