'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import DesignThumb from '@/components/DesignThumb';
import { useDesigns } from '@/contexts/DesignsContext';
import { fuzzyMatchDesigns, scoreColor, scoreBg } from '@/lib/fuzzy-match';
import PrintQueueOverlay from '@/components/PrintQueueOverlay';
import {
  DEFAULT_BRIDGE_URL,
  getStoredBridgeConfig,
  saveStoredBridgeConfig,
  getBridgeHealth,
  getBridgePrinters,
  readBridgeDevMode,
  openBridgePrinterPreferences,
  openBridgePrintQueue,
  addBridgePdfRoot,
  scanBridgePdfs,
  matchBridgeDesignPdfs,
  printBridgeJob,

  printBridgeDirect,
  getBridgePrintQueue,
  cancelBridgePrintJob,
  getDevModeProfiles,
  saveDevModeProfile,
  applyDevModeProfile,
  deleteDevModeProfile,
} from '../lib/print-bridge-client';

const STATUS_CYCLE = ['pending', 'in_press', 'done'];
const STATUS_LABEL = { pending: 'Pendiente', in_press: 'En proceso', done: 'Terminado' };
const STATUS_COLOR = { pending: '#f6a800', in_press: '#2D6BE4', done: '#18a36a' };

const ORDER_STATUS_LABEL = { pending: 'Pendiente', confirmed: 'Confirmado', in_production: 'En producción', ready: 'Listo', cancelled: 'Cancelado' };
const ORDER_STATUS_COLOR = { pending: '#f6a800', confirmed: '#2D6BE4', in_production: '#6d28d9', ready: '#18a36a', cancelled: '#e53e3e' };
const DASH = '—';
const DEFAULT_SORT_ORDER = { in_press: 0, pending: 1, done: 2 };
const SORT_LABEL = { design: 'Diseño', product: 'Producto', demand: 'Demanda', stock: 'Stock', falta: 'Falta', status: 'Estado', note: 'Nota', orders: 'Pedidos' };
const REPORT_COLUMNS = [
  { key: 'design', label: 'Diseño', width: 22, align: 'left', value: row => row.designName },
  { key: 'product', label: 'Producto', width: 18, align: 'left', value: row => row.productName },
  { key: 'demand', label: 'Demanda', width: 8, align: 'right', value: row => row.demand },
  { key: 'stock', label: 'Stock', width: 7, align: 'right', value: row => row.qty_produced },
  { key: 'falta', label: 'Falta', width: 7, align: 'right', value: row => row.falta },
  { key: 'status', label: 'Estado', width: 12, align: 'left', value: row => STATUS_LABEL[row.status] || row.status },
  { key: 'note', label: 'Nota', width: 18, align: 'left', value: row => row.note || DASH },
  { key: 'orders', label: 'Pedidos', width: 8, align: 'right', value: row => row.orders.length },
];
const DEFAULT_REPORT_COLUMNS = ['design', 'demand', 'stock', 'falta', 'status'];
const PRODUCTION_SUBTAB_LABELS = {
  produce: 'Producir',
  orders: 'Pedidos',
  stock: 'Stock',
  log: 'Historial',
  operators: 'Operarios',
};

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function toQty(value) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function formatProductionError(error, fallback) {
  const msg = error?.message || String(error || '');
  if (msg.toLowerCase().includes('row-level security')) {
    return 'Faltan permisos de Supabase para producción. Aplicá el SQL de políticas y volvé a intentar.';
  }
  return fallback;
}

function formatDate(iso) {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isUrgent(ordersForDesign) {
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return ordersForDesign.some(o => o.status === 'pending' && new Date(o.created_at).getTime() < threeDaysAgo);
}

function compareValues(a, b) {
  if (typeof a === 'number' || typeof b === 'number') return (Number(a) || 0) - (Number(b) || 0);
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function stockInputValue(qty) {
  return qty === 0 ? '' : String(qty);
}

function getItemDesignKey(item) {
  return String(item?.design_id || item?.designId || item?.id || item?.name || '').trim();
}

function getOrderProductionItems(order) {
  const byKey = {};
  (Array.isArray(order?.items) ? order.items : []).forEach(item => {
    const key = getItemDesignKey(item);
    if (!key) return;
    if (!byKey[key]) {
      byKey[key] = {
        id: null,
        order_id: order.id,
        order_code: order.order_code,
        order_created_at: order.created_at,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        seller_id: order.seller_id,
        design_key: key,
        design_id: item.design_id || item.designId || item.id || null,
        design_name: String(item.name || '').trim() || 'Sin nombre',
        product_id: item.product_id || null,
        product_name: item.productName || item.product_name || 'Sin producto',
        required_qty: 0,
        produced_qty: 0,
        waste_qty: 0,
        note: '',
        operator_id: null,
      };
    }
    byKey[key].required_qty += toQty(item.qty);
  });
  return Object.values(byKey);
}

function getProductionStatus(items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) return 'pending';
  const requiredRows = rows.filter(row => toQty(row.required_qty) > 0);
  if (requiredRows.length === 0) return 'pending';
  const producedTotal = requiredRows.reduce((sum, row) => sum + toQty(row.produced_qty), 0);
  if (producedTotal <= 0) return 'pending';
  const complete = requiredRows.every(row => toQty(row.produced_qty) >= toQty(row.required_qty));
  return complete ? 'done' : 'in_press';
}

function summarizeOrderProducts(items) {
  const grouped = {};
  (Array.isArray(items) ? items : []).forEach(item => {
    const product = item.productName || item.product_name || 'Sin producto';
    grouped[product] = (grouped[product] || 0) + toQty(item.qty || item.required_qty);
  });
  const text = Object.entries(grouped).map(([product, qty]) => `${product} x${qty}`).join(', ');
  return text || DASH;
}

function formatShortDate(iso) {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fitReportValue(value, width, align = 'left') {
  const text = String(value ?? DASH).replace(/\s+/g, ' ').trim() || DASH;
  const clipped = text.length > width ? text.slice(0, Math.max(0, width - 1)) + '…' : text;
  return align === 'right' ? clipped.padStart(width) : clipped.padEnd(width);
}

function NoteCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.note || '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setVal(row.note || ''); }, [row.note]);

  const handleSave = async (v) => {
    if (saving) return;
    setEditing(false);
    setSaving(true);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      setVal(row.note || '');
      alert(formatProductionError(error, `No se pudo guardar la nota: ${error.message || error}`));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ color: saved ? '#18a36a' : val ? '#2d3352' : '#c4c9d9', cursor: 'text', fontSize: 12, display: 'block', width: 140, maxWidth: 140, minHeight: 22, padding: '3px 6px', borderRadius: 4, border: `1.5px solid ${saved ? '#18a36a' : 'transparent'}`, transition: 'color 0.3s, border-color 0.3s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' }}
        title="Click para editar"
      >
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : val || 'Agregar nota...'}
      </span>
    );
  }
  return (
    <input
      autoFocus value={val} onChange={e => setVal(e.target.value)}
      disabled={saving}
      onBlur={() => handleSave(val)}
      onKeyDown={e => { if (e.key === 'Enter') handleSave(val); if (e.key === 'Escape') { setEditing(false); setVal(row.note || ''); } }}
      style={{ border: '1.5px solid #2D6BE4', borderRadius: 6, padding: '3px 6px', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#2d3352', width: 140, maxWidth: 140, outline: 'none', boxSizing: 'border-box' }}
    />
  );
}

// FIX: StockCell ahora recibe qty_produced como prop separada para evitar que el re-render
// resetee el input mientras el usuario todavía está editando.
// El truco es: si está editando, no sincronizamos desde afuera.
function StockCell({ qtyProduced, onSave }) {
  const [val, setVal] = useState(stockInputValue(qtyProduced));
  const editingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const latestQtyRef = useRef(qtyProduced);
  const onSaveRef = useRef(onSave);
  const savingRef = useRef(false);
  const queuedQtyRef = useRef(null);

  // FIX: Solo sincronizar el valor desde afuera cuando NO estamos editando
  useEffect(() => {
    latestQtyRef.current = qtyProduced;
    if (!editingRef.current) {
      setVal(stockInputValue(qtyProduced));
    }
  }, [qtyProduced]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const saveQty = async (qty) => {
    if (qty === latestQtyRef.current) return;
    if (savingRef.current) {
      queuedQtyRef.current = qty;
      return;
    }

    savingRef.current = true;
    let targetQty = qty;
    try {
      while (targetQty !== null) {
        if (targetQty !== latestQtyRef.current) {
          await onSaveRef.current(targetQty);
          latestQtyRef.current = targetQty;
        }
        targetQty = queuedQtyRef.current;
        queuedQtyRef.current = null;
      }
    } catch (error) {
      queuedQtyRef.current = null;
      setVal(stockInputValue(latestQtyRef.current));
      alert(formatProductionError(error, `No se pudo actualizar el stock: ${error.message || error}`));
    } finally {
      savingRef.current = false;
    }
  };

  const scheduleSave = (qty) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveQty(qty);
    }, 300);
  };

  const handleSave = () => {
    editingRef.current = false;
    const qty = val === '' ? 0 : Number(val);
    if (!Number.isInteger(qty) || qty < 0) {
      setVal(stockInputValue(latestQtyRef.current));
      return;
    }
    setVal(stockInputValue(qty));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    saveQty(qty);
  };

  const adjust = (delta) => {
    const currentQty = val === '' ? 0 : Number(val);
    const baseQty = Number.isInteger(currentQty) && currentQty >= 0 ? currentQty : latestQtyRef.current;
    const nextQty = Math.max(0, baseQty + delta);
    if (nextQty === baseQty) return;
    editingRef.current = false;
    setVal(stockInputValue(nextQty));
    scheduleSave(nextQty);
  };

  const handleFocus = (e) => {
    e.stopPropagation();
    editingRef.current = true;
    e.target.select();
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, width: 90 }}>
      <button
        type="button"
        onClick={() => adjust(-1)}
        disabled={(val === '' ? 0 : Number(val)) <= 0}
        title="Restar 1"
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #fecaca', background: (val === '' ? 0 : Number(val)) <= 0 ? '#f7f8fc' : '#fef2f2', color: (val === '' ? 0 : Number(val)) <= 0 ? '#c4c9d9' : '#e53e3e', fontSize: 14, fontWeight: 800, lineHeight: 1, cursor: (val === '' ? 0 : Number(val)) <= 0 ? 'not-allowed' : 'pointer' }}
      >
        -
      </button>
      <input
        type="number"
        min="0"
        step="1"
        value={val}
        placeholder="0"
        onFocus={handleFocus}
        onChange={e => setVal(e.target.value)}
        onBlur={handleSave}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { editingRef.current = false; setVal(stockInputValue(latestQtyRef.current)); e.currentTarget.blur(); }
        }}
        style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 4px', fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 700, color: '#2d3352', width: 44, textAlign: 'center', outline: 'none', boxSizing: 'border-box', background: 'white' }}
      />
      <button
        type="button"
        onClick={() => adjust(1)}
        title="Sumar 1"
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#18a36a', fontSize: 14, fontWeight: 800, lineHeight: 1, cursor: 'pointer' }}
      >
        +
      </button>
    </div>
  );
}

