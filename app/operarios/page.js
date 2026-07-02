'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DesignThumb from '@/components/DesignThumb';

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

function formatDate(iso) {
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

// StockCell-like control matching admin production tab style
function QtyCell({ value, disabled, onSave }) {
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
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, width: 90 }}>
      <button type="button" disabled={disabled || saving || num <= 0} onClick={() => adjust(-1)}
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #fecaca', background: num <= 0 || disabled || saving ? '#f7f8fc' : '#fef2f2', color: num <= 0 || disabled || saving ? '#c4c9d9' : '#e53e3e', fontWeight: 900, cursor: num <= 0 || disabled || saving ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1 }}>-</button>
      <input type="number" min="0" value={val} disabled={disabled || saving}
        onChange={e => setVal(e.target.value)}
        onBlur={() => commit(val)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 4px', fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 700, color: '#2d3352', width: 44, textAlign: 'center', outline: 'none', boxSizing: 'border-box', background: disabled || saving ? '#f4f5f8' : 'white' }} />
      <button type="button" disabled={disabled || saving} onClick={() => adjust(1)}
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
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [savingTaskIds, setSavingTaskIds] = useState({});

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
      setTasks((data || []).map(normalizeTask));
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
        order_notes: first.order_notes || '',
        tasks: orderTasks.sort((a, b) =>
          String(a.product_name || '').localeCompare(String(b.product_name || ''), 'es') ||
          String(a.design_name || '').localeCompare(String(b.design_name || ''), 'es')),
        productionStatus: getProductionStatus(orderTasks),
        summary: summarizeProducts(orderTasks),
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
    const cur = tasks.find(t => t.id === taskId) || task;
    const nextProduced = patch.produced_qty !== undefined ? patch.produced_qty : toQty(cur.produced_qty);
    const nextWaste    = patch.waste_qty    !== undefined ? patch.waste_qty    : toQty(cur.waste_qty);
    const nextPrinted  = patch.printed_qty  !== undefined ? patch.printed_qty  : toQty(cur.printed_qty);
    const nextNote     = patch.note         !== undefined ? patch.note         : (cur.note || '');

    setSavingTaskIds(prev => ({ ...prev, [taskId]: true }));
    setTasks(prev => prev.map(r => r.id === taskId ? { ...r, ...patch } : r));

    let result = await supabase.rpc('update_production_task_progress', {
      p_task_id: taskId,
      p_produced_qty: Math.max(0, nextProduced),
      p_waste_qty:    Math.max(0, nextWaste),
      p_note:         String(nextNote || ''),
      p_printed_qty:  Math.max(0, nextPrinted),
    });
    if (result.error && (result.error.code === 'PGRST202' || /printed_qty/i.test(result.error.message || ''))) {
      result = await supabase.rpc('update_production_task_progress', {
        p_task_id: taskId, p_produced_qty: Math.max(0, nextProduced),
        p_waste_qty: Math.max(0, nextWaste), p_note: String(nextNote || ''),
      });
    }
    if (result.error) { setTasksError('No se pudo guardar el avance.'); await loadTasks(); }
    setSavingTaskIds(prev => ({ ...prev, [taskId]: false }));
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

  const tone = STATUS_TONE[selectedOrder?.productionStatus] || STATUS_TONE.pending;

  return (
    <main style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'Barlow, sans-serif', color: '#2d3352', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ height: 48, background: '#1B2F5E', color: 'white', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="INKORA" style={{ height: 30, filter: 'brightness(0) invert(1)' }} />
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.2 }}>Producción</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.78 }}>{session.user?.email}</div>
        <button type="button" onClick={signOut} style={{ border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: 'white', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Salir</button>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(260px, 0.7fr) 1fr', gap: 12, padding: 12, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Columna 1: Pedidos ── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1.5px solid #dde1ef', flexShrink: 0 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1B2F5E' }}>Pedidos</h2>
          </div>
          {tasksError && <div style={{ margin: '10px 12px', background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#c2410c', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{tasksError}</div>}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingTasks && orderRows.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9aa3bc', padding: '42px 14px', fontSize: 13 }}>Cargando pedidos...</p>
            ) : orderRows.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9aa3bc', padding: '42px 14px', fontSize: 13 }}>No hay pedidos asignados.</p>
            ) : orderRows.map(order => {
              const selected = selectedOrderId === order.id;
              const t = STATUS_TONE[order.productionStatus] || STATUS_TONE.pending;
              return (
                <button key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)}
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid #eef0f6', background: selected ? '#eef4ff' : 'white', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: '#1B2F5E' }}>{order.order_code || order.id}</span>
                    <span style={{ background: t.bg, color: t.color, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{STATUS_LABEL[order.productionStatus]}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2d3352' }}>{order.customer_name || 'Sin cliente'}</div>
                  <div style={{ fontSize: 11, color: '#8b95b3' }}>{formatDate(order.created_at)}{order.seller_name ? ` · ${order.seller_name}` : ''}</div>
                  <div style={{ fontSize: 11, color: '#5a6380', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.summary}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Columna 2: Detalle ── */}
        <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedOrder ? (
            <p style={{ textAlign: 'center', color: '#9aa3bc', padding: '58px 14px', fontSize: 13 }}>Elegí un pedido para trabajar.</p>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: '8px 14px', borderBottom: '1.5px solid #dde1ef', background: '#f7f8fc', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Detalle</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 900, color: '#1B2F5E', margin: 0 }}>{selectedOrder.order_code || 'Pedido'}</h2>
                    <div style={{ fontSize: 11, color: '#5a6380', marginTop: 2 }}>
                      <span style={{ fontWeight: 700 }}>{selectedOrder.customer_name || 'Sin cliente'}</span>
                      <span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span>
                      <span>{formatDate(selectedOrder.created_at)}</span>
                      {selectedOrder.seller_name && <><span style={{ color: '#c0c5d4', margin: '0 4px' }}>·</span><span>{selectedOrder.seller_name}</span></>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8b95b3', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedOrder.summary}</div>
                    <div style={{ fontSize: 11, color: '#8b95b3', marginTop: 1, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '1.3em' }}>{selectedOrder.order_notes || ''}</div>
                  </div>
                  <span style={{ background: tone.bg, color: tone.color, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{STATUS_LABEL[selectedOrder.productionStatus]}</span>
                </div>
              </div>

              {/* Summary cards */}
              <div style={{ display: 'flex', gap: 6, padding: '6px 10px 4px', flexShrink: 0, alignItems: 'stretch' }}>
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
              <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', scrollbarGutter: 'stable' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 80 }} />
                    <col />
                    <col style={{ width: 46 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Producto', 'Diseño', 'A prod.', 'Impreso', 'Troquelado', 'Desperdicio', 'Observaciones'].map((h, i) => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, fontWeight: 800, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.tasks.map(task => (
                      <tr key={task.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                        <td style={{ padding: '4px 6px', color: '#5a6380', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{task.product_name || 'Sin producto'}</td>
                        <td style={{ padding: '4px 6px', fontWeight: 800, color: '#1B2F5E', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <DesignThumb designId={String(task.design_id || '')} name={task.design_name} size={24} />
                            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.design_name || 'Sin diseño'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '4px 6px', fontWeight: 900, color: '#2d3352' }}>{task.required_qty || 0}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <QtyCell value={task.printed_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { printed_qty: qty })} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <QtyCell value={task.produced_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { produced_qty: qty })} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <QtyCell value={task.waste_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { waste_qty: qty })} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input defaultValue={task.note || ''} disabled={savingTaskIds[task.id]}
                            onBlur={e => saveTask(task, { note: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Observación..."
                            style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '3px 5px', fontSize: 11, fontFamily: 'Barlow, sans-serif', width: '100%', boxSizing: 'border-box', color: '#2d3352' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
