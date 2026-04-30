'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';

const STATUS_CYCLE = ['pending', 'in_press', 'done'];
const STATUS_LABEL = { pending: 'Pendiente', in_press: 'En proceso', done: 'Terminado' };
const STATUS_COLOR = { pending: '#f6a800', in_press: '#2D6BE4', done: '#18a36a' };

const ORDER_STATUS_LABEL = { pending: 'Pendiente', confirmed: 'Confirmado', in_production: 'En producción', ready: 'Listo', cancelled: 'Cancelado' };
const ORDER_STATUS_COLOR = { pending: '#f6a800', confirmed: '#2D6BE4', in_production: '#6d28d9', ready: '#18a36a', cancelled: '#e53e3e' };
const DASH = '—';
const DEFAULT_SORT_ORDER = { in_press: 0, pending: 1, done: 2 };
const SORT_LABEL = { design: 'Diseño', product: 'Producto', demand: 'Demanda', stock: 'Stock', falta: 'Falta', status: 'Estado', note: 'Nota', orders: 'Pedidos' };

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
  const [val, setVal] = useState(qtyProduced === 0 ? '' : String(qtyProduced));
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(false);

  // FIX: Solo sincronizar el valor desde afuera cuando NO estamos editando
  useEffect(() => {
    if (!editingRef.current) {
      setVal(qtyProduced === 0 ? '' : String(qtyProduced));
    }
  }, [qtyProduced]);

  const handleSave = async () => {
    if (saving) return;
    editingRef.current = false;
    const qty = val === '' ? 0 : Number(val);
    if (!Number.isInteger(qty) || qty < 0) {
      setVal(qtyProduced === 0 ? '' : String(qtyProduced));
      return;
    }
    if (qty === qtyProduced) return;
    setSaving(true);
    try {
      await onSave(qty);
    } catch (error) {
      setVal(qtyProduced === 0 ? '' : String(qtyProduced));
      alert(formatProductionError(error, `No se pudo actualizar el stock: ${error.message || error}`));
    } finally {
      setSaving(false);
    }
  };

  const adjust = async (delta) => {
    if (saving) return;
    const nextQty = Math.max(0, qtyProduced + delta);
    if (nextQty === qtyProduced) return;
    editingRef.current = false;
    setVal(String(nextQty));
    setSaving(true);
    try {
      await onSave(nextQty);
    } catch (error) {
      setVal(qtyProduced === 0 ? '' : String(qtyProduced));
      alert(formatProductionError(error, `No se pudo actualizar el stock: ${error.message || error}`));
    } finally {
      setSaving(false);
    }
  };

  const handleFocus = (e) => {
    e.stopPropagation();
    editingRef.current = true;
    e.target.select();
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: 118 }}>
      <button
        type="button"
        onClick={() => adjust(-1)}
        disabled={saving || qtyProduced <= 0}
        title="Restar 1"
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #fecaca', background: qtyProduced <= 0 ? '#f7f8fc' : '#fef2f2', color: qtyProduced <= 0 ? '#c4c9d9' : '#e53e3e', fontSize: 14, fontWeight: 800, lineHeight: 1, cursor: saving || qtyProduced <= 0 ? 'not-allowed' : 'pointer' }}
      >
        -
      </button>
      <input
        type="number"
        min="0"
        step="1"
        value={val}
        placeholder="0"
        disabled={saving}
        onFocus={handleFocus}
        onChange={e => setVal(e.target.value)}
        onBlur={handleSave}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { editingRef.current = false; setVal(qtyProduced === 0 ? '' : String(qtyProduced)); e.currentTarget.blur(); }
        }}
        style={{ border: saving ? '1.5px solid #c4c9d9' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 4px', fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 700, color: '#2d3352', width: 44, textAlign: 'center', outline: 'none', boxSizing: 'border-box', background: saving ? '#f7f8fc' : 'white' }}
      />
      <button
        type="button"
        onClick={() => adjust(1)}
        disabled={saving}
        title="Sumar 1"
        style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#18a36a', fontSize: 14, fontWeight: 800, lineHeight: 1, cursor: saving ? 'wait' : 'pointer' }}
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

export default function ProductionTab({ supabase, sellers = [], products = [], orders = [] }) {
  const [activeSubTab, setActiveSubTab] = useState('queue');

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

  // Datos
  const [stock, setStock] = useState([]);
  const [prodStatus, setProdStatus] = useState([]);
  const [stockLog, setStockLog] = useState([]);

  // UI
  const [expandedRow, setExpandedRow] = useState(null);
  const [savingStatus, setSavingStatus] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  function toggleSort(key) {
    setSortRules(prev => {
      const idx = prev.findIndex(rule => rule.key === key);
      if (idx === -1) return [...prev, { key, dir: 'asc' }];
      if (prev[idx].dir === 'asc') return prev.map((rule, i) => i === idx ? { ...rule, dir: 'desc' } : rule);
      return prev.filter((_, i) => i !== idx);
    });
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

  useEffect(() => {
    loadStock();
    loadProdStatus();
    loadStockLog();

    const stockSub = supabase.channel('production-stock-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock' }, () => loadStock())
      .subscribe();
    const statusSub = supabase.channel('production-status-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_status' }, () => loadProdStatus())
      .subscribe();
    const logSub = supabase.channel('production-log-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock_log' }, () => loadStockLog())
      .subscribe();

    return () => {
      supabase.removeChannel(stockSub);
      supabase.removeChannel(statusSub);
      supabase.removeChannel(logSub);
    };
  }, [supabase, loadStock, loadProdStatus, loadStockLog]);

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

  function exportReport() {
    const lines = [];
    lines.push('INKORA — Reporte de Producción');
    lines.push(`Generado: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
    const filtersDesc = [
      filterSeller !== 'all' ? `Vendedor: ${sellers.find(s => s.id === filterSeller)?.name || filterSeller}` : null,
      filterProduct !== 'all' ? `Producto: ${products.find(p => p.id === filterProduct)?.name || filterProduct}` : null,
      filterOrderStatus !== 'all' ? `Estado pedido: ${ORDER_STATUS_LABEL[filterOrderStatus] || filterOrderStatus}` : null,
      filterProdStatus !== 'all' ? `Estado prod.: ${STATUS_LABEL[filterProdStatus] || filterProdStatus}` : null,
      filterDateFrom ? `Desde: ${filterDateFrom}` : null,
      filterDateTo ? `Hasta: ${filterDateTo}` : null,
      filterSearch ? `Cliente: ${filterSearch}` : null,
      filterDesign ? `Diseño: ${filterDesign}` : null,
    ].filter(Boolean);
    lines.push(`Filtros: ${filtersDesc.length ? filtersDesc.join(', ') : 'Ninguno'}`);
    lines.push('─'.repeat(60));
    lines.push('DISEÑO                DEMANDA  STOCK   FALTA   ESTADO PROD.');
    rows.forEach(r => {
      const d = String(r.designName).padEnd(20).slice(0, 20);
      const dem = String(r.demand).padStart(7);
      const stk = String(r.qty_produced).padStart(7);
      const flt = String(r.falta).padStart(7);
      const sts = STATUS_LABEL[r.status] || r.status;
      lines.push(`${d}  ${dem}  ${stk}  ${flt}   ${sts}`);
    });
    lines.push('─'.repeat(60));
    lines.push(`Total unidades pendientes: ${totalPending}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkora-produccion-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {errorMessage && (
        <div style={{ background: '#fff5f5', border: '1.5px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
          {errorMessage}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden', alignSelf: 'flex-start' }}>
        {[['queue', 'Cola de producción'], ['log', 'Historial de stock']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveSubTab(id)}
            style={{ border: 'none', padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', background: activeSubTab === id ? '#1B2F5E' : 'white', color: activeSubTab === id ? 'white' : '#9aa3bc', borderRight: '1.5px solid #dde1ef' }}>
            {label}
          </button>
        ))}
      </div>

      {activeSubTab === 'queue' && (
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
                  ↓ Exportar reporte
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
      )}

      {/* Sub-tab: Historial */}
      {activeSubTab === 'log' && (
        <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1.5px solid #dde1ef' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Historial de movimientos de stock</h2>
          </div>
          <div style={{ padding: 20, overflowX: 'auto' }}>
            {stockLog.length === 0 ? (
              <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Sin movimientos registrados.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Diseño', 'Tipo', 'Cantidad', 'Nota', 'Fecha'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockLog.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1B2F5E' }}>{log.design_name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ color: log.type === 'add' ? '#18a36a' : '#e53e3e', fontWeight: 700 }}>{log.type === 'add' ? '+ Entrada' : '− Salida'}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: log.type === 'add' ? '#18a36a' : '#e53e3e' }}>{log.qty}</td>
                      <td style={{ padding: '8px 10px', color: '#5a6380' }}>{log.note || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#9aa3bc', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
