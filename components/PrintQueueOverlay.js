'use client';
import { useEffect, useRef, useState } from 'react';
import PdfFloatingViewer from '@/components/PdfFloatingViewer';
import {
  getBridgePrintQueue,
  cancelBridgePrintJob,
  openBridgePrintQueue,
} from '@/lib/print-bridge-client';

export default function PrintQueueOverlay({ bridgeUrl, bridgeToken, printerName, onClose }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelingIds, setCancelingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [cancelingAll, setCancelingAll] = useState(false);
  const [pdfViewerTarget, setPdfViewerTarget] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function fetchQueue() {
      try {
        const data = await getBridgePrintQueue(bridgeUrl, bridgeToken);
        if (!alive) return;
        const list = data?.queue?.jobs ?? data?.jobs ?? (Array.isArray(data) ? data : []);
        setJobs(Array.isArray(list) ? list : []);
        setLoading(false);
        setError('');
      } catch (e) {
        if (!alive) return;
        setError(e.message || 'No se pudo leer la cola');
        setLoading(false);
      }
    }

    fetchQueue();
    intervalRef.current = setInterval(fetchQueue, 2500);
    return () => { alive = false; clearInterval(intervalRef.current); };
  }, [bridgeUrl, bridgeToken]);

  // Escape cierra el visor de PDF si esta abierto; si no, cierra el overlay entero.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (pdfViewerTarget) setPdfViewerTarget(null);
      else onClose();
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, pdfViewerTarget]);

  async function cancelJob(jobId) {
    setCancelingIds(prev => new Set([...prev, jobId]));
    try {
      await cancelBridgePrintJob(bridgeUrl, bridgeToken, jobId);
      setJobs(prev => prev.filter(j => String(j.id) !== String(jobId)));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    } catch {}
    finally {
      setCancelingIds(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  }

  async function cancelSelected() {
    const ids = [...selectedIds];
    setCancelingAll(true);
    for (const id of ids) await cancelJob(id);
    setSelectedIds(new Set());
    setCancelingAll(false);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === jobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(jobs.map(j => j.id)));
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(27,47,94,0.28)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}
    >
      <div style={{ background: 'white', borderRadius: 13, border: '1.5px solid #dde1ef', boxShadow: '0 12px 40px rgba(27,47,94,0.2)', width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1.5px solid #f0f2f8', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1B2F5E', flex: 1 }}>Cola de impresión</span>
          {printerName && (
            <span style={{ fontSize: 11, color: '#9aa3bc', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{printerName}</span>
          )}
          <button
            onClick={() => openBridgePrintQueue(bridgeUrl, bridgeToken, printerName).catch(() => {})}
            style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 900, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}
          >
            Abrir cola Epson
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9aa3bc', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>

        {/* Column headers */}
        {!loading && !error && jobs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 108px 66px', gap: 8, padding: '5px 14px', background: '#f7f8fc', borderBottom: '1px solid #f0f2f8', flexShrink: 0, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={selectedIds.size === jobs.length && jobs.length > 0}
              onChange={toggleSelectAll}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.4 }}>Documento</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' }}>Estado</span>
            <span />
          </div>
        )}

        {/* Job list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && (
            <p style={{ textAlign: 'center', color: '#9aa3bc', fontSize: 12, padding: '36px 16px' }}>Cargando cola...</p>
          )}
          {!loading && error && (
            <p style={{ textAlign: 'center', color: '#b91c1c', fontSize: 12, padding: '36px 16px', lineHeight: 1.5 }}>
              {error}<br />
              <span style={{ fontSize: 11, color: '#9aa3bc' }}>Verificá que el bridge esté activo.</span>
            </p>
          )}
          {!loading && !error && jobs.length === 0 && (
            <p style={{ textAlign: 'center', color: '#9aa3bc', fontSize: 13, padding: '40px 16px', lineHeight: 1.6 }}>
              La cola está vacía
            </p>
          )}
          {!loading && !error && jobs.map((job, idx) => {
            const id = job.id ?? idx;
            const isPrinting = job.status === 'printing' || job.position === 0 || idx === 0;
            const isCanceling = cancelingIds.has(id);
            const isSelected = selectedIds.has(id);
            const docName = job.designName || job.document || job.name || job.pdfFileName || job.fileName || `Trabajo #${id}`;
            const cleanName = String(docName).replace(/\.pdf$/i, '');
            const canView = Boolean(job.rootName && job.relativePath);
            const pagesPrinted = typeof job.pagesPrinted === 'number' ? job.pagesPrinted : null;
            const totalPages = typeof job.totalPages === 'number' && job.totalPages > 0 ? job.totalPages : null;

            return (
              <div
                key={id}
                onClick={() => toggleSelect(id)}
                style={{
                  display: 'grid', gridTemplateColumns: '22px 1fr 108px 66px', gap: 8,
                  padding: '6px 14px', borderBottom: '1px solid #f0f2f8',
                  background: isSelected ? '#eff4ff' : isPrinting ? '#fefce8' : 'white',
                  alignItems: 'center', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(id)}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                  <span
                    onClick={canView ? (e => { e.stopPropagation(); setPdfViewerTarget({ rootName: job.rootName, relativePath: job.relativePath, fileName: job.pdfFileName || docName }); }) : undefined}
                    title={canView ? `${job.rootName}\\${job.relativePath} — click para ver` : docName}
                    style={{
                      fontSize: 12, fontWeight: 800, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', minWidth: 0,
                      cursor: canView ? 'pointer' : 'default',
                      textDecoration: canView ? 'underline' : 'none', textDecorationColor: '#c7d2e8',
                    }}
                  >{cleanName}</span>
                  {(job.copies || job.size) && (
                    <span style={{ fontSize: 10, color: '#9aa3bc', flexShrink: 0, fontWeight: 600 }}>
                      {job.copies ? `${job.copies}c` : ''}
                      {job.copies && job.size ? ' · ' : ''}
                      {job.size ? job.size : ''}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'center' }}>
                  {isPrinting ? (
                    <span style={{ fontSize: 10, fontWeight: 900, color: '#d97706', background: '#fef9c3', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                      Imprimiendo{pagesPrinted != null && totalPages != null ? ` ${pagesPrinted}/${totalPages}` : ''}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#5a6380', background: '#f3f5fb', borderRadius: 5, padding: '2px 6px' }}>
                      Espera {typeof job.position === 'number' ? `#${job.position + 1}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={e => { e.stopPropagation(); cancelJob(id); }}
                    disabled={isCanceling}
                    style={{ border: '1.5px solid #fecaca', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: isCanceling ? 'wait' : 'pointer', color: '#b91c1c', background: '#fff5f5', fontFamily: 'Barlow, sans-serif', opacity: isCanceling ? 0.6 : 1 }}
                  >
                    {isCanceling ? '...' : 'Cancelar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: bulk cancel */}
        <div style={{ padding: '8px 16px', borderTop: '1.5px solid #f0f2f8', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minHeight: 44 }}>
          {selectedIds.size > 0 ? (
            <>
              <span style={{ fontSize: 12, color: '#1B2F5E', fontWeight: 700, flex: 1 }}>
                {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <button
                onClick={cancelSelected}
                disabled={cancelingAll}
                style={{ border: 'none', background: '#b91c1c', color: 'white', borderRadius: 7, padding: '5px 14px', fontSize: 12, fontWeight: 800, cursor: cancelingAll ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                {cancelingAll ? 'Cancelando...' : `Cancelar ${selectedIds.size}`}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 10, color: '#c0c5d4', flex: 1 }}>
              {jobs.length > 0 ? `${jobs.length} trabajo${jobs.length !== 1 ? 's' : ''} en cola · ESC para cerrar` : 'ESC para cerrar'}
            </span>
          )}
        </div>
      </div>

      {pdfViewerTarget && (
        <PdfFloatingViewer
          rootName={pdfViewerTarget.rootName}
          relativePath={pdfViewerTarget.relativePath}
          fileName={pdfViewerTarget.fileName}
          onClose={() => setPdfViewerTarget(null)}
        />
      )}
    </div>
  );
}
