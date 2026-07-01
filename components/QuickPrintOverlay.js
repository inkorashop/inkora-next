'use client';
import { useEffect, useRef, useState } from 'react';
import DesignThumb from '@/components/DesignThumb';
import {
  getStoredBridgeConfig,
  getBridgeHealth,
  getBridgePrinters,
  openBridgePrinterPreferences,
  openBridgePrintQueue,
  printBridgeDirect,
} from '@/lib/print-bridge-client';

export default function QuickPrintOverlay({ designPdfMatches = {}, onClose }) {
  const [bridgeState, setBridgeState] = useState('idle'); // idle | connecting | connected | offline
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [search, setSearch] = useState('');
  const [qtyMap, setQtyMap] = useState({});
  const [printingMap, setPrintingMap] = useState({});
  const searchRef = useRef(null);

  const { url: bridgeUrl, token: bridgeToken } = getStoredBridgeConfig?.() || { url: 'http://127.0.0.1:17389', token: '' };

  // Auto-connect on mount
  useEffect(() => {
    if (!bridgeToken) return;
    setBridgeState('connecting');
    getBridgeHealth(bridgeUrl).then(() => {
      setBridgeState('connected');
      getBridgePrinters(bridgeUrl, bridgeToken).then(data => {
        const list = data?.printers || [];
        setPrinters(list);
        const target = list.find(p => p.isTargetL8050) || list.find(p => p.isDefault) || list[0];
        if (target) setSelectedPrinter(target.name);
      }).catch(() => {});
    }).catch(() => setBridgeState('offline'));
  }, []);

  // Focus search on open
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Escape closes overlay
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const effectivePrinter = selectedPrinter;

  // Build unique PDF list from designPdfMatches
  const uniqueMap = {};
  Object.values(designPdfMatches || {}).forEach(m => {
    if (m.found && m.relativePath && !uniqueMap[m.relativePath]) uniqueMap[m.relativePath] = m;
  });
  const allPdfs = Object.values(uniqueMap).sort((a, b) => {
    const na = a.fileName || a.name || '', nb = b.fileName || b.name || '';
    const ia = parseInt(na, 10), ib = parseInt(nb, 10);
    if (!isNaN(ia) && !isNaN(ib)) return ia - ib;
    return na.localeCompare(nb, 'es', { sensitivity: 'base' });
  });
  const q = search.toLowerCase();
  const visiblePdfs = q ? allPdfs.filter(p => (p.fileName || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)) : allPdfs;

  async function handlePrint(pdf) {
    const key = pdf.relativePath;
    if (printingMap[key]) return;
    setPrintingMap(prev => ({ ...prev, [key]: true }));
    try {
      await printBridgeDirect(bridgeUrl, bridgeToken, {
        rootName: pdf.rootName,
        relativePath: pdf.relativePath,
        printerName: effectivePrinter,
        copies: qtyMap[key] ?? 1,
      });
    } catch {}
    finally { setPrintingMap(prev => ({ ...prev, [key]: false })); }
  }

  const connected = bridgeState === 'connected';

  const statusInfo = {
    idle:       { bg: '#f8faff', border: '#dde1ef', color: '#5a6380', label: 'Sin verificar' },
    connecting: { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', label: 'Conectando...' },
    connected:  { bg: '#e8f7ef', border: '#b7ebcf', color: '#15803d', label: 'Conectado' },
    offline:    { bg: '#fff5f5', border: '#fecaca', color: '#b91c1c', label: 'No detectado' },
  }[bridgeState];

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(27,47,94,0.25)', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', padding: '88px 12px 12px' }}>

      <div style={{ width: 320, maxHeight: 'calc(100vh - 100px)', background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', boxShadow: '0 8px 32px rgba(27,47,94,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '10px 12px', borderBottom: '1.5px solid #f0f2f8', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#1B2F5E', flex: 1 }}>Impresión rápida</span>
          <span style={{ background: statusInfo.bg, color: statusInfo.color, border: `1px solid ${statusInfo.border}`, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 900 }}>{statusInfo.label}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#9aa3bc', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Local print controls */}
        {connected && printers.length > 0 && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 2 }}>Impresión local</span>
            <select value={selectedPrinter} onChange={e => setSelectedPrinter(e.target.value)}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 6px', fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flex: 1, minWidth: 0 }}>
              {printers.map(p => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}
            </select>
            <button onClick={() => openBridgePrinterPreferences(bridgeUrl, bridgeToken, effectivePrinter).catch(() => {})}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}>
              Preferencias
            </button>
            <button onClick={() => openBridgePrintQueue(bridgeUrl, bridgeToken, effectivePrinter).catch(() => {})}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}>
              Cola de impresión
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f2f8', flexShrink: 0 }}>
          <input ref={searchRef} type="text" placeholder="Buscar diseño..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '5px 9px', fontSize: 12, border: '1.5px solid #dde1ef', borderRadius: 7, fontFamily: 'Barlow, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
          {allPdfs.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 36px 52px', gap: 3, marginTop: 5, padding: '0 2px' }}>
              <span /><span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Diseño</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', textAlign: 'center' }}>x</span>
              <span />
            </div>
          )}
        </div>

        {/* PDF list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {allPdfs.length === 0 && (
            <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '24px 12px', lineHeight: 1.5 }}>
              Sin PDFs vinculados.<br />Escaneá en la pestaña Diseños.
            </p>
          )}
          {!connected && allPdfs.length > 0 && (
            <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '16px 12px' }}>
              {bridgeState === 'offline' ? 'Bridge no detectado.' : 'Verificando bridge...'}<br />
              <span style={{ fontSize: 10 }}>Configuralo en la pestaña Producción.</span>
            </p>
          )}
          {connected && visiblePdfs.length === 0 && allPdfs.length > 0 && (
            <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '14px 8px' }}>Sin resultados</p>
          )}
          {connected && visiblePdfs.map(pdf => {
            const key = pdf.relativePath;
            const qty = qtyMap[key] ?? 1;
            const printing = printingMap[key] ?? false;
            const label = (pdf.fileName || pdf.name || '').replace(/\.pdf$/i, '');
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 36px 52px', gap: 3, padding: '4px 12px', borderBottom: '1px solid #f0f2f8', alignItems: 'center' }}>
                <DesignThumb designId={String(pdf.id || '')} name={pdf.name} size={22} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={pdf.fileName}>{label}</span>
                <input type="number" min={1} max={99} value={qty}
                  onChange={e => setQtyMap(prev => ({ ...prev, [key]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => { if (e.key === 'Enter') handlePrint(pdf); }}
                  style={{ width: '100%', textAlign: 'center', padding: '3px 1px', border: '1.5px solid #dde1ef', borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', minWidth: 0 }} />
                <button onClick={() => handlePrint(pdf)} disabled={printing}
                  style={{ border: 'none', borderRadius: 6, padding: '4px 0', background: printing ? '#e8f7ef' : '#2D6BE4', color: printing ? '#18a36a' : 'white', fontSize: 10, fontWeight: 900, cursor: printing ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  {printing ? '...' : (
                    <>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" />
                      </svg>
                      Impr.
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '6px 12px', borderTop: '1px solid #f0f2f8', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#c0c5d4' }}>Alt+P para cerrar · ESC para cerrar</span>
        </div>
      </div>
    </div>
  );
}
