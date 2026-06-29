'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
  return {
    ...task,
    id: task.id || task.task_id,
    note: task.note ?? task.task_note ?? '',
  };
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function QtyControl({ value, disabled, onSave }) {
  const [localValue, setLocalValue] = useState(String(Number(value) || 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saving) setLocalValue(String(Number(value) || 0));
  }, [value, saving]);

  async function commit(nextValue) {
    const qty = Math.max(0, Number.parseInt(nextValue, 10) || 0);
    setLocalValue(String(qty));
    setSaving(true);
    try {
      await onSave(qty);
    } finally {
      setSaving(false);
    }
  }

  function adjust(delta) {
    const current = Math.max(0, Number.parseInt(localValue, 10) || 0);
    commit(current + delta);
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: 118 }}>
      <button
        type="button"
        disabled={disabled || saving || (Number(localValue) || 0) <= 0}
        onClick={() => adjust(-1)}
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #fecaca', background: disabled || saving ? '#f7f8fc' : '#fef2f2', color: disabled || saving ? '#c4c9d9' : '#e53e3e', fontWeight: 900, cursor: disabled || saving ? 'not-allowed' : 'pointer' }}
      >
        -
      </button>
      <input
        type="number"
        min="0"
        step="1"
        disabled={disabled || saving}
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={() => commit(localValue)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ width: 44, border: '1.5px solid #dde1ef', borderRadius: 6, padding: '4px 5px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#2d3352', fontFamily: 'Barlow, sans-serif', background: disabled ? '#f4f5f8' : 'white' }}
      />
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => adjust(1)}
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #bbf7d0', background: disabled || saving ? '#f7f8fc' : '#f0fdf4', color: disabled || saving ? '#c4c9d9' : '#18a36a', fontWeight: 900, cursor: disabled || saving ? 'not-allowed' : 'pointer' }}
      >
        +
      </button>
    </div>
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
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
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
        order_status: first.order_status,
        notes: first.order_notes || '',
        operator_name: first.operator_name,
        tasks: orderTasks.sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || ''), 'es') || String(a.design_name || '').localeCompare(String(b.design_name || ''), 'es')),
        productionStatus: getProductionStatus(orderTasks),
        summary: summarizeProducts(orderTasks),
      };
    }).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }, [tasks]);

  useEffect(() => {
    if (orderRows.length === 0) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !orderRows.some(row => row.id === selectedOrderId)) {
      setSelectedOrderId(orderRows[0].id);
    }
  }, [orderRows, selectedOrderId]);

  const selectedOrder = orderRows.find(row => row.id === selectedOrderId) || null;

  async function signInWithGoogle() {
    setSigningIn(true);
    setAuthError('');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://www.inkora.com.ar/auth/popup-callback',
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      setAuthError('No se pudo iniciar sesión con Google.');
      setSigningIn(false);
      return;
    }

    const popup = window.open(data.url, 'operator-google-auth', 'width=500,height=600,top=100,left=100');
    window.addEventListener('message', function handler(e) {
      if (!['https://www.inkora.com.ar', 'https://inkora.com.ar'].includes(e.origin)) return;
      if (e.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', handler);
        popup?.close();
        supabase.auth.getSession().then(({ data: sessionData }) => {
          setSession(sessionData.session || null);
          setSigningIn(false);
        });
      }
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTasks([]);
    setSelectedOrderId(null);
  }

  async function saveTask(task, patch) {
    const taskId = task.id;
    const nextProduced = patch.produced_qty !== undefined ? patch.produced_qty : task.produced_qty;
    const nextWaste = patch.waste_qty !== undefined ? patch.waste_qty : task.waste_qty;
    const nextNote = patch.note !== undefined ? patch.note : task.note;

    setSavingTaskIds(prev => ({ ...prev, [taskId]: true }));
    setTasks(prev => prev.map(row => row.id === taskId ? { ...row, ...patch } : row));

    const { error } = await supabase.rpc('update_production_task_progress', {
      p_task_id: taskId,
      p_produced_qty: Math.max(0, Number(nextProduced) || 0),
      p_waste_qty: Math.max(0, Number(nextWaste) || 0),
      p_note: String(nextNote || ''),
    });

    if (error) {
      setTasksError('No se pudo guardar el avance.');
      await loadTasks();
    } else {
      await loadTasks();
    }
    setSavingTaskIds(prev => ({ ...prev, [taskId]: false }));
  }

  if (checkingSession) {
    return <div style={{ minHeight: '100vh', background: '#f7f8fc' }} />;
  }

  if (!session) {
    return (
      <main style={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Barlow, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 380, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 14, padding: 24, boxShadow: '0 16px 46px rgba(27,47,94,0.14)', display: 'grid', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="INKORA" style={{ height: 46, justifySelf: 'center', marginBottom: 4 }} />
          <h1 style={{ fontSize: 18, color: '#1B2F5E', textAlign: 'center', margin: 0 }}>Producción</h1>
          <p style={{ margin: 0, color: '#5a6380', fontSize: 13, lineHeight: 1.4, textAlign: 'center' }}>
            Ingresá con el email de Google habilitado por administración.
          </p>
          {authError && <div style={{ background: '#fff5f5', border: '1.5px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{authError}</div>}
          <button type="button" onClick={signInWithGoogle} disabled={signingIn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'white', color: '#2d3352', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: signingIn ? 'not-allowed' : 'pointer', opacity: signingIn ? 0.65 : 1, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <GoogleIcon />
            {signingIn ? 'Ingresando...' : 'Ingresar con Google'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}>
      <header style={{ height: 54, background: '#1B2F5E', color: 'white', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', position: 'sticky', top: 0, zIndex: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="INKORA" style={{ height: 34, filter: 'brightness(0) invert(1)' }} />
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2 }}>Producción</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.78 }}>{session.user?.email}</div>
        <button type="button" onClick={signOut} style={{ border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: 'white', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Salir</button>
      </header>

      <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'minmax(320px, 0.85fr) minmax(520px, 1.45fr)', gap: 16, alignItems: 'start' }}>
        <section style={{ background: 'white', border: '1.5px solid #dde1ef', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1.5px solid #dde1ef', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#1B2F5E' }}>Pedidos</h2>
            <button type="button" onClick={loadTasks} disabled={loadingTasks} style={{ border: '1.5px solid #dde1ef', background: '#f8faff', color: '#1B2F5E', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: loadingTasks ? 'not-allowed' : 'pointer' }}>Actualizar</button>
          </div>

          {tasksError && <div style={{ margin: 12, background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#c2410c', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>{tasksError}</div>}

          <div style={{ maxHeight: 'calc(100vh - 112px)', overflowY: 'auto' }}>
            {loadingTasks && orderRows.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9aa3bc', padding: '42px 14px', fontSize: 13 }}>Cargando pedidos...</p>
            ) : orderRows.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9aa3bc', padding: '42px 14px', fontSize: 13 }}>No hay pedidos asignados.</p>
            ) : orderRows.map(order => {
              const selected = selectedOrderId === order.id;
              const tone = STATUS_TONE[order.productionStatus] || STATUS_TONE.pending;
              return (
                <button key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eef0f6', background: selected ? '#f0f5ff' : 'white', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: '#1B2F5E' }}>{order.order_code || order.id}</span>
                    <span style={{ background: tone.bg, color: tone.color, borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>{STATUS_LABEL[order.productionStatus]}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2d3352' }}>{order.customer_name || 'Sin cliente'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#8b95b3' }}>
                    <span>{formatDate(order.created_at)}</span>
                    <span>{order.seller_name || 'Sin vendedor'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#5a6380', lineHeight: 1.35 }}>{order.summary}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ background: 'white', border: '1.5px solid #dde1ef', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1.5px solid #dde1ef' }}>
            <h2 style={{ margin: 0, fontSize: 15, color: '#1B2F5E' }}>{selectedOrder?.order_code || 'Detalle'}</h2>
            {selectedOrder && <div style={{ fontSize: 12, color: '#8b95b3', marginTop: 3 }}>{selectedOrder.customer_name || 'Sin cliente'} · {formatDate(selectedOrder.created_at)}</div>}
          </div>

          {!selectedOrder ? (
            <p style={{ textAlign: 'center', color: '#9aa3bc', padding: '58px 14px', fontSize: 13 }}>Elegí un pedido para trabajar.</p>
          ) : (
            <>
              <div style={{ padding: '12px 16px', background: '#fbfcff', borderBottom: '1px solid #eef0f6', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div><div style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Cliente</div><div style={{ fontSize: 12, fontWeight: 800 }}>{selectedOrder.customer_name || '-'}</div></div>
                <div><div style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Vendedor</div><div style={{ fontSize: 12, fontWeight: 800 }}>{selectedOrder.seller_name || '-'}</div></div>
                <div><div style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Estado</div><div style={{ fontSize: 12, fontWeight: 800 }}>{STATUS_LABEL[selectedOrder.productionStatus]}</div></div>
                <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Items</div><div style={{ fontSize: 12, color: '#5a6380' }}>{selectedOrder.summary}</div></div>
                {selectedOrder.notes && <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase' }}>Observaciones</div><div style={{ fontSize: 12, color: '#5a6380' }}>{selectedOrder.notes}</div></div>}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Producto', 'Diseño', 'A producir', 'Producido', 'Desperdicio', 'Observaciones'].map(header => (
                        <th key={header} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.tasks.map(task => (
                      <tr key={task.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                        <td style={{ padding: '8px 10px', color: '#5a6380' }}>{task.product_name || 'Sin producto'}</td>
                        <td style={{ padding: '8px 10px', color: '#1B2F5E', fontWeight: 900 }}>{task.design_name || 'Sin diseño'}</td>
                        <td style={{ padding: '8px 10px', color: '#2d3352', fontWeight: 900 }}>{task.required_qty || 0}</td>
                        <td style={{ padding: '8px 10px' }}><QtyControl value={task.produced_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { produced_qty: qty })} /></td>
                        <td style={{ padding: '8px 10px' }}><QtyControl value={task.waste_qty || 0} disabled={savingTaskIds[task.id]} onSave={qty => saveTask(task, { waste_qty: qty })} /></td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            defaultValue={task.note || ''}
                            disabled={savingTaskIds[task.id]}
                            onBlur={e => saveTask(task, { note: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Agregar observación..."
                            style={{ minWidth: 180, border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 8px', color: '#2d3352', fontSize: 12, fontFamily: 'Barlow, sans-serif' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