function SortFilterHeader({ label, filter, active, align = 'left', sortKey, sortRules = [], onToggleSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sortIndex = sortRules.findIndex(rule => rule.key === sortKey);
  const sortRule = sortIndex >= 0 ? sortRules[sortIndex] : null;
  const hasFilter = Boolean(filter);
  const isActive = Boolean(active || sortRule);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <th ref={ref} style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, textAlign: align, color: isActive ? '#2D6BE4' : '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap', background: 'white', position: 'relative', zIndex: open ? 50 : 'auto', userSelect: 'none' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: 4, width: '100%' }}>
        <span>{label}</span>
        {hasFilter && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            title="Filtrar"
            aria-label={`Filtrar por ${label}`}
            style={{ border: `1.5px solid ${active ? '#2D6BE4' : '#dde1ef'}`, background: active ? '#e8eef9' : 'white', color: active ? '#2D6BE4' : '#5a6380', borderRadius: 5, padding: '1px 5px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4, minWidth: 22 }}
          >
            {active ? 'F*' : 'F'}
          </button>
        )}
        {sortKey && (
          <button
            type="button"
            onClick={() => onToggleSort(sortKey)}
            title={sortRule ? `Orden ${sortRule.dir === 'asc' ? 'ascendente' : 'descendente'} (${sortIndex + 1})` : 'Ordenar'}
            aria-label={sortRule ? `Ordenar ${label} ${sortRule.dir === 'asc' ? 'descendente' : 'sin orden'}` : `Ordenar ${label} ascendente`}
            style={{ border: `1.5px solid ${sortRule ? '#2D6BE4' : '#dde1ef'}`, background: sortRule ? '#e8eef9' : 'white', color: sortRule ? '#2D6BE4' : '#5a6380', borderRadius: 5, padding: '1px 5px', fontSize: 10, fontWeight: 800, cursor: 'pointer', lineHeight: 1.4, minWidth: 28 }}
          >
            {sortRule ? `${sortIndex + 1}${sortRule.dir === 'asc' ? '↑' : '↓'}` : '↕'}
          </button>
        )}
      </div>
      {open && hasFilter && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, zIndex: 200, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 7, padding: 5, width: 168, boxShadow: '0 4px 16px rgba(27,47,94,0.16)', textTransform: 'none', letterSpacing: 0 }} onClick={e => e.stopPropagation()}>
          {filter}
        </div>
      )}
    </th>
  );
}

