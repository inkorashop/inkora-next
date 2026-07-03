'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_BRIDGE_URL,
  getStoredBridgeConfig,
  saveStoredBridgeConfig,
  getBridgeHealth,
  getBridgePrinters,
  matchBridgeDesignPdfs,
  scanBridgePdfs,
  printBridgeJob,
  getBridgePrintQueue,
  openBridgePrinterPreferences,
  openBridgePrintQueue,
} from '@/lib/print-bridge-client';

function DesignThumb({ designId, name, size = 24 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!designId) return;
    supabase.from('designs').select('image_url, model_url').eq('id', designId).single()
      .then(({ data }) => {
        if (!data) return;
        const url = data.image_url || (!/\.(glb|gltf|usdz)$/i.test(data.model_url || '') ? data.model_url : null);
        if (url) setSrc(url);
      });
  }, [designId]);
  if (!src) return <div style={{ width: size, height: size, borderRadius: 5, flexShrink: 0, background: '#e8eaf4', border: '1px solid #dde1ef', display: 'inline-block' }} />;
  return <img src={src} alt={name || ''} title={name || ''} style={{ width: size, height: size, borderRadius: 5, flexShrink: 0, objectFit: 'cover', border: '1px solid #dde1ef', display: 'inline-block', verticalAlign: 'middle' }} />;
}

const LOGO = 'https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png';
const STATUS_LABEL = { pending: 'Pendiente', in_press: 'En proceso', done: 'Terminado' };
const STATUS_TONE = {
  pending: { bg: '#f3f5fb', color: '#5a6380' },
  in_press: { bg: '#fff7ed', color: '#f59e0b' },
  done: { bg: '#e8f7ef', color: '#15803d' },
};

function toQty(value) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function formatShortDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function getProductionStatus(tasks) {
  const rows = Array.isArray(tasks) ? tasks : [];
  const required = rows.filter(row => toQty(row.required_qty) > 0);
  if (required.length === 0) return 'pending';
  const producedTotal = required.reduce((sum, row) => sum + toQty(row.produced_qty), 0);
  if (producedTotal <= 0) return 'pending';
  return required.every(row => toQty(row.produced_qty) >= toQty(row.required_qty)) ? 'done' : 'in_press';
}

function summarizeProducts(tasks) {
  const byProduct = {};
  (Array.isArray(tasks) ? tasks : []).forEach(task => {
    const product = task.product_name || 'Sin producto';
    byProduct[product] = (byProduct[product] || 0) + toQty(task.required_qty);
  });
  return Object.entries(byProduct).map(([product, qty]) => `${product} x${qty}`).join(', ') || '-';
}

function normalizeTask(task) {
  return { ...task, id: task.id || task.task_id, note: task.note ?? task.task_note ?? '', printed_qty: task.printed_qty ?? 0 };
}