export default function ProductionTab({
  supabase,
  sellers = [],
  products = [],
  orders = [],
  operators = [],
  activeSubtab,
  selectedOrderId,
  onChangeSubtab,
  onSelectOrder,
  renderOrdersPanel,
  renderOperatorsPanel,
  designPdfMatches = {},
}) {
  const [internalActiveSubTab, setInternalActiveSubTab] = useState('produce');
  const activeSubTab = activeSubtab || internalActiveSubTab;
  const changeSubTab = (id) => {
    setInternalActiveSubTab(id);
    onChangeSubtab?.(id);
  };
  const [internalSelectedOrderId, setInternalSelectedOrderId] = useState('');
  const selectedProductionOrderId = selectedOrderId ?? internalSelectedOrderId;
  const selectProductionOrder = (id) => {
    setInternalSelectedOrderId(id);
    onSelectOrder?.(id);
  };

  const { designs: ctxDesigns } = useDesigns();
  const [manualItemLinks, setManualItemLinks] = useState({}); // { "orderId:idx": { design, score } | null }

  // Filtros — FIX: filterDesign separado de filterSearch (cliente)
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterOrderStatus, setFilterOrderStatus] = useState('all');   // estado del pedido
  const [filterProdStatus, setFilterProdStatus] = useState('all');     // estado de producción — FIX: antes no existía
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');   // busca por cliente/email
  const [filterDesign, setFilterDesign] = useState('');   // FIX: filtro de diseño separado
  const [sortRules, setSortRules] = useState([]);
  const [reportColumns, setReportColumns] = useState(DEFAULT_REPORT_COLUMNS);
  const [showTextReport, setShowTextReport] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [operatorLinkFeedback, setOperatorLinkFeedback] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState({ state: 'idle', message: 'Sin verificar', health: null });
  const hasScannedOnBridgeConnectRef = useRef(false);
  const [quickPrintSearch, setQuickPrintSearch] = useState('');

  const [quickPrintQtyMap, setQuickPrintQtyMap] = useState({});
  const [quickPrintingMap, setQuickPrintingMap] = useState({});
  const [bridgePrinters, setBridgePrinters] = useState([]);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeDevMode, setBridgeDevMode] = useState(null);
  const [orderPdfBusy, setOrderPdfBusy] = useState(false);
  const [orderPdfMatches, setOrderPdfMatches] = useState({});
  const [orderPdfStatus, setOrderPdfStatus] = useState({ state: 'idle', message: 'PDFs sin verificar', roots: [] });
  const [printingTasks, setPrintingTasks] = useState({});
  const [printQtyOverrides, setPrintQtyOverrides] = useState({});
  const [printQueueOpen, setPrintQueueOpen] = useState(false);
  const [selectedPrinterOverride, setSelectedPrinterOverride] = useState('');
  const [printFeedback, setPrintFeedback] = useState({});
  const [printQueue, setPrintQueue] = useState(null);
  const [devModeProfiles, setDevModeProfiles] = useState([]);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState('');

  // Datos
  const [stock, setStock] = useState([]);
  const [prodStatus, setProdStatus] = useState([]);
  const [stockLog, setStockLog] = useState([]);
  const [productionTasks, setProductionTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [savingTaskIds, setSavingTaskIds] = useState({});
  const [syncingOrderIds, setSyncingOrderIds] = useState({});
  const [printHistory, setPrintHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('inkora_print_history') || '[]'); } catch { return []; }
  });
  const [logSubTab, setLogSubTab] = useState('stock');

  // UI
  const [expandedRow, setExpandedRow] = useState(null);
  const [savingStatus, setSavingStatus] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const stored = getStoredBridgeConfig();
    const url = stored.url || DEFAULT_BRIDGE_URL;
    const token = stored.token || '';
    setBridgeUrl(url);
    setBridgeToken(token);
    if (token) {
      // Auto-connect bridge on mount (launch if not running)
      autoInitBridge(url, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSort(key) {
    setSortRules(prev => {
      const idx = prev.findIndex(rule => rule.key === key);
      if (idx === -1) return [...prev, { key, dir: 'asc' }];
      if (prev[idx].dir === 'asc') return prev.map((rule, i) => i === idx ? { ...rule, dir: 'desc' } : rule);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function toggleReportColumn(key) {
    setReportColumns(prev => {
      if (prev.includes(key)) return prev.length > 1 ? prev.filter(col => col !== key) : prev;
      return REPORT_COLUMNS.filter(col => prev.includes(col.key) || col.key === key).map(col => col.key);
    });
  }

  async function checkPrintBridge({ includePrinters = true, overrideUrl, overrideToken } = {}) {
    const url = overrideUrl !== undefined ? overrideUrl : bridgeUrl;
    const token = overrideToken !== undefined ? overrideToken : bridgeToken;
    setBridgeBusy(true);
    setBridgeDevMode(null);
    try {
      saveStoredBridgeConfig({ url, token });
      const health = await getBridgeHealth(url);
      let printers = bridgePrinters;
      let message = 'Bridge conectado';

      if (includePrinters) {
        if (!token.trim()) {
          setBridgePrinters([]);
          setBridgeStatus({ state: 'token', message: 'Bridge conectado. Pegue el token para leer impresoras.', health });
          return;
        }

        const printerPayload = await getBridgePrinters(url, token.trim());
        printers = Array.isArray(printerPayload?.printers) ? printerPayload.printers : [];
        setBridgePrinters(printers);
        const target = printers.find(printer => printer.isTargetL8050);
        message = target ? `Bridge conectado: ${target.name}` : 'Bridge conectado. No detecto L8050 por nombre.';
      }

      setBridgeStatus({ state: 'connected', message, health });
    } catch (error) {
      const tokenMessage = error?.status === 401 ? 'Token Bridge incorrecto o faltante.' : '';
      setBridgePrinters([]);
      setBridgeStatus({
        state: error?.status === 401 ? 'token' : 'offline',
        message: tokenMessage || `No se pudo conectar al Bridge: ${error.message || error}`,
        health: null,
      });
    } finally {
      setBridgeBusy(false);
    }
  }

  async function autoInitBridge(url, token) {
    if (!token) return;
    try {
      await getBridgeHealth(url);
    } catch {
      // Bridge not running — launch via URI scheme and poll
      try {
        const a = document.createElement('a');
        a.href = 'inkora-bridge://start';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {}
      let retries = 0;
      await new Promise(resolve => {
        const poll = setInterval(async () => {
          retries++;
          try {
            await getBridgeHealth(url);
            clearInterval(poll);
            resolve();
          } catch {
            if (retries >= 12) { clearInterval(poll); resolve(); }
          }
        }, 1500);
      });
    }
    await checkPrintBridge({ includePrinters: true, overrideUrl: url, overrideToken: token });
  }

  async function inspectBridgeDevMode() {
    const printer = bridgePrinters.find(item => item.isTargetL8050) || bridgePrinters.find(item => item.isDefault) || bridgePrinters[0];
    if (!printer) {
      setBridgeStatus(prev => ({ ...prev, state: 'token', message: 'Primero detecta impresoras del Bridge.' }));
      return;
    }

    setBridgeBusy(true);
    try {
      const payload = await readBridgeDevMode(bridgeUrl, bridgeToken.trim(), printer.name);
      setBridgeDevMode(payload?.devMode || null);
      setBridgeStatus(prev => ({ ...prev, state: 'connected', message: `DEVMODE leido: ${printer.name}` }));
    } catch (error) {
      setBridgeStatus(prev => ({ ...prev, state: 'offline', message: `No se pudo leer DEVMODE: ${error.message || error}` }));
    } finally {
      setBridgeBusy(false);
    }
  }

  async function openBridgePreferences() {
    const printer = bridgePrinters.find(item => item.isTargetL8050) || bridgePrinters.find(item => item.isDefault) || bridgePrinters[0];
    if (!printer) {
      setBridgeStatus(prev => ({ ...prev, state: 'token', message: 'Primero detecta impresoras del Bridge.' }));
      return;
    }

    setBridgeBusy(true);
    try {
      await openBridgePrinterPreferences(bridgeUrl, bridgeToken.trim(), printer.name);
      setBridgeStatus(prev => ({ ...prev, state: 'connected', message: `Preferencias abiertas: ${printer.name}` }));
    } catch (error) {
      setBridgeStatus(prev => ({ ...prev, state: 'offline', message: `No se pudieron abrir preferencias: ${error.message || error}` }));
    } finally {
      setBridgeBusy(false);
    }
  }

  async function matchSelectedOrderPdfs({ scan = false } = {}) {
    if (!selectedOrderRow || selectedOrderTasks.length === 0) {
      setOrderPdfStatus({ state: 'idle', message: 'Selecciona un pedido con diseños.', roots: orderPdfStatus.roots || [] });
      return;
    }

    const token = bridgeToken.trim();
    if (!token) {
      setOrderPdfStatus({ state: 'token', message: 'Pegá el token Bridge para consultar PDFs.', roots: orderPdfStatus.roots || [] });
      return;
    }

    const candidates = selectedOrderTasks.map(task => ({
      id: String(task.design_id || task.design_key || task.design_name || ''),
      name: task.design_name || '',
      productName: task.product_name || '',
    }));

    setOrderPdfBusy(true);
    try {
      saveStoredBridgeConfig({ url: bridgeUrl, token });
      if (scan) await scanBridgePdfs(bridgeUrl, token);
      const payload = await matchBridgeDesignPdfs(bridgeUrl, token, candidates);
      const nextMatches = {};
      (payload.matches || []).forEach(match => {
        nextMatches[match.id] = match;
      });
      setOrderPdfMatches(nextMatches);
      setOrderPdfStatus({
        state: 'ready',
        message: `PDFs del pedido: ${payload.found || 0}/${candidates.length}`,
        roots: payload.roots || orderPdfStatus.roots || [],
      });
    } catch (error) {
      setOrderPdfStatus({
        state: error?.status === 401 ? 'token' : 'error',
        message: error?.status === 401 ? 'Token Bridge incorrecto.' : `No se pudieron consultar PDFs: ${error.message || error}`,
        roots: orderPdfStatus.roots || [],
      });
    } finally {
      setOrderPdfBusy(false);
    }
  }

  async function addPdfRootFromProduction() {
    const token = bridgeToken.trim();
    if (!token) {
      setOrderPdfStatus({ state: 'token', message: 'Pegá el token Bridge para agregar carpetas PDF.', roots: orderPdfStatus.roots || [] });
      return;
    }

    setBridgeBusy(true);
    try {
      saveStoredBridgeConfig({ url: bridgeUrl, token });
      const payload = await addBridgePdfRoot(bridgeUrl, token);
      setOrderPdfStatus({ state: 'ready', message: `Carpetas PDF autorizadas: ${(payload.roots || []).length}`, roots: payload.roots || [] });
    } catch (error) {
      setOrderPdfStatus({
        state: error?.status === 401 ? 'token' : 'error',
        message: error?.status === 401 ? 'Token Bridge incorrecto.' : `No se pudo abrir carpeta PDF: ${error.message || error}`,
        roots: orderPdfStatus.roots || [],
      });
    } finally {
      setBridgeBusy(false);
    }
  }

  function addPrintHistory(entry) {
    setPrintHistory(prev => {
      const next = [{ ...entry, id: Date.now() + Math.random() }, ...prev].slice(0, 200);
      try { localStorage.setItem('inkora_print_history', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function handleQuickPrint(pdf) {
    const key = pdf.relativePath;
    if (quickPrintingMap[key]) return;
    const copies = quickPrintQtyMap[key] ?? 1;
    setQuickPrintingMap(prev => ({ ...prev, [key]: true }));
    try {
      const result = await printBridgeDirect(bridgeUrl, bridgeToken.trim(), {
        rootName: pdf.rootName,
        relativePath: pdf.relativePath,
        printerName: effectivePrinterName,
        copies,
      });
      addPrintHistory({
        fecha: new Date().toISOString(),
        diseno: pdf.fileName || pdf.name || pdf.relativePath,
        copias: copies,
        hojas: result?.job?.pagesPrinted ?? null,
        impresora: effectivePrinterName,
        estado: result?.job?.status || 'done',
      });
    } catch (err) {
      console.error('Quick print error:', err);
      addPrintHistory({
        fecha: new Date().toISOString(),
        diseno: pdf.fileName || pdf.name || pdf.relativePath,
        copias: copies,
        hojas: null,
        impresora: effectivePrinterName,
        estado: 'error',
      });
    } finally {
      setQuickPrintingMap(prev => ({ ...prev, [key]: false }));
    }
  }

  async function printSingleTask(task, customSheets = null) {
    const pdfKey = String(task.design_id || task.design_key || task.design_name || '');
    const pdfMatch = orderPdfMatches[pdfKey];
    if (!pdfMatch?.found) return;

    const token = bridgeToken.trim();
    if (!token) return;

    const remaining = Math.max(1, toQty(task.required_qty) - toQty(task.produced_qty));
    const sheets = customSheets ?? Math.ceil(remaining / 2);
    const taskId = task.id || pdfKey;
    setPrintingTasks(prev => ({ ...prev, [taskId]: true }));
    setPrintFeedback(prev => ({ ...prev, [taskId]: '' }));

    try {
      saveStoredBridgeConfig({ url: bridgeUrl, token });
      const result = await printBridgeJob(bridgeUrl, token, {
        designId: String(task.design_id || task.design_key || ''),
        designName: task.design_name || '',
        productName: task.product_name || '',
        printerName: effectivePrinterName,
        copies: sheets,
        orderId: selectedOrder?.id || '',
        orderCode: selectedOrder?.order_code || '',
      });
      const status = result?.job?.status || 'done';
      setPrintFeedback(prev => ({
        ...prev,
        [taskId]: status === 'done' ? 'Enviado' : status === 'error' ? (result?.job?.error || 'Error') : status
      }));
      addPrintHistory({
        fecha: new Date().toISOString(),
        diseno: task.design_name || '',
        copias: sheets,
        hojas: result?.job?.pagesPrinted ?? null,
        impresora: effectivePrinterName,
        estado: status,
      });
      setTimeout(() => setPrintFeedback(prev => ({ ...prev, [taskId]: '' })), 3000);
    } catch (error) {
      setPrintFeedback(prev => ({ ...prev, [taskId]: error?.message || 'Error' }));
      addPrintHistory({
        fecha: new Date().toISOString(),
        diseno: task.design_name || '',
        copias: sheets,
        hojas: null,
        impresora: effectivePrinterName,
        estado: 'error',
      });
      setTimeout(() => setPrintFeedback(prev => ({ ...prev, [taskId]: '' })), 4000);
    } finally {
      setPrintingTasks(prev => ({ ...prev, [taskId]: false }));
    }
  }

  async function printAllOrderTasks() {
    if (!selectedOrder || selectedOrderTasks.length === 0) return;
    const token = bridgeToken.trim();
    if (!token) return;

    const printable = selectedOrderTasks.filter(task => {
      const pdfKey = String(task.design_id || task.design_key || task.design_name || '');
      return orderPdfMatches[pdfKey]?.found;
    });

    if (printable.length === 0) return;
    for (const task of printable) {
      await printSingleTask(task);
    }
  }

  async function loadPrintQueue() {
    const token = bridgeToken.trim();
    if (!token) return;
    try {
      const result = await getBridgePrintQueue(bridgeUrl, token);
      setPrintQueue(result?.queue || null);
    } catch {
      setPrintQueue(null);
    }
  }

  async function loadDevModeProfilesForPrinter(printer) {
    const token = bridgeToken.trim();
    if (!token || !printer?.name) return;
    try {
      const result = await getDevModeProfiles(bridgeUrl, token, printer.name);
      setDevModeProfiles(Array.isArray(result?.profiles) ? result.profiles : []);
    } catch {
      setDevModeProfiles([]);
    }
  }

  async function saveCurrentAsProfile() {
    const token = bridgeToken.trim();
    if (!token || !bridgeTargetPrinter || !profileNameInput.trim()) return;
    setProfileBusy(true);
    setProfileFeedback('');
    try {
      await saveDevModeProfile(bridgeUrl, token, bridgeTargetPrinter.name, profileNameInput.trim());
      setProfileFeedback('Perfil guardado');
      await loadDevModeProfilesForPrinter(bridgeTargetPrinter);
      setSelectedProfileName(profileNameInput.trim());
      setProfileNameInput('');
    } catch (error) {
      setProfileFeedback(error?.message || 'Error guardando perfil');
    } finally {
      setProfileBusy(false);
      setTimeout(() => setProfileFeedback(''), 3000);
    }
  }

  async function applySelectedProfile() {
    const token = bridgeToken.trim();
    if (!token || !bridgeTargetPrinter || !selectedProfileName) return;
    setProfileBusy(true);
    setProfileFeedback('');
    try {
      await applyDevModeProfile(bridgeUrl, token, bridgeTargetPrinter.name, selectedProfileName);
      setProfileFeedback('Perfil aplicado');
    } catch (error) {
      setProfileFeedback(error?.message || 'Error aplicando perfil');
    } finally {
      setProfileBusy(false);
      setTimeout(() => setProfileFeedback(''), 3000);
    }
  }

  async function deleteSelectedProfile() {
    const token = bridgeToken.trim();
    if (!token || !bridgeTargetPrinter || !selectedProfileName) return;
    setProfileBusy(true);
    setProfileFeedback('');
    try {
      await deleteDevModeProfile(bridgeUrl, token, bridgeTargetPrinter.name, selectedProfileName);
      setProfileFeedback('Perfil eliminado');
      await loadDevModeProfilesForPrinter(bridgeTargetPrinter);
      setSelectedProfileName('');
    } catch (error) {
      setProfileFeedback(error?.message || 'Error eliminando perfil');
    } finally {
      setProfileBusy(false);
      setTimeout(() => setProfileFeedback(''), 3000);
    }
  }

  const loadStock = useCallback(async () => {
    const { data, error } = await supabase.from('production_stock').select('*');
    if (error) {
      console.error('Error loading production stock', error);
      setErrorMessage('No se pudo cargar el stock de producción.');
      return;
    }
    setStock(data || []);
  }, [supabase]);

  const loadProdStatus = useCallback(async () => {
    const { data, error } = await supabase.from('production_status').select('*');
    if (error) {
      console.error('Error loading production status', error);
      setErrorMessage('No se pudieron cargar los estados de producción.');
      return;
    }
    setProdStatus(data || []);
  }, [supabase]);

  const loadStockLog = useCallback(async () => {
    const { data, error } = await supabase.from('production_stock_log').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) {
      console.error('Error loading production stock log', error);
      setErrorMessage('No se pudo cargar el historial de stock.');
      return;
    }
    setStockLog(data || []);
  }, [supabase]);

  const loadProductionTasks = useCallback(async () => {
    setLoadingTasks(true);
    const { data, error } = await supabase.rpc('get_operator_production_tasks');
    if (error) {
      console.error('Error loading production tasks', error);
      const missing = error.code === '42883' || error.code === '42P01' || /production_order_tasks|production_operators|get_operator_production_tasks/i.test(error.message || '');
      setErrorMessage(missing
        ? 'Falta ejecutar sql/production_orders_and_operators.sql en Supabase para activar Producir.'
        : 'No se pudieron cargar las tareas de produccion.'
      );
      setProductionTasks([]);
      setLoadingTasks(false);
      return;
    }
    setProductionTasks((data || []).map(task => ({
      ...task,
      id: task.id || task.task_id,
      note: task.note ?? task.task_note ?? '',
    })));
    setLoadingTasks(false);
  }, [supabase]);

  useEffect(() => {
    loadStock();
    loadProdStatus();
    loadStockLog();
    loadProductionTasks();

    const stockSub = supabase.channel('production-stock-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock' }, () => loadStock())
      .subscribe();
    const statusSub = supabase.channel('production-status-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_status' }, () => loadProdStatus())
      .subscribe();
    const logSub = supabase.channel('production-log-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock_log' }, () => loadStockLog())
      .subscribe();
    const tasksSub = supabase.channel('production-order-tasks-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_order_tasks' }, () => loadProductionTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(stockSub);
      supabase.removeChannel(statusSub);
      supabase.removeChannel(logSub);
      supabase.removeChannel(tasksSub);
    };
  }, [supabase, loadStock, loadProdStatus, loadStockLog, loadProductionTasks]);

  // Filtrar pedidos (por vendedor, estado pedido, fecha, cliente)
  const filteredOrders = (orders || []).filter(o => {
    if (filterSeller === 'none' && o.seller_id) return false;
    if (filterSeller !== 'all' && filterSeller !== 'none' && o.seller_id !== filterSeller) return false;
    if (filterOrderStatus !== 'all' && o.status !== filterOrderStatus) return false;
    if (filterDateFrom && new Date(o.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo && new Date(o.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    if (filterSearch) {
      const q = filterSearch.trim().toLowerCase();
      if (!o.customer_name?.toLowerCase().includes(q) && !o.customer_email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Agrupar por diseño
  const designMap = {};
  filteredOrders.forEach(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach(item => {
      if (filterProduct !== 'all' && item.product_id !== filterProduct) return;
      const key = normalizeName(item.name);
      if (!key) return;
      if (!designMap[key]) {
        designMap[key] = { designKey: key, designName: String(item.name || '').trim(), productName: item.productName || DASH, demand: 0, orders: [] };
      }
      designMap[key].demand += toQty(item.qty);
      if (!designMap[key].orders.find(o => o.id === order.id)) {
        designMap[key].orders.push(order);
      }
    });
  });

  let rows = Object.values(designMap).map(row => {
    const stockRow = stock.find(s => normalizeName(s.design_name) === row.designKey);
    const statusRow = prodStatus.find(s => normalizeName(s.design_name) === row.designKey);
    const qty_produced = Number(stockRow?.qty_produced) || 0;
    const falta = row.demand - qty_produced;
    const status = STATUS_CYCLE.includes(statusRow?.status) ? statusRow.status : 'pending';
    const note = statusRow?.note || '';
    return { ...row, qty_produced, falta, status, note, stockId: stockRow?.id, statusId: statusRow?.id };
  });

  // FIX: filtrar por diseño (texto) — era el bug donde escribir "diseño" escribía en "cliente"
  if (filterDesign) {
    const q = filterDesign.trim().toLowerCase();
    rows = rows.filter(r => normalizeName(r.designName).includes(q));
  }

  // FIX: filtrar por estado de producción — antes no funcionaba
  if (filterProdStatus !== 'all') {
    rows = rows.filter(r => r.status === filterProdStatus);
  }

  const sortValue = (row, key) => {
    if (key === 'design') return row.designName;
    if (key === 'product') return row.productName;
    if (key === 'demand') return row.demand;
    if (key === 'stock') return row.qty_produced;
    if (key === 'falta') return row.falta;
    if (key === 'status') return DEFAULT_SORT_ORDER[row.status] ?? 99;
    if (key === 'note') return row.note;
    if (key === 'orders') return row.orders.length;
    return '';
  };

  if (sortRules.length > 0) {
    rows.sort((a, b) => {
      for (const rule of sortRules) {
        const result = compareValues(sortValue(a, rule.key), sortValue(b, rule.key));
        if (result !== 0) return rule.dir === 'asc' ? result : -result;
      }
      return a.designName.localeCompare(b.designName, 'es');
    });
  } else {
    rows.sort((a, b) => {
      if (DEFAULT_SORT_ORDER[a.status] !== DEFAULT_SORT_ORDER[b.status]) return DEFAULT_SORT_ORDER[a.status] - DEFAULT_SORT_ORDER[b.status];
      if (a.status === 'pending') return b.falta - a.falta;
      return a.designName.localeCompare(b.designName, 'es');
    });
  }

  const totalDesigns = rows.length;
  const totalPending = rows.reduce((acc, r) => acc + Math.max(0, r.falta), 0);
  // FIX: totalProduced sobre los diseños filtrados, no sobre toda la tabla stock
  const totalProduced = rows.reduce((acc, r) => acc + (r.qty_produced || 0), 0);
  const totalOrders = filteredOrders.length;
  const totalExcess = rows.filter(r => r.falta < 0).length;

  const hasFilters = filterSeller !== 'all' || filterProduct !== 'all' || filterOrderStatus !== 'all' || filterProdStatus !== 'all' || filterDateFrom || filterDateTo || filterSearch || filterDesign;

  function clearFilters() {
    setFilterSeller('all');
    setFilterProduct('all');
    setFilterOrderStatus('all');
    setFilterProdStatus('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSearch('');
    setFilterDesign('');
  }

  async function syncOrderTasks(orderId) {
    if (!orderId) return [];
    setErrorMessage('');
    setSyncingOrderIds(prev => ({ ...prev, [orderId]: true }));
    try {
      const { data, error } = await supabase.rpc('admin_sync_order_production_tasks', { p_order_id: orderId });
      if (error) throw error;
      await loadProductionTasks();
      return data || [];
    } catch (error) {
      console.error('Error syncing production tasks', error);
      setErrorMessage(formatProductionError(error, 'No se pudo preparar este pedido para producir.'));
      return [];
    } finally {
      setSyncingOrderIds(prev => ({ ...prev, [orderId]: false }));
    }
  }

  async function handleSelectProductionOrder(orderId) {
    selectProductionOrder(orderId);
    if (orderId) await syncOrderTasks(orderId);
  }

  async function linkManualItemToDesign(order, manualItem, design) {
    const key = design.design_key || design.name || String(design.id);
    const { error } = await supabase.from('production_order_tasks').insert({
      order_id: order.id,
      order_code: order.order_code,
      order_created_at: order.created_at,
      customer_name: order.customer_name,
      customer_email: order.customer_email || null,
      seller_id: order.seller_id || null,
      design_id: design.id || null,
      design_key: key,
      design_name: design.name,
      product_id: design.product_id || null,
      product_name: design.productName || design.product_name || design.products?.name || 'Sin producto',
      required_qty: manualItem.qty || 1,
      produced_qty: 0,
      waste_qty: 0,
      note: '',
    });
    if (!error) await loadProductionTasks();
  }

  async function assignOrderOperator(orderId, operatorId) {
    if (!orderId) return;
    setErrorMessage('');
    setSyncingOrderIds(prev => ({ ...prev, [orderId]: true }));
    try {
      const { error } = await supabase.rpc('admin_assign_order_operator', {
        p_order_id: orderId,
        p_operator_id: operatorId || null,
      });
      if (error) throw error;
      await loadProductionTasks();
    } catch (error) {
      console.error('Error assigning operator', error);
      setErrorMessage(formatProductionError(error, 'No se pudo asignar el operario.'));
    } finally {
      setSyncingOrderIds(prev => ({ ...prev, [orderId]: false }));
    }
  }

  async function saveProductionTask(task, patch) {
    if (!task?.id) {
      setErrorMessage('Primero selecciona el pedido para preparar sus tareas de produccion.');
      return;
    }
    const taskId = task.id;
    const nextProduced = patch.produced_qty !== undefined ? Number(patch.produced_qty) : Number(task.produced_qty || 0);
    const nextWaste = patch.waste_qty !== undefined ? Number(patch.waste_qty) : Number(task.waste_qty || 0);
    const nextPrinted = patch.printed_qty !== undefined ? Number(patch.printed_qty) : Number(task.printed_qty || 0);
    const nextNote = patch.note !== undefined ? patch.note : (task.note || '');
    setSavingTaskIds(prev => ({ ...prev, [taskId]: true }));
    setErrorMessage('');

    const previousTasks = productionTasks;
    setProductionTasks(prev => prev.map(row => row.id === taskId ? {
      ...row,
      produced_qty: Math.max(0, Number.isFinite(nextProduced) ? nextProduced : 0),
      waste_qty: Math.max(0, Number.isFinite(nextWaste) ? nextWaste : 0),
      printed_qty: Math.max(0, Number.isFinite(nextPrinted) ? nextPrinted : 0),
      note: String(nextNote || ''),
    } : row));

    try {
      const { error } = await supabase.rpc('update_production_task_progress', {
        p_task_id: taskId,
        p_produced_qty: Math.max(0, Number.isFinite(nextProduced) ? nextProduced : 0),
        p_waste_qty: Math.max(0, Number.isFinite(nextWaste) ? nextWaste : 0),
        p_printed_qty: Math.max(0, Number.isFinite(nextPrinted) ? nextPrinted : 0),
        p_note: String(nextNote || ''),
      });
      if (error) throw error;
      await Promise.all([loadProductionTasks(), loadStock(), loadStockLog()]);
    } catch (error) {
      console.error('Error saving production task', error);
      setProductionTasks(previousTasks);
      setErrorMessage(formatProductionError(error, 'No se pudo guardar el avance de produccion.'));
    } finally {
      setSavingTaskIds(prev => ({ ...prev, [taskId]: false }));
    }
  }

  useEffect(() => {
    if (activeSubTab !== 'produce' || !selectedProductionOrderId) return;
    const hasTasks = productionTasks.some(task => task.order_id === selectedProductionOrderId);
    if (!hasTasks && !syncingOrderIds[selectedProductionOrderId]) {
      syncOrderTasks(selectedProductionOrderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, selectedProductionOrderId]);

  // Auto-seleccionar primer pedido cuando cargan (evita que selectedProductionOrderId quede vacío
  // mientras el fallback visual muestra produceOrderRows[0])
  useEffect(() => {
    if (!internalSelectedOrderId && !selectedOrderId && orders.length > 0) {
      const firstRow = produceOrderRows[0];
      if (firstRow) handleSelectProductionOrder(firstRow.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  // Etapa F: auto-refresh de cola cada 5s cuando el bridge está conectado y hay pedido seleccionado
  useEffect(() => {
    if (bridgeStatus.state !== 'connected' || !selectedProductionOrderId || !bridgeToken.trim()) return;
    const interval = setInterval(() => {
      getBridgePrintQueue(bridgeUrl, bridgeToken.trim())
        .then(result => setPrintQueue(result?.queue || null))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [bridgeStatus.state, selectedProductionOrderId, bridgeToken, bridgeUrl]);

  // Auto-match PDFs al seleccionar pedido, conectar bridge, o cargar orders.
  // orders.length como dep porque el bridge suele conectar antes que lleguen las orders;
  // sin esa dep, selectedOrderRow es null (produceOrderRows vacío) y el match sale temprano.
  // Escanea el directorio la primera vez (cache vacía al arrancar).
  useEffect(() => {
    if (bridgeStatus.state === 'connected' && selectedProductionOrderId && bridgeToken.trim()) {
      const scan = !hasScannedOnBridgeConnectRef.current;
      hasScannedOnBridgeConnectRef.current = true;
      matchSelectedOrderPdfs({ scan });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductionOrderId, bridgeStatus.state, orders.length]);

  // Auto-escanear PDFs al conectar bridge (mantiene índice sincronizado con Diseños)
  useEffect(() => {
    if (bridgeStatus.state === 'connected' && bridgeToken.trim()) {
      scanBridgePdfs(bridgeUrl, bridgeToken.trim()).catch(() => {});
    } else {
      setQuickPrintSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeStatus.state]);

  // Cargar perfiles al detectar impresora (usa bridgePrinters para evitar TDZ)
  useEffect(() => {
    const target = bridgePrinters.find(p => p.isTargetL8050)
      || bridgePrinters.find(p => p.isDefault)
      || bridgePrinters[0]
      || null;
    if (target && bridgeStatus.state === 'connected' && bridgeToken.trim()) {
      loadDevModeProfilesForPrinter(target);
    } else {
      setDevModeProfiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgePrinters, bridgeStatus.state]);

  async function cycleStatus(row) {
    setErrorMessage('');
    setSavingStatus(prev => ({ ...prev, [row.designKey]: true }));
    try {
      const current = STATUS_CYCLE.indexOf(row.status);
      const next = STATUS_CYCLE[(current + 1) % STATUS_CYCLE.length] || STATUS_CYCLE[0];
      const result = row.statusId
        ? await supabase.from('production_status').update({ status: next, updated_at: new Date().toISOString() }).eq('id', row.statusId)
        : await supabase.from('production_status').insert({ design_name: row.designName, status: next });
      if (result.error) throw result.error;
      await loadProdStatus();
    } catch (error) {
      console.error('Error saving production status', error);
      setErrorMessage(formatProductionError(error, `No se pudo cambiar el estado de ${row.designName}.`));
    } finally {
      setSavingStatus(prev => ({ ...prev, [row.designKey]: false }));
    }
  }

  async function saveNote(row, note) {
    setErrorMessage('');
    const payload = { note: String(note || '').trim(), updated_at: new Date().toISOString() };
    const result = row.statusId
      ? await supabase.from('production_status').update(payload).eq('id', row.statusId)
      : await supabase.from('production_status').insert({ design_name: row.designName, note: payload.note, status: row.status || 'pending' });
    if (result.error) throw result.error;
    await loadProdStatus();
  }

  async function saveStockInline(row, newQty) {
    setErrorMessage('');
    const existing = stock.find(s => normalizeName(s.design_name) === row.designKey);
    const delta = newQty - (Number(existing?.qty_produced) || 0);
    if (delta === 0) return;
    const previousStock = stock;
    const optimisticRow = { ...(existing || {}), design_name: row.designName, qty_produced: newQty };
    setStock(prev => existing
      ? prev.map(s => s.id === existing.id ? { ...s, qty_produced: newQty } : s)
      : [...prev, optimisticRow]
    );
    try {
      const stockResult = existing
        ? await supabase.from('production_stock').update({ qty_produced: newQty }).eq('id', existing.id).select('*').single()
        : await supabase.from('production_stock').insert({ design_name: row.designName, qty_produced: newQty }).select('*').single();
      if (stockResult.error) throw stockResult.error;
      if (stockResult.data) {
        setStock(prev => {
          const byId = stockResult.data.id && prev.some(s => s.id === stockResult.data.id);
          const byName = prev.some(s => normalizeName(s.design_name) === row.designKey);
          if (byId) return prev.map(s => s.id === stockResult.data.id ? stockResult.data : s);
          if (byName) return prev.map(s => normalizeName(s.design_name) === row.designKey ? stockResult.data : s);
          return [...prev, stockResult.data];
        });
      }
      const logResult = await supabase.from('production_stock_log').insert({
        design_name: row.designName,
        qty: Math.abs(delta),
        type: delta >= 0 ? 'add' : 'subtract',
        note: 'Edición inline',
      });
      if (logResult.error) throw logResult.error;
      await loadStockLog();
    } catch (error) {
      setStock(previousStock);
      throw error;
    }
  }

  const selectedReportColumns = REPORT_COLUMNS.filter(col => reportColumns.includes(col.key));

  const reportFiltersDesc = [
    filterSeller !== 'all' ? `Vendedor: ${sellers.find(s => s.id === filterSeller)?.name || filterSeller}` : null,
    filterProduct !== 'all' ? `Producto: ${products.find(p => p.id === filterProduct)?.name || filterProduct}` : null,
    filterOrderStatus !== 'all' ? `Estado pedido: ${ORDER_STATUS_LABEL[filterOrderStatus] || filterOrderStatus}` : null,
    filterProdStatus !== 'all' ? `Estado prod.: ${STATUS_LABEL[filterProdStatus] || filterProdStatus}` : null,
    filterDateFrom ? `Desde: ${filterDateFrom}` : null,
    filterDateTo ? `Hasta: ${filterDateTo}` : null,
    filterSearch ? `Cliente: ${filterSearch}` : null,
    filterDesign ? `Diseño: ${filterDesign}` : null,
  ].filter(Boolean);

  const reportLineWidth = Math.max(42, selectedReportColumns.reduce((acc, col) => acc + col.width, 0) + Math.max(0, selectedReportColumns.length - 1) * 2);
  const reportText = (() => {
    const lines = [];
    lines.push('INKORA - Reporte de Producción');
    lines.push(`Generado: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
    lines.push(`Filtros: ${reportFiltersDesc.length ? reportFiltersDesc.join(', ') : 'Ninguno'}`);
    lines.push('-'.repeat(reportLineWidth));
    lines.push(selectedReportColumns.map(col => fitReportValue(col.label.toUpperCase(), col.width, col.align)).join('  '));
    rows.forEach(r => {
      lines.push(selectedReportColumns.map(col => fitReportValue(col.value(r), col.width, col.align)).join('  '));
    });
    lines.push('-'.repeat(reportLineWidth));
    lines.push(`Total unidades pendientes: ${totalPending}`);
    lines.push(`Diseños distintos: ${totalDesigns}`);
    lines.push(`Pedidos en filtro: ${totalOrders}`);
    return lines.join('\n');
  })();

  function exportReport() {
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkora-produccion-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyReportText() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyFeedback('Copiado');
      setTimeout(() => setCopyFeedback(''), 1600);
    } catch (error) {
      setCopyFeedback('No se pudo copiar');
      setTimeout(() => setCopyFeedback(''), 2200);
    }
  }

  async function shareOperatorAccessLink() {
    const url = 'https://inkora.com.ar/produccion';
    try {
      await navigator.clipboard.writeText(url);
      setOperatorLinkFeedback('Link copiado');
      setTimeout(() => setOperatorLinkFeedback(''), 1800);
    } catch {
      setOperatorLinkFeedback('No se pudo copiar');
      setTimeout(() => setOperatorLinkFeedback(''), 2200);
    }
  }

  const inp = { border: '1.5px solid #dde1ef', borderRadius: 7, padding: '7px 10px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#2d3352', background: 'white', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, display: 'block' };

  const optionStyle = (active) => ({
    padding: '4px 7px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
    fontWeight: active ? 700 : 400,
    background: active ? '#eef4ff' : 'transparent',
    color: active ? '#2D6BE4' : '#2d3352',
  });

  // Lista de diseños únicos disponibles para el filtro de diseño
  const allDesignNames = Object.values(
    (orders || []).reduce((map, order) => {
      (Array.isArray(order.items) ? order.items : []).forEach(item => {
        const key = normalizeName(item.name);
        if (key) map[key] = String(item.name).trim();
      });
      return map;
    }, {})
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const tasksByOrder = productionTasks.reduce((acc, task) => {
    if (!acc[task.order_id]) acc[task.order_id] = [];
    acc[task.order_id].push(task);
    return acc;
  }, {});

  const produceOrderRows = (orders || []).map(order => {
    const taskRows = tasksByOrder[order.id] || [];
    const itemRows = taskRows.length > 0 ? taskRows : getOrderProductionItems(order);
    const status = getProductionStatus(itemRows);
    const operatorIds = [...new Set(itemRows.map(row => row.operator_id).filter(Boolean))];
    const operatorId = operatorIds.length === 1 ? operatorIds[0] : '';
    const operatorName = operatorId
      ? operators.find(op => op.id === operatorId)?.name || itemRows.find(row => row.operator_id === operatorId)?.operator_name || 'Operario'
      : '';
    return {
      id: order.id,
      order,
      order_code: order.order_code,
      created_at: order.created_at,
      delivery_date: order.delivery_date || null,
      source: order.source || 'web',
      customer_name: order.customer_name,
      seller_name: sellers.find(seller => seller.id === order.seller_id)?.name || 'Sin vendedor',
      notes: order.notes || '',
      itemsSummary: summarizeOrderProducts(order.items),
      items: itemRows,
      productionStatus: status,
      operator_id: operatorId,
      operator_name: operatorName,
      producedTotal: itemRows.reduce((sum, row) => sum + toQty(row.produced_qty), 0),
      requiredTotal: itemRows.reduce((sum, row) => sum + toQty(row.required_qty), 0),
    };
  });

  const selectedOrderRow = produceOrderRows.find(row => row.id === selectedProductionOrderId) || produceOrderRows[0] || null;
  const selectedOrder = selectedOrderRow?.order || null;
  const selectedOrderTasks = selectedOrder
    ? (tasksByOrder[selectedOrder.id] && tasksByOrder[selectedOrder.id].length > 0 ? tasksByOrder[selectedOrder.id] : getOrderProductionItems(selectedOrder))
    : [];
  const activeOperators = operators.filter(op => op.active !== false);
  const bridgeTargetPrinter = bridgePrinters.find(printer => printer.isTargetL8050)
    || bridgePrinters.find(printer => printer.isDefault)
    || bridgePrinters[0]
    || null;
  const effectivePrinterName = selectedPrinterOverride || bridgeTargetPrinter?.name || '';
  const bridgeTone = bridgeStatus.state === 'connected'
    ? { bg: '#e8f7ef', border: '#b7ebcf', color: '#15803d', label: 'Conectado' }
    : bridgeStatus.state === 'token'
      ? { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', label: 'Token requerido' }
      : bridgeStatus.state === 'offline'
        ? { bg: '#fff5f5', border: '#fecaca', color: '#b91c1c', label: 'No detectado' }
        : { bg: '#f8faff', border: '#dde1ef', color: '#5a6380', label: 'Sin verificar' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'hidden' }}>
      {errorMessage && (
        <div style={{ background: '#fff5f5', border: '1.5px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', alignSelf: 'flex-start', flexShrink: 0 }}>
        {[
          ['produce', 'Producir'],
          ['orders', 'Pedidos'],
          ['stock', 'Stock'],
          ['log', 'Historial'],
          ['operators', 'Operarios'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => changeSubTab(id)}
            style={{ border: 'none', padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', background: activeSubTab === id ? '#1B2F5E' : 'white', color: activeSubTab === id ? 'white' : '#9aa3bc', borderRight: '1.5px solid #dde1ef' }}>
            {label}
          </button>
        ))}
      </div>

      {activeSubTab === 'produce' && (
        <>
          <div style={{ background: 'white', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Acceso operarios</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>inkora.com.ar/produccion</div>
            </div>
            <button
              type="button"
              onClick={shareOperatorAccessLink}
              style={{ border: '1.5px solid #2D6BE4', borderRadius: 8, padding: '7px 12px', background: operatorLinkFeedback ? '#e8f7ef' : '#f8faff', color: operatorLinkFeedback ? '#15803d' : '#2D6BE4', fontSize: 12, fontWeight: 900, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', whiteSpace: 'nowrap' }}
            >
              {operatorLinkFeedback || 'Compartir acceso'}
            </button>
          </div>

          <div style={{ background: 'white', border: `1.5px solid ${bridgeTone.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', minHeight: 36 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>Impresion</div>
              {bridgePrinters.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: bridgeTone.color }} />
                  <select
                    value={selectedPrinterOverride || bridgeTargetPrinter?.name || ''}
                    onChange={e => setSelectedPrinterOverride(e.target.value)}
                    disabled={bridgeStatus.state !== 'connected'}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 6px', fontSize: 11, fontWeight: 800, fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', minWidth: 0, flex: 1, maxWidth: 240, cursor: bridgeStatus.state === 'connected' ? 'pointer' : 'default' }}
                  >
                    {bridgePrinters.map(p => (
                      <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span style={{ background: bridgeTone.bg, color: bridgeTone.color, border: `1px solid ${bridgeTone.border}`, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 900 }}>
                  {bridgeTone.label}
                </span>
              )}
              {bridgeStatus.state === 'connected' && bridgeTargetPrinter && bridgeToken.trim() && (
                <>
                  <button
                    type="button"
                    onClick={() => openBridgePreferences()}
                    disabled={bridgeBusy}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: bridgeBusy ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}
                  >
                    Preferencias
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintQueueOpen(true)}
                    disabled={bridgeBusy}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: bridgeBusy ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}
                  >
                    Cola de impresión
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: bridgeStatus.state === 'connected' && bridgeToken.trim() ? 'minmax(165px, 0.48fr) minmax(0, 1.42fr) minmax(170px, 0.47fr)' : 'minmax(220px, 0.6fr) minmax(0, 1.5fr)', gap: 10, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
            <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '7px 10px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
              <h2 style={{ fontSize: 13, fontWeight: 900, color: '#1B2F5E', margin: 0, letterSpacing: 0.2 }}>Pedidos</h2>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {loadingTasks && produceOrderRows.length === 0 ? (
                <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '36px 12px' }}>Cargando pedidos...</p>
              ) : produceOrderRows.length === 0 ? (
                <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '36px 12px' }}>No hay pedidos de producción todavía.</p>
              ) : (
                produceOrderRows.map(row => {
                  const selected = selectedProductionOrderId === row.id;
                  const tone = row.productionStatus === 'done'
                    ? { label: 'Terminado', bg: '#e8f7ef', color: '#18a36a' }
                    : row.productionStatus === 'in_press'
                      ? { label: 'En proceso', bg: '#fff7ed', color: '#f59e0b' }
                      : { label: 'Pendiente', bg: '#f3f5fb', color: '#5a6380' };
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => handleSelectProductionOrder(row.id)}
                      style={{ width: '100%', border: 'none', borderBottom: '1px solid #eef0f6', background: selected ? '#f0f5ff' : 'white', padding: '8px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', display: 'grid', gap: 4 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: '#1B2F5E' }}>{row.order_code || row.id}</span>
                        <span style={{ background: tone.bg, color: tone.color, borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>{tone.label}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#2d3352' }}>{row.customer_name || 'Sin cliente'}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#8b95b3' }}>
                        <span>{formatShortDate(row.created_at)}</span>
                        <span style={{ color: row.delivery_date ? '#1B2F5E' : '#c0c5d4', fontWeight: row.delivery_date ? 700 : 400 }}>Entrega: {row.delivery_date ? new Date(row.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}</span>
                        <span>{row.seller_name || 'Sin vendedor'}</span>
                        {row.operator_name && <span>Operario: {row.operator_name}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#5a6380', lineHeight: 1.35 }}>{row.itemsSummary}</div>
                      {row.notes && <div style={{ fontSize: 11, color: '#8b95b3', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Nota: {row.notes}</div>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '7px 12px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>Detalle</div>
                  <h2 style={{ fontSize: 14, fontWeight: 900, color: '#1B2F5E', margin: 0, letterSpacing: 0.2 }}>
                    {selectedOrderRow ? (selectedOrderRow.order_code || 'Pedido seleccionado') : '—'}
                  </h2>
                  {selectedOrderRow && (
                    <div style={{ fontSize: 11, color: '#5a6380', marginTop: 2, lineHeight: 1.5, overflow: 'hidden' }}>
                      <span style={{ fontWeight: 700 }}>{selectedOrderRow.customer_name || 'Sin cliente'}</span>
                      <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                      <span>{formatShortDate(selectedOrderRow.created_at)}</span>
                      <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                      <span style={{ color: selectedOrderRow.delivery_date ? '#1B2F5E' : '#c0c5d4' }}>
                        Entrega: {selectedOrderRow.delivery_date ? new Date(selectedOrderRow.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                      </span>
                      {selectedOrderRow.seller_name && <>
                        <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                        <span>{selectedOrderRow.seller_name}</span>
                      </>}
                      <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                      <span>{STATUS_LABEL[selectedOrderRow.productionStatus] || selectedOrderRow.productionStatus}</span>
                    </div>
                  )}
                  {selectedOrderRow?.itemsSummary && (
                    <div style={{ fontSize: 11, color: '#8b95b3', marginTop: 1 }}>{selectedOrderRow.itemsSummary}</div>
                  )}
                  {selectedOrderRow?.notes && (
                    <div style={{ fontSize: 11, color: '#8b95b3', marginTop: 1, fontStyle: 'italic' }}>{selectedOrderRow.notes}</div>
                  )}
                </div>
                {selectedOrderRow && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: orderPdfStatus.state === 'ready' ? '#15803d' : orderPdfStatus.state === 'error' ? '#b91c1c' : '#8b95b3' }}>
                      {orderPdfStatus.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => matchSelectedOrderPdfs({ scan: true })}
                      disabled={orderPdfBusy || !bridgeToken.trim()}
                      style={{ border: '1.5px solid #2D6BE4', borderRadius: 8, padding: '6px 10px', background: '#f8faff', color: '#2D6BE4', fontSize: 12, fontWeight: 900, cursor: orderPdfBusy || !bridgeToken.trim() ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif' }}
                    >
                      {orderPdfBusy ? 'Buscando PDFs...' : 'PDFs del pedido'}
                    </button>
                    {orderPdfStatus.state === 'ready' && Object.values(orderPdfMatches).some(m => m.found) && (
                      <button
                        type="button"
                        onClick={printAllOrderTasks}
                        disabled={Object.values(printingTasks).some(Boolean) || !bridgeToken.trim()}
                        style={{ border: '1.5px solid #18a36a', borderRadius: 8, padding: '6px 10px', background: '#e8f7ef', color: '#15803d', fontSize: 12, fontWeight: 900, cursor: Object.values(printingTasks).some(Boolean) ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif' }}
                      >
                        Imprimir todo
                      </button>
                    )}
                    <select
                      value={selectedOrderRow.operator_id || ''}
                      onChange={e => assignOrderOperator(selectedOrderRow.id, e.target.value)}
                      disabled={Boolean(syncingOrderIds[selectedOrderRow.id])}
                      style={{ border: '1.5px solid #dde1ef', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#1B2F5E', fontFamily: 'Barlow, sans-serif', minWidth: 160 }}
                    >
                      <option value="">Sin operario</option>
                      {activeOperators.map(op => <option key={op.id} value={op.id}>{op.name || op.email}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {!selectedOrderRow ? (
              <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '48px 16px' }}>Elegí un pedido de la lista para empezar.</p>
            ) : (
              <>

                <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {['Producto', 'Diseño', 'A producir', 'Impreso', 'Troquelado', 'Desperdicio', 'Observaciones', 'Imprimir'].map((h, i) => (
                          <th key={h} style={{ textAlign: 'left', padding: '4px 5px', fontSize: 10, fontWeight: 800, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap', ...(i === 7 ? { position: 'sticky', right: 0, background: 'white', zIndex: 2, boxShadow: '-2px 0 5px rgba(0,0,0,0.07)' } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderTasks.map(task => {
                        const pdfKey = String(task.design_id || task.design_key || task.design_name || '');
                        const pdfMatch = orderPdfMatches[pdfKey];
                        return (
                        <tr key={task.id || `${task.order_id}-${task.design_key}`} style={{ borderBottom: '1px solid #f0f2f8' }}>
                          <td style={{ padding: '4px 5px', color: '#5a6380' }}>{task.product_name || 'Sin producto'}</td>
                          <td style={{ padding: '4px 5px', fontWeight: 800, color: '#1B2F5E' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <DesignThumb designId={String(task.design_id || '')} name={task.design_name} size={28} />
                              <span>{task.design_name}</span>
                            </div>
                            {orderPdfStatus.state === 'ready' && (
                              <span
                                title={pdfMatch?.found ? `${pdfMatch.rootName}\\${pdfMatch.relativePath}` : 'No se encontró PDF local'}
                                style={{ display: 'inline-flex', marginTop: 3, border: '1px solid', borderColor: pdfMatch?.found ? '#b7ebcf' : '#fecaca', borderRadius: 999, padding: '1px 7px', background: pdfMatch?.found ? '#e8f7ef' : '#fff5f5', color: pdfMatch?.found ? '#15803d' : '#b91c1c', fontSize: 10, fontWeight: 900, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {pdfMatch?.found ? `PDF · ${pdfMatch.fileName}` : 'PDF sin vínculo'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '4px 5px', fontWeight: 900, color: '#2d3352' }}>{task.required_qty || 0}</td>
                          <td style={{ padding: '4px 5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <StockCell
                                qtyProduced={task.printed_qty || 0}
                                onSave={qty => saveProductionTask(task, { printed_qty: qty })}
                              />
                              {(task.printed_qty || 0) < (task.required_qty || 0) && (
                                <button
                                  type="button"
                                  title={`Marcar ${task.required_qty} impreso`}
                                  onClick={() => saveProductionTask(task, { printed_qty: task.required_qty })}
                                  style={{ border: '1px solid #b7ebcf', borderRadius: 5, background: '#e8f7ef', color: '#15803d', fontSize: 11, fontWeight: 900, cursor: 'pointer', padding: '2px 6px', lineHeight: 1, fontFamily: 'Barlow, sans-serif', flexShrink: 0 }}
                                >
                                  ={task.required_qty}
                                </button>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '4px 5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <StockCell
                                qtyProduced={task.produced_qty || 0}
                                onSave={qty => saveProductionTask(task, { produced_qty: qty })}
                              />
                              {(task.produced_qty || 0) < (task.required_qty || 0) && (
                                <button
                                  type="button"
                                  title={`Marcar ${task.required_qty} troquelado`}
                                  onClick={() => saveProductionTask(task, { produced_qty: task.required_qty })}
                                  style={{ border: '1px solid #b7ebcf', borderRadius: 5, background: '#e8f7ef', color: '#15803d', fontSize: 11, fontWeight: 900, cursor: 'pointer', padding: '2px 6px', lineHeight: 1, fontFamily: 'Barlow, sans-serif', flexShrink: 0 }}
                                >
                                  ={task.required_qty}
                                </button>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '4px 5px' }}>
                            <StockCell
                              qtyProduced={task.waste_qty || 0}
                              onSave={qty => saveProductionTask(task, { waste_qty: qty })}
                            />
                          </td>
                          <td style={{ padding: '4px 5px' }}>
                            <input
                              defaultValue={task.note || ''}
                              disabled={Boolean(savingTaskIds[task.id])}
                              onBlur={e => saveProductionTask(task, { note: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              placeholder="Agregar observación..."
                              style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '3px 5px', fontSize: 11, fontFamily: 'Barlow, sans-serif', minWidth: 85, color: '#2d3352' }}
                            />
                          </td>
                          <td style={{ padding: '4px 5px', position: 'sticky', right: 0, background: 'white', boxShadow: '-2px 0 5px rgba(0,0,0,0.07)' }}>
                            {(() => {
                              const taskId = task.id || pdfKey;
                              const isPrinting = printingTasks[taskId];
                              const feedback = printFeedback[taskId];
                              const hasPdf = pdfMatch?.found;
                              const remaining = Math.max(0, toQty(task.required_qty) - toQty(task.produced_qty));
                              const defaultSheets = Math.ceil(Math.max(1, remaining) / 2);
                              const sheets = printQtyOverrides[taskId] ?? defaultSheets;
                              const disabled = !hasPdf || isPrinting || !bridgeToken.trim() || bridgeStatus.state !== 'connected';
                              if (feedback) {
                                return (
                                  <span style={{ fontSize: 11, fontWeight: 900, color: feedback === 'Enviado' ? '#15803d' : '#b91c1c' }}>
                                    {feedback}
                                  </span>
                                );
                              }
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={sheets}
                                    onChange={e => {
                                      const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                                      setPrintQtyOverrides(prev => ({ ...prev, [taskId]: v }));
                                    }}
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') printSingleTask(task, sheets);
                                    }}
                                    disabled={disabled}
                                    title={`Hojas a imprimir (${remaining} piezas, 2 por hoja = ${defaultSheets} auto)`}
                                    style={{
                                      width: 32,
                                      border: `1.5px solid ${hasPdf ? '#18a36a' : '#dde1ef'}`,
                                      borderRadius: 6,
                                      padding: '4px 3px',
                                      fontSize: 12,
                                      fontWeight: 900,
                                      textAlign: 'center',
                                      fontFamily: 'Barlow, sans-serif',
                                      color: hasPdf ? '#15803d' : '#c4c9d9',
                                      background: hasPdf ? '#f0fdf7' : '#f7f8fc',
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => printSingleTask(task, sheets)}
                                    disabled={disabled}
                                    title={!hasPdf ? 'Sin PDF vinculado' : `Imprimir ${sheets} hoja${sheets !== 1 ? 's' : ''}`}
                                    style={{
                                      border: `1.5px solid ${hasPdf ? '#18a36a' : '#dde1ef'}`,
                                      borderRadius: 8,
                                      padding: '5px 8px',
                                      background: hasPdf ? '#e8f7ef' : '#f7f8fc',
                                      color: hasPdf ? '#15803d' : '#c4c9d9',
                                      fontSize: 11,
                                      fontWeight: 900,
                                      cursor: disabled ? 'not-allowed' : 'pointer',
                                      fontFamily: 'Barlow, sans-serif',
                                      whiteSpace: 'nowrap',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    {isPrinting ? (
                                      '...'
                                    ) : (
                                      <>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                                          <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
                                        </svg>
                                        Impr.
                                      </>
                                    )}
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* MANUAL ITEMS — fuzzy link for admin orders */}
            {selectedOrder?.source === 'admin' && (() => {
              const manualItems = (selectedOrder.items || [])
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => item?.type === 'manual' && item?.text?.trim());
              if (!manualItems.length) return null;
              return (
                <div style={{ margin: '8px 8px 0', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Items manuales — vincular a diseño
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {manualItems.map(({ item, idx }) => {
                      const key = `${selectedOrder.id}:${idx}`;
                      const alreadyLinked = manualItemLinks[key];
                      const matches = fuzzyMatchDesigns(item.text, ctxDesigns, 5);
                      const top = matches[0] || null;
                      if (alreadyLinked) {
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ fontWeight: 700, color: '#5a6380', flex: 1 }}>&ldquo;{item.text}&rdquo; x{item.qty}</span>
                            <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                              Vinculado a {alreadyLinked.name}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: '#5a6380', minWidth: 100 }}>&ldquo;{item.text}&rdquo; x{item.qty}</span>
                          {top ? (
                            <>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ background: scoreBg(top.score), color: scoreColor(top.score), borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
                                  {Math.round(top.score * 100)}%
                                </span>
                                <DesignThumb designId={String(top.design.id || '')} name={top.design.name} size={18} />
                                <span style={{ color: '#2d3352', fontWeight: 600 }}>{top.design.name}</span>
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  await linkManualItemToDesign(selectedOrder, item, top.design);
                                  setManualItemLinks(prev => ({ ...prev, [key]: { name: top.design.name } }));
                                }}
                                style={{ border: `1.5px solid ${scoreColor(top.score)}`, borderRadius: 7, padding: '3px 10px', background: scoreBg(top.score), color: scoreColor(top.score), fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
                              >
                                Vincular
                              </button>
                            </>
                          ) : (
                            <span style={{ color: '#b91c1c', fontSize: 11, fontWeight: 600 }}>Sin coincidencia</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          {bridgeStatus.state === 'connected' && bridgeToken.trim() && (() => {
            const uniqueMap = {};
            Object.values(designPdfMatches || {}).forEach(m => {
              if (m.found && m.relativePath && !uniqueMap[m.relativePath]) uniqueMap[m.relativePath] = m;
            });
            const matchedPdfs = Object.values(uniqueMap).sort((a, b) => {
              const nameA = a.fileName || a.name || '';
              const nameB = b.fileName || b.name || '';
              const numA = parseInt(nameA, 10);
              const numB = parseInt(nameB, 10);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
            });
            const search = quickPrintSearch.toLowerCase();
            const visiblePdfs = matchedPdfs.length > 0 && search
              ? matchedPdfs.filter(p => (p.fileName || '').toLowerCase().includes(search) || (p.name || '').toLowerCase().includes(search))
              : matchedPdfs;
            return (
              <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '7px 10px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#1B2F5E', letterSpacing: 0.2, marginBottom: 4 }}>
                    Imprimir{matchedPdfs.length > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: '#9aa3bc', marginLeft: 6 }}>{matchedPdfs.length} PDFs</span> : ''}
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={quickPrintSearch}
                    onChange={e => setQuickPrintSearch(e.target.value)}
                    disabled={matchedPdfs.length === 0}
                    style={{ width: '100%', padding: '4px 7px', fontSize: 11, border: '1.5px solid #dde1ef', borderRadius: 7, fontFamily: 'Barlow, sans-serif', outline: 'none', boxSizing: 'border-box', opacity: matchedPdfs.length === 0 ? 0.5 : 1 }}
                  />
                  {matchedPdfs.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 50px', gap: 3, marginTop: 4, padding: '0 2px' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Diseño</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', textAlign: 'center' }}>x</span>
                      <span />
                    </div>
                  )}
                </div>
                <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                  {matchedPdfs.length === 0 && (
                    <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '18px 8px', lineHeight: 1.5 }}>
                      Sin PDFs vinculados.<br />Escaneá en la pestaña Diseños.
                    </p>
                  )}
                  {visiblePdfs.length === 0 && matchedPdfs.length > 0 && (
                    <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '14px 8px' }}>Sin resultados</p>
                  )}
                  {visiblePdfs.map(pdf => {
                    const key = pdf.relativePath;
                    const qty = quickPrintQtyMap[key] ?? 1;
                    const printing = quickPrintingMap[key] ?? false;
                    const label = (pdf.fileName || pdf.name || '').replace(/\.pdf$/i, '');
                    return (
                      <div key={key} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 32px 50px', gap: 3, padding: '4px 7px', borderBottom: '1px solid #f0f2f8', alignItems: 'center' }}>
                        <DesignThumb designId={String(pdf.id || '')} name={pdf.name} size={22} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={pdf.fileName}>{label}</span>
                        <input
                          type="number" min={1} max={99} value={qty}
                          onChange={e => setQuickPrintQtyMap(prev => ({ ...prev, [key]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => { if (e.key === 'Enter') handleQuickPrint(pdf); }}
                          style={{ width: '100%', textAlign: 'center', padding: '3px 1px', border: '1.5px solid #dde1ef', borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', minWidth: 0 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleQuickPrint(pdf)}
                          disabled={printing}
                          style={{ border: 'none', borderRadius: 6, padding: '4px 0', background: printing ? '#e8f7ef' : '#2D6BE4', color: printing ? '#18a36a' : 'white', fontSize: 10, fontWeight: 900, cursor: printing ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}
                        >
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
              </div>
            );
          })()}
          </div>
        </>
      )}

      {activeSubTab === 'orders' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {renderOrdersPanel ? renderOrdersPanel() : (
            <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', padding: 18, color: '#8b95b3', fontSize: 13 }}>
              No se pudo cargar la pestaña de pedidos.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'operators' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {renderOperatorsPanel ? renderOperatorsPanel() : (
            <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', padding: 18, color: '#8b95b3', fontSize: 13 }}>
              No se pudo cargar la pestaña de operarios.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'stock' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <>
          {/* Resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { label: 'Diseños distintos', value: totalDesigns, color: '#1B2F5E' },
              { label: 'Unidades pendientes', value: totalPending, color: totalPending > 0 ? '#e53e3e' : '#18a36a' },
              { label: 'Stock producido', value: totalProduced, color: '#2D6BE4' },
              { label: 'Pedidos en filtro', value: totalOrders, color: '#5a6380' },
              { label: 'Diseños en exceso', value: totalExcess, color: totalExcess > 0 ? '#f6a800' : '#18a36a' },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', padding: '14px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'visible' }}>
            {/* Header de la tabla */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1.5px solid #dde1ef' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Cola de producción</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {hasFilters && (
                  <button onClick={clearFilters}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'white', color: '#9aa3bc' }}>
                    ✕ Limpiar filtros
                  </button>
                )}
                <button onClick={exportReport}
                  style={{ background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ↓ Descargar TXT
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextReport(prev => !prev)}
                  style={{ border: '1.5px solid #2D6BE4', borderRadius: 8, padding: '6px 12px', background: showTextReport ? '#e8eef9' : 'white', color: '#2D6BE4', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  Texto para copiar
                </button>
                {sortRules.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSortRules([])}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '4px 9px', background: 'white', color: '#5a6380', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                    title={sortRules.map((rule, i) => `${i + 1}. ${SORT_LABEL[rule.key]} ${rule.dir === 'asc' ? 'asc' : 'desc'}`).join('\n')}
                  >
                    Limpiar orden
                  </button>
                )}
              </div>
            </div>

            {/* Configuración de reporte */}
            <div style={{ background: '#fbfcff', borderBottom: '1px solid #dde1ef', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5 }}>Columnas reporte</span>
                {REPORT_COLUMNS.map(col => {
                  const checked = reportColumns.includes(col.key);
                  const locked = checked && reportColumns.length === 1;
                  return (
                    <label key={col.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1.5px solid ${checked ? '#2D6BE4' : '#dde1ef'}`, borderRadius: 7, padding: '3px 7px', background: checked ? '#e8eef9' : 'white', color: checked ? '#2D6BE4' : '#5a6380', fontSize: 11, fontWeight: 700, cursor: locked ? 'not-allowed' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggleReportColumn(col.key)}
                        style={{ margin: 0 }}
                      />
                      {col.label}
                    </label>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setReportColumns(DEFAULT_REPORT_COLUMNS)}
                  style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '4px 8px', background: 'white', color: '#9aa3bc', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                >
                  Reset
                </button>
              </div>
              {showTextReport && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5 }}>Reporte actualizado</span>
                    <button
                      type="button"
                      onClick={copyReportText}
                      style={{ border: 'none', borderRadius: 7, padding: '6px 12px', background: '#18a36a', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                    >
                      {copyFeedback || 'Copiar'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={reportText}
                    rows={Math.min(14, Math.max(6, rows.length + 7))}
                    onFocus={e => e.target.select()}
                    style={{ width: '100%', resize: 'vertical', border: '1.5px solid #dde1ef', borderRadius: 8, padding: 10, fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.45, color: '#2d3352', background: 'white', boxSizing: 'border-box', whiteSpace: 'pre' }}
                  />
                </div>
              )}
            </div>

            {/* Barra filtros externos */}
            <div style={{ background: '#f7f8fc', borderBottom: '1px solid #dde1ef', padding: '8px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Vendedor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendedor</span>
                <select value={filterSeller} onChange={e => setFilterSeller(e.target.value)}
                  style={{ border: filterSeller !== 'all' ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', color: filterSeller !== 'all' ? '#2D6BE4' : '#5a6380', background: 'white', cursor: 'pointer' }}>
                  <option value="all">Todos</option>
                  <option value="none">Sin vendedor</option>
                  {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {/* Cliente — FIX: ahora solo busca por cliente, no mezcla con diseño */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cliente</span>
                <input type="text" placeholder="Buscar..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                  style={{ border: filterSearch ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', color: '#2d3352', background: 'white', width: 110 }} />
              </div>
              {/* Estado pedido */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Estado pedido</span>
                <select value={filterOrderStatus} onChange={e => setFilterOrderStatus(e.target.value)}
                  style={{ border: filterOrderStatus !== 'all' ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', color: filterOrderStatus !== 'all' ? '#2D6BE4' : '#5a6380', background: 'white', cursor: 'pointer' }}>
                  <option value="all">Todos</option>
                  <option value="pending">Pendiente</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="in_production">En producción</option>
                  <option value="ready">Listo</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
              {/* Fechas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Fecha</span>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  style={{ border: filterDateFrom ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', background: 'white' }} />
                <span style={{ fontSize: 11, color: '#9aa3bc' }}>→</span>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  style={{ border: filterDateTo ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', background: 'white' }} />
              </div>
            </div>

              <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 6, minHeight: rows.length < 4 ? 220 : 'auto' }}>
                <table style={{ width: '100%', minWidth: 960, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
                  <colgroup>
                    <col style={{ width: 230 }} />
                    <col style={{ width: 190 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 132 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 145 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 110 }} />
                  </colgroup>
                  {/* FIX: thead sin position sticky para evitar superposición con los dropdowns */}
                  <thead>
                    <tr>
                      {/* FIX: Filtro de diseño ahora muestra lista de diseños disponibles,
                          y usa filterDesign (separado de filterSearch) */}
                      <SortFilterHeader label="Diseño" active={!!filterDesign} sortKey="design" sortRules={sortRules} onToggleSort={toggleSort} filter={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <input
                            type="text"
                            placeholder="Buscar diseño..."
                            value={filterDesign}
                            onChange={e => setFilterDesign(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                            style={{ border: '1.5px solid #dde1ef', borderRadius: 5, padding: '4px 7px', fontSize: 12, fontFamily: 'Barlow, sans-serif', width: '100%', outline: 'none', marginBottom: 4, boxSizing: 'border-box' }}
                          />
                          <div style={{ maxHeight: 132, overflowY: 'auto' }}>
                            <div
                              onClick={() => setFilterDesign('')}
                              style={optionStyle(filterDesign === '')}
                            >
                              Todos los diseños
                            </div>
                            {allDesignNames
                              .filter(n => !filterDesign || n.toLowerCase().includes(filterDesign.toLowerCase()))
                              .map(name => (
                                <div key={name} onClick={() => setFilterDesign(name)} style={{ ...optionStyle(filterDesign === name), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {name}
                                </div>
                              ))}
                          </div>
                        </div>
                      } />

                      {/* Filtro de producto */}
                      <SortFilterHeader label="Producto" active={filterProduct !== 'all'} sortKey="product" sortRules={sortRules} onToggleSort={toggleSort} filter={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {[{ id: 'all', name: 'Todos' }, ...products].map(p => (
                            <div key={p.id} onClick={() => setFilterProduct(p.id)} style={optionStyle(filterProduct === p.id)}>{p.name}</div>
                          ))}
                        </div>
                      } />

                      <SortFilterHeader label="Demanda" align="center" sortKey="demand" sortRules={sortRules} onToggleSort={toggleSort} />
                      <SortFilterHeader label="Stock" align="center" sortKey="stock" sortRules={sortRules} onToggleSort={toggleSort} />
                      <SortFilterHeader label="Falta" align="center" sortKey="falta" sortRules={sortRules} onToggleSort={toggleSort} />

                      {/* FIX: Estado prod. ahora tiene onClick que realmente filtra */}
                      <SortFilterHeader label="Estado prod." active={filterProdStatus !== 'all'} sortKey="status" sortRules={sortRules} onToggleSort={toggleSort} filter={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div onClick={() => setFilterProdStatus('all')} style={optionStyle(filterProdStatus === 'all')}>Todos</div>
                          {STATUS_CYCLE.map(s => (
                            <div key={s} onClick={() => setFilterProdStatus(s)}
                              style={{ ...optionStyle(filterProdStatus === s), color: filterProdStatus === s ? STATUS_COLOR[s] : '#2d3352', fontWeight: filterProdStatus === s ? 700 : 400 }}>
                              {STATUS_LABEL[s]}
                            </div>
                          ))}
                        </div>
                      } />

                      <SortFilterHeader label="Nota" sortKey="note" sortRules={sortRules} onToggleSort={toggleSort} />
                      <SortFilterHeader label="Pedidos" align="center" sortKey="orders" sortRules={sortRules} onToggleSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '42px 20px', color: '#9aa3bc', borderBottom: '1px solid #f0f2f8' }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                          <p style={{ fontSize: 14, margin: 0 }}>No hay diseños en la cola con los filtros actuales.</p>
                        </td>
                      </tr>
                    ) : rows.map(row => {
                      const isExpanded = expandedRow === row.designKey;
                      const urgent = isUrgent(row.orders);
                      const rowBg = row.falta <= 0 ? 'rgba(24,163,106,0.06)' : 'transparent';
                      return (
                        <React.Fragment key={row.designKey}>
                          <tr style={{ borderBottom: '1px solid #f0f2f8', background: rowBg }}>

                            {/* Diseño */}
                            <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1B2F5E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.designName}
                              {urgent && <span style={{ marginLeft: 6, fontSize: 11 }}>🔴 <span style={{ color: '#e53e3e', fontWeight: 700 }}>Urgente</span></span>}
                              {row.falta < 0 && <span style={{ marginLeft: 6, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>Exceso +{Math.abs(row.falta)}</span>}
                            </td>

                            {/* Producto */}
                            <td style={{ padding: '10px 10px', color: '#5a6380', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.productName}</td>

                            {/* Demanda */}
                            <td style={{ padding: '10px 10px', fontWeight: 600, color: '#2d3352', textAlign: 'center' }}>{row.demand}</td>

                            {/* Stock — FIX: pasamos qty_produced como prop separada */}
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              <StockCell
                                qtyProduced={row.qty_produced}
                                onSave={(qty) => saveStockInline(row, qty)}
                              />
                            </td>

                            {/* Falta */}
                            <td style={{ padding: '10px 10px', fontWeight: 700, color: row.falta > 0 ? '#e53e3e' : '#18a36a', textAlign: 'center' }}>{row.falta}</td>

                            {/* Estado producción */}
                            <td style={{ padding: '10px 10px' }}>
                              <button
                                onClick={() => cycleStatus(row)}
                                disabled={savingStatus[row.designKey]}
                                title="Click para cambiar estado"
                                style={{ background: `${STATUS_COLOR[row.status]}20`, color: STATUS_COLOR[row.status], border: `1.5px solid ${STATUS_COLOR[row.status]}`, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: savingStatus[row.designKey] ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: savingStatus[row.designKey] ? 0.65 : 1 }}>
                                {savingStatus[row.designKey] ? '...' : STATUS_LABEL[row.status]}
                              </button>
                            </td>

                            {/* Nota */}
                            <td style={{ padding: '10px 10px' }}>
                              <NoteCell row={row} onSave={(note) => saveNote(row, note)} />
                            </td>

                            {/* Pedidos (expandible) */}
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              <button
                                onClick={() => setExpandedRow(isExpanded ? null : row.designKey)}
                                style={{ background: 'none', border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#5a6380', fontWeight: 600 }}>
                                {row.orders.length} {isExpanded ? '▲' : '▼'}
                              </button>
                            </td>

                          </tr>

                          {/* Fila expandida: detalle de pedidos */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} style={{ padding: '0 10px 12px 30px', background: '#f7f8fc' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      {['Código', 'Cliente', 'Fecha', 'Qty', 'Estado pedido'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', borderBottom: '1px solid #dde1ef' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...row.orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(o => {
                                      const items = Array.isArray(o.items) ? o.items : [];
                                      const qty = items.filter(i => normalizeName(i.name) === row.designKey).reduce((acc, i) => acc + toQty(i.qty), 0);
                                      return (
                                        <tr key={o.id} style={{ borderBottom: '1px solid #eef0f6' }}>
                                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1B2F5E' }}>{o.order_code}</td>
                                          <td style={{ padding: '6px 8px', color: '#2d3352' }}>{o.customer_name || '—'}</td>
                                          <td style={{ padding: '6px 8px', color: '#5a6380' }}>{formatDate(o.created_at)}</td>
                                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1B2F5E' }}>{qty}</td>
                                          <td style={{ padding: '6px 8px' }}>
                                            <span style={{ background: `${ORDER_STATUS_COLOR[o.status] || '#9aa3bc'}20`, color: ORDER_STATUS_COLOR[o.status] || '#9aa3bc', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                                              {ORDER_STATUS_LABEL[o.status] || o.status}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </div>
        </>
        </div>
      )}

      {/* Sub-tab: Historial */}
      {activeSubTab === 'log' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Inner tab bar */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {[['stock','Troquelado'],['print','Impresión']].map(([id, label]) => (
              <button key={id} onClick={() => setLogSubTab(id)} style={{ border: 'none', padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: 'pointer', background: logSubTab === id ? '#1B2F5E' : '#e8eaf4', color: logSubTab === id ? 'white' : '#5a6380', transition: 'background 0.15s' }}>{label}</button>
            ))}
          </div>

          {/* Troquelado */}
          {logSubTab === 'stock' && (
            <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', flex: 1 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1.5px solid #dde1ef' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Movimientos de stock</h2>
              </div>
              <div style={{ padding: 16, overflowX: 'auto' }}>
                {stockLog.length === 0 ? (
                  <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Sin movimientos registrados.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Diseño', 'Tipo', 'Cantidad', 'Nota', 'Fecha'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stockLog.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1B2F5E' }}>{log.design_name}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ color: log.type === 'add' ? '#18a36a' : '#e53e3e', fontWeight: 700 }}>{log.type === 'add' ? '+ Entrada' : '− Salida'}</span>
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 700, color: log.type === 'add' ? '#18a36a' : '#e53e3e' }}>{log.qty}</td>
                          <td style={{ padding: '6px 10px', color: '#5a6380' }}>{log.note || '—'}</td>
                          <td style={{ padding: '6px 10px', color: '#9aa3bc', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Impresión */}
          {logSubTab === 'print' && (
            <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', flex: 1 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1.5px solid #dde1ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Historial de impresión</h2>
                {printHistory.length > 0 && (
                  <button onClick={() => { setPrintHistory([]); try { localStorage.removeItem('inkora_print_history'); } catch {} }} style={{ fontSize: 11, color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Limpiar</button>
                )}
              </div>
              <div style={{ padding: 16, overflowX: 'auto' }}>
                {printHistory.length === 0 ? (
                  <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Sin impresiones registradas.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Fecha', 'Diseño', 'Copias', 'Hojas impresas', 'Impresora', 'Estado'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {printHistory.map(entry => (
                        <tr key={entry.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                          <td style={{ padding: '6px 10px', color: '#9aa3bc', whiteSpace: 'nowrap' }}>{entry.fecha ? new Date(entry.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1B2F5E', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.diseno || '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>{entry.copias ?? '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: entry.hojas != null ? '#1B2F5E' : '#9aa3bc' }}>{entry.hojas != null ? entry.hojas : '—'}</td>
                          <td style={{ padding: '6px 10px', color: '#5a6380', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.impresora || '—'}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: entry.estado === 'done' || entry.estado === 'printed' ? '#dcfce7' : entry.estado === 'error' ? '#fee2e2' : entry.estado === 'cancelled' ? '#fef9c3' : '#f0f2f8', color: entry.estado === 'done' || entry.estado === 'printed' ? '#15803d' : entry.estado === 'error' ? '#dc2626' : entry.estado === 'cancelled' ? '#92400e' : '#5a6380' }}>
                              {entry.estado === 'done' ? 'Enviado' : entry.estado === 'printed' ? 'Impreso' : entry.estado === 'error' ? 'Error' : entry.estado === 'cancelled' ? 'Cancelado' : entry.estado || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {printQueueOpen && (
        <PrintQueueOverlay
          bridgeUrl={bridgeUrl}
          bridgeToken={bridgeToken.trim()}
          printerName={effectivePrinterName}
          onClose={() => setPrintQueueOpen(false)}
        />
      )}
    </div>
  );
}