function QtyCell({ value, disabled, onSave, step }) {
  const [val, setVal] = useState(String(Number(value) || 0));
  const [saving, setSaving] = useState(false);
  const latestRef = useRef(value);

  useEffect(() => {
    latestRef.current = value;
    if (!saving) setVal(String(Number(value) || 0));
  }, [value, saving]);

  async function commit(next) {
    const qty = Math.max(0, parseInt(String(next), 10) || 0);
    setVal(String(qty));
    if (qty === latestRef.current) return;
    setSaving(true);
    try { await onSave(qty); latestRef.current = qty; }
    finally { setSaving(false); }
  }

  function adjust(delta) {
    const cur = Math.max(0, parseInt(val, 10) || 0);
    commit(cur + delta);
  }

  const num = parseInt(val, 10) || 0;
  const inc = step || 1;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, width: 90 }}>
      <button type="button" disabled={disabled || saving || num <= 0} onClick={() => adjust(-inc)}
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #fecaca', background: num <= 0 || disabled || saving ? '#f7f8fc' : '#fef2f2', color: num <= 0 || disabled || saving ? '#c4c9d9' : '#e53e3e', fontWeight: 900, cursor: num <= 0 || disabled || saving ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1 }}>-</button>
      <input type="number" min="0" value={val} disabled={disabled || saving}
        onChange={e => setVal(e.target.value)}
        onBlur={() => commit(val)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 4px', fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 700, color: '#2d3352', width: 44, textAlign: 'center', outline: 'none', boxSizing: 'border-box', background: disabled || saving ? '#f4f5f8' : 'white' }} />
      <button type="button" disabled={disabled || saving} onClick={() => adjust(inc)}
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #bbf7d0', background: disabled || saving ? '#f7f8fc' : '#f0fdf4', color: disabled || saving ? '#c4c9d9' : '#18a36a', fontWeight: 900, cursor: disabled || saving ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1 }}>+</button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function OperariosPage() {
  // Auth
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [savingTaskIds, setSavingTaskIds] = useState({});
  const taskSaveStateRef = useRef({});

  // Bridge
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState({ state: 'idle', message: 'Sin verificar', health: null });
  const [bridgePrinters, setBridgePrinters] = useState([]);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [selectedPrinterOverride, setSelectedPrinterOverride] = useState('');

  // Print
  const [orderPdfMatches, setOrderPdfMatches] = useState({});
  const [orderPdfStatus, setOrderPdfStatus] = useState({ state: 'idle', message: 'PDFs sin verificar', roots: [] });
  const [orderPdfBusy, setOrderPdfBusy] = useState(false);
  const [printingTasks, setPrintingTasks] = useState({});
  const [printQtyOverrides, setPrintQtyOverrides] = useState({});
  const [printFeedback, setPrintFeedback] = useState({});
  const [hasScannedRef] = useState({ current: false });
  const [allPdfMatches, setAllPdfMatches] = useState({});
  const [quickPrintSearch, setQuickPrintSearch] = useState('');

  // Derived bridge values
  const bridgeTargetPrinter = bridgePrinters.find(p => p.isTargetL8050) || bridgePrinters.find(p => p.isDefault) || bridgePrinters[0] || null;
  const effectivePrinterName = selectedPrinterOverride || bridgeTargetPrinter?.name || '';
  const bridgeTone = bridgeStatus.state === 'connected'
    ? { bg: '#e8f7ef', border: '#b7ebcf', color: '#15803d', label: 'Conectado' }
    : bridgeStatus.state === 'token'
      ? { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', label: 'Token requerido' }
      : bridgeStatus.state === 'offline'
        ? { bg: '#fff5f5', border: '#fecaca', color: '#b91c1c', label: 'No detectado' }
        : { bg: '#f8faff', border: '#dde1ef', color: '#5a6380', label: 'Sin verificar' };

  // Auth
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setCheckingSession(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  // Bridge init from localStorage; if no token, try fetching from Supabase
  useEffect(() => {
    const stored = getStoredBridgeConfig();
    const url = stored.url || DEFAULT_BRIDGE_URL;
    const token = stored.token || '';
    setBridgeUrl(url);
    setBridgeToken(token);
    if (token) {
      autoInitBridge(url, token);
    } else {
      supabase.auth.getSession().then(({ data }) => {
        const accessToken = data?.session?.access_token;
        if (!accessToken) return;
        fetch('/api/bridge-config', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then(r => r.ok ? r.json() : null)
          .then(json => {
            const remoteToken = json?.token;
            if (!remoteToken) return;
            setBridgeToken(remoteToken);
            saveStoredBridgeConfig({ url, token: remoteToken });
            autoInitBridge(url, remoteToken);
          })
          .catch(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tasks
  const loadTasks = useCallback(async () => {
    if (!session) return;
    setLoadingTasks(true);
    setTasksError('');
    const { error: claimError } = await supabase.rpc('claim_production_operator');
    if (claimError) {
      const msg = claimError.message || '';
      const missing = claimError.code === '42883' || claimError.code === '42P01' || /claim_production_operator|production_operators/i.test(msg);
      setTasksError(missing ? 'Falta aplicar el SQL de producción y operarios.' : 'Tu email no está habilitado como operario.');
      setTasks([]);
      setLoadingTasks(false);
      return;
    }
    const { data, error } = await supabase.rpc('get_operator_production_tasks');
    if (error) {
      const msg = error.message || '';
      const missing = error.code === '42883' || error.code === '42P01' || /production_order_tasks|production_operators|get_operator_production_tasks/i.test(msg);
      setTasksError(missing ? 'Falta aplicar el SQL de producción y operarios.' : 'No tenés pedidos asignados o tu usuario no está habilitado como operario.');
      setTasks([]);
    } else {
      setTasks(prev => {
        const prevMap = Object.fromEntries(prev.map(t => [t.id, t]));
        return (data || []).map(task => {
          const normalized = normalizeTask(task);
          const taskState = taskSaveStateRef.current[normalized.id];
          if (taskState?.saving || taskState?.queued) return prevMap[normalized.id] || normalized;
          return normalized;
        });
      });
    }
    setLoadingTasks(false);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadTasks();
    const channel = supabase
      .channel(`operator-production-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_order_tasks' }, () => loadTasks())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session, loadTasks]);

  // Auto-match ALL PDFs when bridge connects
  useEffect(() => {
    if (bridgeStatus.state === 'connected' && bridgeToken.trim()) {
      const scan = !hasScannedRef.current;
      hasScannedRef.current = true;
      matchAllPdfs({ scan });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeStatus.state, bridgeToken]);

  // Per-order match when selected order changes (updates badge/status in detail header)
  useEffect(() => {
    if (bridgeStatus.state === 'connected' && selectedOrderId && bridgeToken.trim()) {
      matchSelectedOrderPdfs({ scan: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId]);

  const orderRows = useMemo(() => {
    const grouped = tasks.reduce((acc, task) => {
      if (!acc[task.order_id]) acc[task.order_id] = [];
      acc[task.order_id].push(task);
      return acc;
    }, {});
    return Object.entries(grouped).map(([orderId, orderTasks]) => {
      const first = orderTasks[0] || {};
      return {
        id: orderId,
        order_code: first.order_code,
        created_at: first.order_created_at,
        customer_name: first.customer_name,
        seller_name: first.seller_name,
        notes: first.order_notes || '',
        tasks: orderTasks.sort((a, b) =>
          String(a.product_name || '').localeCompare(String(b.product_name || ''), 'es') ||
          String(a.design_name || '').localeCompare(String(b.design_name || ''), 'es')),
        productionStatus: getProductionStatus(orderTasks),
        itemsSummary: summarizeProducts(orderTasks),
      };
    }).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }, [tasks]);

  useEffect(() => {
    if (orderRows.length === 0) { setSelectedOrderId(null); return; }
    if (!selectedOrderId || !orderRows.some(row => row.id === selectedOrderId)) {
      setSelectedOrderId(orderRows[0].id);
    }
  }, [orderRows, selectedOrderId]);

  const selectedOrder = orderRows.find(row => row.id === selectedOrderId) || null;

  const summaryTotals = useMemo(() => {
    const t = selectedOrder?.tasks || [];
    return {
      required: t.reduce((s, r) => s + toQty(r.required_qty), 0),
      printed: t.reduce((s, r) => s + toQty(r.printed_qty), 0),
      produced: t.reduce((s, r) => s + toQty(r.produced_qty), 0),
      waste: t.reduce((s, r) => s + toQty(r.waste_qty), 0),
    };
  }, [selectedOrder]);

  // Bridge functions
  async function checkPrintBridge({ includePrinters = true, overrideUrl, overrideToken } = {}) {
    const url = overrideUrl !== undefined ? overrideUrl : bridgeUrl;
    const token = overrideToken !== undefined ? overrideToken : bridgeToken;
    setBridgeBusy(true);
    try {
      saveStoredBridgeConfig({ url, token });
      await getBridgeHealth(url);
      if (!token.trim()) {
        setBridgePrinters([]);
        setBridgeStatus({ state: 'token', message: 'Bridge conectado. Pegue el token para leer impresoras.', health: null });
        return;
      }
      if (includePrinters) {
        const printerPayload = await getBridgePrinters(url, token.trim());
        const printers = Array.isArray(printerPayload?.printers) ? printerPayload.printers : [];
        setBridgePrinters(printers);
        const target = printers.find(p => p.isTargetL8050);
        setBridgeStatus({ state: 'connected', message: target ? `Bridge conectado: ${target.name}` : 'Bridge conectado.', health: null });
      } else {
        setBridgeStatus({ state: 'connected', message: 'Bridge conectado.', health: null });
      }
      // Persist token to Supabase so other devices can auto-load it
      if (token.trim()) {
        supabase.auth.getSession().then(({ data }) => {
          const accessToken = data?.session?.access_token;
          if (!accessToken) return;
          fetch('/api/bridge-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ token: token.trim() }),
          }).catch(() => {});
        });
      }
    } catch (error) {
      setBridgePrinters([]);
      setBridgeStatus({
        state: error?.status === 401 ? 'token' : 'offline',
        message: error?.status === 401 ? 'Token Bridge incorrecto o faltante.' : `No se pudo conectar al Bridge: ${error.message || error}`,
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
          try { await getBridgeHealth(url); clearInterval(poll); resolve(); }
          catch { if (retries >= 12) { clearInterval(poll); resolve(); } }
        }, 1500);
      });
    }
    await checkPrintBridge({ overrideUrl: url, overrideToken: token });
  }

  async function matchAllPdfs({ scan = false } = {}) {
    const token = bridgeToken.trim();
    if (!token) return;
    try {
      // Fetch ALL designs from Supabase (same as admin does via getDesignPdfCandidates)
      const { data: allDesigns } = await supabase.from('designs').select('id, name').limit(1500);
      const candidates = (allDesigns || []).map(d => ({ id: String(d.id), name: d.name || '', productName: '' }));
      if (candidates.length === 0) return;
      saveStoredBridgeConfig({ url: bridgeUrl, token });
      if (scan) await scanBridgePdfs(bridgeUrl, token);
      const payload = await matchBridgeDesignPdfs(bridgeUrl, token, candidates);
      const nextMatches = {};
      (payload.matches || []).forEach(match => { nextMatches[match.id] = match; });
      setAllPdfMatches(prev => ({ ...prev, ...nextMatches }));
    } catch {}
  }

  async function matchSelectedOrderPdfs({ scan = false } = {}) {
    if (!selectedOrder || !selectedOrder.tasks.length) return;
    const token = bridgeToken.trim();
    if (!token) return;
    const candidates = selectedOrder.tasks.map(task => ({
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
      (payload.matches || []).forEach(match => { nextMatches[match.id] = match; });
      setOrderPdfMatches(nextMatches);
      setAllPdfMatches(prev => ({ ...prev, ...nextMatches }));
      setOrderPdfStatus({ state: 'ready', message: `PDFs del pedido: ${payload.found || 0}/${candidates.length}`, roots: payload.roots || [] });
    } catch (error) {
      setOrderPdfStatus({
        state: error?.status === 401 ? 'token' : 'error',
        message: error?.status === 401 ? 'Token Bridge incorrecto.' : `No se pudieron consultar PDFs: ${error.message || error}`,
        roots: [],
      });
    } finally {
      setOrderPdfBusy(false);
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
      setPrintFeedback(prev => ({ ...prev, [taskId]: status === 'done' ? 'Enviado' : status === 'error' ? (result?.job?.error || 'Error') : status }));
      setTimeout(() => setPrintFeedback(prev => ({ ...prev, [taskId]: '' })), 3000);
    } catch (error) {
      setPrintFeedback(prev => ({ ...prev, [taskId]: error?.message || 'Error' }));
      setTimeout(() => setPrintFeedback(prev => ({ ...prev, [taskId]: '' })), 4000);
    } finally {
      setPrintingTasks(prev => ({ ...prev, [taskId]: false }));
    }
  }

  async function signInWithGoogle() {
    setSigningIn(true);
    setAuthError('');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://www.inkora.com.ar/auth/popup-callback', skipBrowserRedirect: true },
    });
    if (error || !data?.url) { setAuthError('No se pudo iniciar sesión con Google.'); setSigningIn(false); return; }
    const popup = window.open(data.url, 'operator-google-auth', 'width=500,height=600,top=100,left=100');
    window.addEventListener('message', function handler(e) {
      if (!['https://www.inkora.com.ar', 'https://inkora.com.ar'].includes(e.origin)) return;
      if (e.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', handler);
        popup?.close();
        supabase.auth.getSession().then(({ data: sd }) => { setSession(sd.session || null); setSigningIn(false); });
      }
    });
  }

  async function signOut() { await supabase.auth.signOut(); setTasks([]); setSelectedOrderId(null); }

  async function saveTask(task, patch) {
    const taskId = task.id;
    let nextProduced, nextWaste, nextPrinted, nextNote;
    setTasks(prev => {
      const cur = prev.find(t => t.id === taskId) || task;
      nextProduced = patch.produced_qty !== undefined ? Number(patch.produced_qty) : toQty(cur.produced_qty);
      nextWaste    = patch.waste_qty    !== undefined ? Number(patch.waste_qty)    : toQty(cur.waste_qty);
      nextPrinted  = patch.printed_qty  !== undefined ? Number(patch.printed_qty)  : toQty(cur.printed_qty);
      nextNote     = patch.note         !== undefined ? patch.note                 : (cur.note || '');
      return prev.map(r => r.id === taskId ? { ...r, produced_qty: nextProduced, waste_qty: nextWaste, printed_qty: nextPrinted, note: nextNote } : r);
    });
    if (!taskSaveStateRef.current[taskId]) taskSaveStateRef.current[taskId] = { saving: false, queued: null };
    const taskState = taskSaveStateRef.current[taskId];
    if (taskState.saving) { taskState.queued = { nextProduced, nextWaste, nextPrinted, nextNote }; return; }
    taskState.saving = true;
    setSavingTaskIds(prev => ({ ...prev, [taskId]: true }));
    let toSave = { nextProduced, nextWaste, nextPrinted, nextNote };
    try {
      while (toSave !== null) {
        const { nextProduced: p, nextWaste: w, nextPrinted: pr, nextNote: n } = toSave;
        let result = await supabase.rpc('update_production_task_progress', { p_task_id: taskId, p_produced_qty: Math.max(0, p), p_waste_qty: Math.max(0, w), p_note: String(n || ''), p_printed_qty: Math.max(0, pr) });
        if (result.error && (result.error.code === 'PGRST202' || /printed_qty/i.test(result.error.message || ''))) {
          result = await supabase.rpc('update_production_task_progress', { p_task_id: taskId, p_produced_qty: Math.max(0, p), p_waste_qty: Math.max(0, w), p_note: String(n || '') });
        }
        if (result.error) throw result.error;
        if (result.data) {
          const updated = result.data;
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated, id: taskId, note: updated.note ?? t.note ?? '', printed_qty: updated.printed_qty ?? t.printed_qty ?? 0 } : t));
        }
        toSave = taskState.queued;
        taskState.queued = null;
      }
    } catch {
      taskState.queued = null;
      await loadTasks();
      setTasksError('No se pudo guardar el avance.');
    } finally {
      taskState.saving = false;
      setSavingTaskIds(prev => ({ ...prev, [taskId]: false }));
    }
  }

  if (checkingSession) return <div style={{ minHeight: '100vh', background: '#f7f8fc' }} />;

  if (!session) {
    return (
      <main style={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Barlow, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 380, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 14, padding: 24, boxShadow: '0 16px 46px rgba(27,47,94,0.14)', display: 'grid', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="INKORA" style={{ height: 46, justifySelf: 'center', marginBottom: 4 }} />
          <h1 style={{ fontSize: 18, color: '#1B2F5E', textAlign: 'center', margin: 0 }}>Producción</h1>
          <p style={{ margin: 0, color: '#5a6380', fontSize: 13, lineHeight: 1.4, textAlign: 'center' }}>Ingresá con el email de Google habilitado por administración.</p>
          {authError && <div style={{ background: '#fff5f5', border: '1.5px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{authError}</div>}
          <button type="button" onClick={signInWithGoogle} disabled={signingIn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'white', color: '#2d3352', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: signingIn ? 'not-allowed' : 'pointer', opacity: signingIn ? 0.65 : 1, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <GoogleIcon />{signingIn ? 'Ingresando...' : 'Ingresar con Google'}
          </button>
        </div>
      </main>
    );
  }

  const bridgeConnected = bridgeStatus.state === 'connected' && bridgeToken.trim();

  return (
    <main style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'Barlow, sans-serif', color: '#2d3352', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ height: 48, background: '#1B2F5E', color: 'white', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="INKORA" style={{ height: 30, filter: 'brightness(0) invert(1)' }} />
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.2 }}>Producción</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.78 }}>{session.user?.email}</div>
        <button type="button" onClick={signOut} style={{ border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: 'white', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Salir</button>
      </header>

      {/* Bridge bar */}
      <div style={{ background: 'white', border: `1.5px solid ${bridgeTone.border}`, borderRadius: 10, margin: '8px 10px 0', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>Impresión</div>
        {bridgePrinters.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: bridgeTone.color }} />
            <select
              value={selectedPrinterOverride || bridgeTargetPrinter?.name || ''}
              onChange={e => setSelectedPrinterOverride(e.target.value)}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 6px', fontSize: 11, fontWeight: 800, fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', minWidth: 0, flex: 1, maxWidth: 240 }}
            >
              {bridgePrinters.map(p => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}
            </select>
          </div>
        ) : (
          <span style={{ background: bridgeTone.bg, color: bridgeTone.color, border: `1px solid ${bridgeTone.border}`, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 900 }}>
            {bridgeTone.label}
          </span>
        )}
        {!bridgeConnected && (
          <>
            <input
              type="password"
              placeholder="Token Bridge..."
              value={bridgeToken}
              onChange={e => setBridgeToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') checkPrintBridge(); }}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '4px 7px', fontSize: 11, fontFamily: 'Barlow, sans-serif', width: 160, outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => checkPrintBridge()}
              disabled={bridgeBusy}
              style={{ border: '1.5px solid #2D6BE4', borderRadius: 6, padding: '4px 10px', background: '#f8faff', color: '#2D6BE4', fontSize: 11, fontWeight: 900, cursor: bridgeBusy ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif', flexShrink: 0 }}
            >
              {bridgeBusy ? 'Conectando...' : 'Conectar'}
            </button>
          </>
        )}
        {bridgeConnected && bridgeTargetPrinter && (
          <>
            <button
              type="button"
              onClick={async () => { try { await openBridgePrinterPreferences(bridgeUrl, bridgeToken.trim(), effectivePrinterName); } catch {} }}
              disabled={bridgeBusy}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: bridgeBusy ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}
            >
              Preferencias
            </button>
            <button
              type="button"
              onClick={async () => { try { await openBridgePrintQueue(bridgeUrl, bridgeToken.trim(), effectivePrinterName); } catch {} }}
              disabled={bridgeBusy}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, cursor: bridgeBusy ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif', color: '#1B2F5E', background: 'white', flexShrink: 0 }}
            >
              Cola de impresión
            </button>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <a
            href="https://github.com/inkorashop/inkora-next/releases/download/bridge-v1.1/Inkora.PrintBridge.zip"
            style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 900, fontFamily: 'Barlow, sans-serif', color: '#5a6380', background: 'white', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block' }}
          >
            ↓ Instalar Bridge
          </a>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: bridgeConnected ? 'minmax(165px, 0.48fr) minmax(0, 1.42fr) minmax(170px, 0.47fr)' : 'minmax(220px, 0.6fr) minmax(0, 1.5fr)', gap: 10, padding: '8px 10px 10px', minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>

        {/* ── Columna 1: Pedidos ── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '7px 10px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
            <h2 style={{ fontSize: 13, fontWeight: 900, color: '#1B2F5E', margin: 0, letterSpacing: 0.2 }}>Pedidos</h2>
          </div>
          {tasksError && <div style={{ margin: '10px 12px', background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#c2410c', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{tasksError}</div>}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loadingTasks && orderRows.length === 0 ? (
              <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '36px 12px' }}>Cargando pedidos...</p>
            ) : orderRows.length === 0 ? (
              <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '36px 12px' }}>No hay pedidos asignados.</p>
            ) : orderRows.map(order => {
              const selected = selectedOrderId === order.id;
              const tone = STATUS_TONE[order.productionStatus] || STATUS_TONE.pending;
              return (
                <button key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)}
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid #eef0f6', background: selected ? '#f0f5ff' : 'white', padding: '8px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: '#1B2F5E' }}>{order.order_code || order.id}</span>
                    <span style={{ background: tone.bg, color: tone.color, borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>{STATUS_LABEL[order.productionStatus]}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2d3352' }}>{order.customer_name || 'Sin cliente'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#8b95b3' }}>
                    <span>{formatShortDate(order.created_at)}</span>
                    {order.seller_name && <span>{order.seller_name}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#5a6380', lineHeight: 1.35 }}>{order.itemsSummary}</div>
                  {order.notes && <div style={{ fontSize: 11, color: '#8b95b3', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Nota: {order.notes}</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Columna 2: Detalle ── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selectedOrder ? (
            <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '48px 16px' }}>Elegí un pedido de la lista para empezar.</p>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: '7px 12px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>Detalle</div>
                    <h2 style={{ fontSize: 14, fontWeight: 900, color: '#1B2F5E', margin: 0, letterSpacing: 0.2 }}>
                      {selectedOrder.order_code || 'Pedido seleccionado'}
                    </h2>
                    <div style={{ fontSize: 11, color: '#5a6380', marginTop: 2, lineHeight: 1.5, overflow: 'hidden' }}>
                      <span style={{ fontWeight: 700 }}>{selectedOrder.customer_name || 'Sin cliente'}</span>
                      <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                      <span>{formatShortDate(selectedOrder.created_at)}</span>
                      {selectedOrder.seller_name && <>
                        <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                        <span>{selectedOrder.seller_name}</span>
                      </>}
                      <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                      <span>{STATUS_LABEL[selectedOrder.productionStatus] || selectedOrder.productionStatus}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#8b95b3', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '1.3em' }} title={selectedOrder?.itemsSummary || ''}>{selectedOrder?.itemsSummary || ''}</div>
                    <div style={{ fontSize: 11, color: '#8b95b3', marginTop: 1, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '1.3em' }} title={selectedOrder?.notes || ''}>{selectedOrder?.notes || ''}</div>
                  </div>
                  {bridgeConnected && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: orderPdfStatus.state === 'ready' ? '#15803d' : orderPdfStatus.state === 'error' ? '#b91c1c' : '#8b95b3' }}>
                        {orderPdfStatus.message}
                      </span>
                      <button
                        type="button"
                        onClick={() => matchSelectedOrderPdfs({ scan: true })}
                        disabled={orderPdfBusy}
                        style={{ border: '1.5px solid #2D6BE4', borderRadius: 8, padding: '6px 10px', background: '#f8faff', color: '#2D6BE4', fontSize: 12, fontWeight: 900, cursor: orderPdfBusy ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif' }}
                      >
                        {orderPdfBusy ? 'Buscando PDFs...' : 'PDFs del pedido'}
                      </button>
                      {orderPdfStatus.state === 'ready' && Object.values(orderPdfMatches).some(m => m.found) && (
                        <button
                          type="button"
                          onClick={async () => {
                            for (const task of selectedOrder.tasks) {
                              await printSingleTask(task);
                            }
                          }}
                          disabled={Object.values(printingTasks).some(Boolean)}
                          style={{ border: '1.5px solid #18a36a', borderRadius: 8, padding: '6px 10px', background: '#e8f7ef', color: '#15803d', fontSize: 12, fontWeight: 900, cursor: Object.values(printingTasks).some(Boolean) ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif' }}
                        >
                          Imprimir todo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary cards */}
              <div style={{ display: 'flex', gap: 6, padding: '6px 8px 4px', flexShrink: 0, alignItems: 'stretch' }}>
                {[
                  { label: 'A producir', value: summaryTotals.required, color: '#1B2F5E', bg: '#eef4ff', border: '#c7d7f7', showBar: false },
                  { label: 'Impreso',    value: summaryTotals.printed,  color: '#15803d', bg: '#dcfce7', border: '#86efac', showBar: true },
                  { label: 'Troquelado',value: summaryTotals.produced,  color: '#b45309', bg: '#fef9c3', border: '#fde047', showBar: true },
                  { label: 'Desperdicio',value: summaryTotals.waste,    color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', showBar: true },
                ].map(({ label, value, color, bg, border, showBar }) => {
                  const pct = summaryTotals.required > 0 ? Math.round(value / summaryTotals.required * 100) : 0;
                  return (
                    <div key={label} style={{ flex: 1, background: bg, border: `1.5px solid ${border}`, borderRadius: 7, padding: '4px 8px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap', opacity: 0.75 }}>{label}</span>
                        <span style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
                        {showBar && <span style={{ fontSize: 10, fontWeight: 700, color, opacity: 0.55 }}>{pct}%</span>}
                      </div>
                      <div style={{ marginTop: 4, height: 3, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: showBar ? `${Math.min(100, pct)}%` : '100%', background: color, borderRadius: 999, transition: 'width 0.3s', opacity: showBar ? 1 : 0.25 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0, scrollbarGutter: 'stable' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 95 }} />
                    <col />
                    <col style={{ width: 46 }} />
                    <col style={{ width: 145 }} />
                    <col style={{ width: 145 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 105 }} />
                    <col style={{ width: 115 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Producto', 'Diseño', 'A producir', 'Impreso', 'Troquelado', 'Desperdicio', 'Observaciones', 'Imprimir'].map((h, i) => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 5px', fontSize: 10, fontWeight: 800, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap', ...(i === 7 ? { position: 'sticky', right: 0, background: 'white', zIndex: 2, boxShadow: '-2px 0 5px rgba(0,0,0,0.07)' } : {}) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.tasks.map(task => {
                      const pdfKey = String(task.design_id || task.design_key || task.design_name || '');
                      const pdfMatch = orderPdfMatches[pdfKey];
                      const printedEven = Math.ceil((task.required_qty || 0) / 2) * 2;
                      const remaining = Math.max(0, toQty(task.required_qty) - toQty(task.produced_qty));
                      const defaultSheets = Math.ceil(Math.max(1, remaining) / 2);
                      const taskId = task.id || pdfKey;
                      const sheets = printQtyOverrides[taskId] ?? defaultSheets;
                      const isPrinting = printingTasks[taskId];
                      const feedback = printFeedback[taskId];
                      const hasPdf = pdfMatch?.found;
                      const printDisabled = !hasPdf || isPrinting || !bridgeConnected;
                      return (
                        <tr key={task.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                          <td style={{ padding: '4px 5px', color: '#5a6380', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{task.product_name || 'Sin producto'}</td>
                          <td style={{ padding: '4px 5px', fontWeight: 800, color: '#1B2F5E', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <DesignThumb designId={String(task.design_id || '')} name={task.design_name} size={24} />
                              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.design_name || 'Sin diseño'}</span>
                              {orderPdfStatus.state === 'ready' && (
                                <span
                                  title={hasPdf ? `${pdfMatch.rootName}\\${pdfMatch.relativePath}` : 'No se encontró PDF local'}
                                  style={{ flexShrink: 0, border: '1px solid', borderColor: hasPdf ? '#b7ebcf' : '#fecaca', borderRadius: 999, padding: '1px 6px', background: hasPdf ? '#e8f7ef' : '#fff5f5', color: hasPdf ? '#15803d' : '#b91c1c', fontSize: 9, fontWeight: 900, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {hasPdf ? pdfMatch.fileName : '—'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '4px 5px', fontWeight: 900, color: '#2d3352' }}>{task.required_qty || 0}</td>
                          <td style={{ padding: '4px 5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <QtyCell value={task.printed_qty || 0} disabled={savingTaskIds[task.id]} step={2} onSave={qty => saveTask(task, { printed_qty: qty })} />
                              <button type="button" title={`Marcar ${printedEven} impreso`} onClick={() => saveTask(task, { printed_qty: printedEven })}
                                style={{ border: '1px solid #b7ebcf', borderRadius: 5, background: '#e8f7ef', color: '#15803d', fontSize: 11, fontWeight: 900, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, fontFamily: 'Barlow, sans-serif', flexShrink: 0, minWidth: 38, textAlign: 'center' }}>
                                ={printedEven}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px 5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <QtyCell value={task.produced_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { produced_qty: qty })} />
                              <button type="button" title={`Marcar ${task.required_qty} troquelado`} onClick={() => saveTask(task, { produced_qty: task.required_qty })}
                                style={{ border: '1px solid #b7ebcf', borderRadius: 5, background: '#e8f7ef', color: '#15803d', fontSize: 11, fontWeight: 900, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, fontFamily: 'Barlow, sans-serif', flexShrink: 0, minWidth: 38, textAlign: 'center' }}>
                                ={task.required_qty}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px 5px' }}>
                            <QtyCell value={task.waste_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { waste_qty: qty })} />
                          </td>
                          <td style={{ padding: '4px 5px' }}>
                            <input defaultValue={task.note || ''} disabled={savingTaskIds[task.id]}
                              onBlur={e => saveTask(task, { note: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              placeholder="Agregar observación..."
                              style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '3px 5px', fontSize: 11, fontFamily: 'Barlow, sans-serif', width: '100%', boxSizing: 'border-box', color: '#2d3352' }} />
                          </td>
                          <td style={{ padding: '4px 5px', position: 'sticky', right: 0, background: 'white', boxShadow: '-2px 0 5px rgba(0,0,0,0.07)' }}>
                            {feedback ? (
                              <span style={{ fontSize: 11, fontWeight: 900, color: feedback === 'Enviado' ? '#15803d' : '#b91c1c' }}>{feedback}</span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <input type="number" min={1} max={99} value={sheets}
                                  onChange={e => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setPrintQtyOverrides(prev => ({ ...prev, [taskId]: v })); }}
                                  onFocus={e => e.target.select()}
                                  onKeyDown={e => { if (e.key === 'Enter') printSingleTask(task, sheets); }}
                                  disabled={printDisabled}
                                  title={`Hojas a imprimir (${remaining} piezas, 2 por hoja = ${defaultSheets} auto)`}
                                  style={{ width: 32, border: `1.5px solid ${hasPdf ? '#18a36a' : '#dde1ef'}`, borderRadius: 6, padding: '4px 3px', fontSize: 12, fontWeight: 900, textAlign: 'center', fontFamily: 'Barlow, sans-serif', color: hasPdf ? '#15803d' : '#c4c9d9', background: hasPdf ? '#f0fdf7' : '#f7f8fc' }} />
                                <button type="button" onClick={() => printSingleTask(task, sheets)} disabled={printDisabled}
                                  title={!hasPdf ? 'Sin PDF vinculado' : `Imprimir ${sheets} hoja${sheets !== 1 ? 's' : ''}`}
                                  style={{ border: `1.5px solid ${hasPdf ? '#18a36a' : '#dde1ef'}`, borderRadius: 8, padding: '5px 8px', background: hasPdf ? '#e8f7ef' : '#f7f8fc', color: hasPdf ? '#15803d' : '#c4c9d9', fontSize: 11, fontWeight: 900, cursor: printDisabled ? 'not-allowed' : 'pointer', fontFamily: 'Barlow, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {isPrinting ? '...' : (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                                        <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
                                      </svg>
                                      Impr.
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Columna 3: Quick print (cuando bridge conectado) ── */}
        {bridgeConnected && (() => {
          const uniqueMap = {};
          Object.values(allPdfMatches).forEach(m => {
            if (m.found && m.relativePath && !uniqueMap[m.relativePath]) uniqueMap[m.relativePath] = m;
          });
          const allMatchedPdfs = Object.values(uniqueMap).sort((a, b) => {
            const numA = parseInt(a.fileName || '', 10);
            const numB = parseInt(b.fileName || '', 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return (a.fileName || '').localeCompare(b.fileName || '', 'es', { sensitivity: 'base' });
          });
          const search = quickPrintSearch.toLowerCase();
          const matchedPdfs = allMatchedPdfs.length > 0 && search
            ? allMatchedPdfs.filter(p => (p.fileName || '').toLowerCase().includes(search) || (p.name || '').toLowerCase().includes(search))
            : allMatchedPdfs;
          return (
            <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '7px 10px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#1B2F5E', letterSpacing: 0.2, marginBottom: 4 }}>
                  Imprimir{allMatchedPdfs.length > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: '#9aa3bc', marginLeft: 6 }}>{allMatchedPdfs.length} PDFs</span> : ''}
                </div>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={quickPrintSearch}
                  onChange={e => setQuickPrintSearch(e.target.value)}
                  disabled={allMatchedPdfs.length === 0}
                  style={{ width: '100%', padding: '4px 7px', fontSize: 11, border: '1.5px solid #dde1ef', borderRadius: 7, fontFamily: 'Barlow, sans-serif', outline: 'none', boxSizing: 'border-box', opacity: allMatchedPdfs.length === 0 ? 0.5 : 1 }}
                />
                {allMatchedPdfs.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 50px', gap: 3, marginTop: 4, padding: '0 2px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Diseño</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', textAlign: 'center' }}>x</span>
                    <span />
                  </div>
                )}
              </div>
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {allMatchedPdfs.length === 0 ? (
                  <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '18px 8px', lineHeight: 1.5 }}>
                    Sin PDFs vinculados.<br />Hacé clic en «PDFs del pedido».
                  </p>
                ) : matchedPdfs.length === 0 ? (
                  <p style={{ color: '#9aa3bc', fontSize: 11, textAlign: 'center', padding: '14px 8px' }}>Sin resultados</p>
                ) : matchedPdfs.map(pdf => {
                  const key = pdf.relativePath;
                  const label = (pdf.fileName || pdf.name || '').replace(/\.pdf$/i, '');
                  const qty = printQtyOverrides[`q_${key}`] ?? 1;
                  const printing = printingTasks[`q_${key}`] ?? false;
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 32px 50px', gap: 3, padding: '4px 7px', borderBottom: '1px solid #f0f2f8', alignItems: 'center' }}>
                      <DesignThumb designId={String(pdf.id || '')} name={pdf.name} size={22} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={pdf.fileName}>{label}</span>
                      <input type="number" min={1} max={99} value={qty}
                        onChange={e => setPrintQtyOverrides(prev => ({ ...prev, [`q_${key}`]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                        onFocus={e => e.target.select()}
                        onKeyDown={async e => {
                          if (e.key === 'Enter') {
                            setPrintingTasks(prev => ({ ...prev, [`q_${key}`]: true }));
                            try {
                              await printBridgeJob(bridgeUrl, bridgeToken.trim(), { designId: pdf.id || '', designName: pdf.name || '', productName: '', printerName: effectivePrinterName, copies: qty, orderId: selectedOrder?.id || '', orderCode: selectedOrder?.order_code || '' });
                            } catch {} finally { setPrintingTasks(prev => ({ ...prev, [`q_${key}`]: false })); }
                          }
                        }}
                        style={{ width: '100%', textAlign: 'center', padding: '3px 1px', border: '1.5px solid #dde1ef', borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', minWidth: 0 }} />
                      <button type="button" disabled={printing}
                        onClick={async () => {
                          setPrintingTasks(prev => ({ ...prev, [`q_${key}`]: true }));
                          try {
                            await printBridgeJob(bridgeUrl, bridgeToken.trim(), { designId: pdf.id || '', designName: pdf.name || '', productName: '', printerName: effectivePrinterName, copies: qty, orderId: selectedOrder?.id || '', orderCode: selectedOrder?.order_code || '' });
                          } catch {} finally { setPrintingTasks(prev => ({ ...prev, [`q_${key}`]: false })); }
                        }}
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
            </div>
          );
        })()}
      </div>
    </main>
  );
}
