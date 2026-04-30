'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';

const STATUS_CYCLE = ['pending', 'in_press', 'done'];
const STATUS_LABEL = { pending: 'Pendiente', in_press: 'En prensa', done: 'Listo' };
const STATUS_COLOR = { pending: '#f6a800', in_press: '#2D6BE4', done: '#18a36a' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isUrgent(ordersForDesign) {
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return ordersForDesign.some(o => o.status === 'pending' && new Date(o.created_at).getTime() < threeDaysAgo);
}

function ColHeader({ label, filter, active }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <th ref={ref} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: active ? '#2D6BE4' : '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap', background: 'white', position: 'relative', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {label}
        <span style={{ fontSize: 10, color: active ? '#2D6BE4' : '#c4c9d9' }}>{active ? '●' : '▾'}</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8, padding: 6, minWidth: 160, boxShadow: '0 4px 16px rgba(27,47,94,0.12)' }}
          onClick={e => e.stopPropagation()}>
          {filter}
        </div>
      )}
    </th>
  );
}

function NoteCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.note || '');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setVal(row.note || ''); }, [row.note]);

  const handleSave = (v) => {
    setEditing(false);
    onSave(v);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)}
        style={{ color: saved ? '#18a36a' : val ? '#2d3352' : '#c4c9d9', cursor: 'text', fontSize: 12, display: 'block', minWidth: 80, padding: '2px 4px', borderRadius: 4, border: `1.5px solid ${saved ? '#18a36a' : 'transparent'}`, transition: 'color 0.3s, border-color 0.3s' }}
        title="Click para editar">
        {saved ? '✓ Guardado' : val || 'Agregar nota...'}
      </span>
    );
  }
  return (
    <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => handleSave(val)}
      onKeyDown={e => { if (e.key === 'Enter') handleSave(val); if (e.key === 'Escape') { setEditing(false); setVal(row.note || ''); } }}
      style={{ border: '1.5px solid #2D6BE4', borderRadius: 6, padding: '3px 6px', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#2d3352', minWidth: 120, outline: 'none' }}
    />
  );
}

function StockCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(row.qty_produced));

  useEffect(() => { setVal(String(row.qty_produced)); }, [row.qty_produced]);

  const handleSave = () => {
    const qty = parseInt(val);
    if (!isNaN(qty) && qty >= 0 && qty !== row.qty_produced) {
      onSave(qty);
    } else {
      setVal(String(row.qty_produced));
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <span onClick={e => { e.stopPropagation(); setEditing(true); }}
        style={{ display: 'inline-block', minWidth: 40, textAlign: 'center', fontWeight: 600, color: '#2d3352', cursor: 'text', padding: '2px 6px', borderRadius: 4, border: '1.5px solid transparent', fontSize: 13 }}
        title="Click para editar">
        {row.qty_produced}
      </span>
    );
  }
  return (
    <input autoFocus type="number" min="0" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={handleSave}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditing(false); setVal(String(row.qty_produced)); } }}
      style={{ border: '1.5px solid #2D6BE4', borderRadius: 6, padding: '3px 6px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#2d3352', width: 70, textAlign: 'center', outline: 'none' }}
    />
  );
}

export default function ProductionTab({ supabase, sellers, products, orders }) {
  const [activeSubTab, setActiveSubTab] = useState('queue');

  // Filtros
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Datos
  const [stock, setStock] = useState([]);
  const [prodStatus, setProdStatus] = useState([]);
  const [stockLog, setStockLog] = useState([]);

  // UI
  const [expandedRow, setExpandedRow] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [stockQty, setStockQty] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [savingStatus, setSavingStatus] = useState({});

  const loadStock = useCallback(async () => {
    const { data } = await supabase.from('production_stock').select('*');
    if (data) setStock(data);
  }, [supabase]);

  const loadProdStatus = useCallback(async () => {
    const { data } = await supabase.from('production_status').select('*');
    if (data) setProdStatus(data);
  }, [supabase]);

  const loadStockLog = useCallback(async () => {
    const { data } = await supabase.from('production_stock_log').select('*').order('created_at', { ascending: false }).limit(200);
    if (data) setStockLog(data);
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
  }, [loadStock, loadProdStatus, loadStockLog]);

  // Filtrar pedidos
  const filteredOrders = orders.filter(o => {
    if (filterSeller === 'none' && o.seller_id) return false;
    if (filterSeller !== 'all' && filterSeller !== 'none' && o.seller_id !== filterSeller) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterDateFrom && new Date(o.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo && new Date(o.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!o.customer_name?.toLowerCase().includes(q) && !o.customer_email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Agrupar por diseño
  const designMap = {};
  filteredOrders.forEach(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach(item => {
      if (filterProduct !== 'all') {
        if (item.product_id !== filterProduct) return;
      }
      const key = item.name?.toLowerCase() || '';
      if (!designMap[key]) {
        designMap[key] = { designName: item.name, productName: item.productName || '—', demand: 0, orders: [] };
      }
      designMap[key].demand += item.qty || 0;
      if (!designMap[key].orders.find(o => o.id === order.id)) {
        designMap[key].orders.push(order);
      }
    });
  });

  const rows = Object.values(designMap).map(row => {
    const stockRow = stock.find(s => s.design_name?.toLowerCase() === row.designName?.toLowerCase());
    const statusRow = prodStatus.find(s => s.design_name?.toLowerCase() === row.designName?.toLowerCase());
    const qty_produced = stockRow?.qty_produced || 0;
    const falta = row.demand - qty_produced;
    const status = statusRow?.status || 'pending';
    const note = statusRow?.note || '';
    return { ...row, qty_produced, falta, status, note, stockId: stockRow?.id, statusId: statusRow?.id };
  });

  rows.sort((a, b) => {
    const order = { in_press: 0, pending: 1, done: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status === 'pending') return b.falta - a.falta;
    return 0;
  });

  const totalDesigns = rows.length;
  const totalPending = rows.reduce((acc, r) => acc + Math.max(0, r.falta), 0);
  const totalProduced = stock.reduce((acc, s) => acc + (s.qty_produced || 0), 0);
  const totalOrders = filteredOrders.length;
  const totalExcess = rows.filter(r => r.falta < 0).length;
  const hasFilters = filterSeller !== 'all' || filterProduct !== 'all' || filterStatus !== 'all' || filterDateFrom || filterDateTo || filterSearch;

  async function cycleStatus(row) {
    setSavingStatus(prev => ({ ...prev, [row.designName]: true }));
    const current = STATUS_CYCLE.indexOf(row.status);
    const next = STATUS_CYCLE[(current + 1) % STATUS_CYCLE.length];
    if (row.statusId) {
      await supabase.from('production_status').update({ status: next, updated_at: new Date().toISOString() }).eq('id', row.statusId);
    } else {
      await supabase.from('production_status').insert({ design_name: row.designName, status: next });
    }
    await loadProdStatus();
    setSavingStatus(prev => ({ ...prev, [row.designName]: false }));
  }

  async function saveNote(row, note) {
    if (row.statusId) {
      await supabase.from('production_status').update({ note, updated_at: new Date().toISOString() }).eq('id', row.statusId);
    } else {
      await supabase.from('production_status').insert({ design_name: row.designName, note, status: row.status || 'pending' });
    }
    await loadProdStatus();
  }

  async function saveStockInline(row, newQty) {
    const existing = stock.find(s => s.design_name?.toLowerCase() === row.designName?.toLowerCase());
    const delta = newQty - (existing?.qty_produced || 0);
    if (existing) {
      await supabase.from('production_stock').update({ qty_produced: newQty }).eq('id', existing.id);
    } else {
      await supabase.from('production_stock').insert({ design_name: row.designName, qty_produced: newQty });
    }
    await supabase.from('production_stock_log').insert({
      design_name: row.designName,
      qty: Math.abs(delta),
      type: delta >= 0 ? 'add' : 'subtract',
      note: 'Edición inline',
    });
    await loadStock();
    await loadStockLog();
  }

  async function confirmStock() {
    if (!stockQty || isNaN(parseInt(stockQty)) || parseInt(stockQty) <= 0) return;
    setSavingStock(true);
    const qty = parseInt(stockQty);
    const { designName, designId, type } = stockModal;
    const existing = stock.find(s => s.design_name?.toLowerCase() === designName?.toLowerCase());
    const currentQty = existing?.qty_produced || 0;
    if (type === 'subtract' && qty > currentQty) {
      alert(`No podés restar más de lo que hay en stock (${currentQty} unidades).`);
      setSavingStock(false);
      return;
    }
    const delta = type === 'add' ? qty : -qty;
    const newQty = Math.max(0, currentQty + delta);
    if (existing) {
      await supabase.from('production_stock').update({ qty_produced: newQty }).eq('id', existing.id);
    } else {
      await supabase.from('production_stock').insert({ design_name: designName, design_id: designId || null, qty_produced: Math.max(0, delta) });
    }
    await supabase.from('production_stock_log').insert({
      design_name: designName,
      design_id: designId || null,
      qty,
      type,
      note: stockNote || null,
    });
    await loadStock();
    await loadStockLog();
    setSavingStock(false);
    setStockModal(null);
    setStockQty('');
    setStockNote('');
  }

  function exportReport() {
    const lines = [];
    lines.push('INKORA — Reporte de Producción');
    lines.push(`Generado: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
    const filtersDesc = [
      filterSeller !== 'all' ? `Vendedor: ${sellers.find(s => s.id === filterSeller)?.name || filterSeller}` : null,
      filterProduct !== 'all' ? `Producto: ${products.find(p => p.id === filterProduct)?.name || filterProduct}` : null,
      filterStatus !== 'all' ? `Estado pedido: ${filterStatus}` : null,
      filterDateFrom ? `Desde: ${filterDateFrom}` : null,
      filterDateTo ? `Hasta: ${filterDateTo}` : null,
      filterSearch ? `Búsqueda: ${filterSearch}` : null,
    ].filter(Boolean);
    lines.push(`Filtros: ${filtersDesc.length ? filtersDesc.join(', ') : 'Ninguno'}`);
    lines.push('─'.repeat(52));
    lines.push('DISEÑO                DEMANDA  STOCK   FALTA   ESTADO');
    rows.forEach(r => {
      const d = String(r.designName).padEnd(20).slice(0, 20);
      const dem = String(r.demand).padStart(7);
      const stk = String(r.qty_produced).padStart(7);
      const flt = String(r.falta).padStart(7);
      const sts = STATUS_LABEL[r.status] || r.status;
      lines.push(`${d}  ${dem}  ${stk}  ${flt}   ${sts}`);
    });
    lines.push('─'.repeat(52));
    lines.push(`Total unidades pendientes: ${totalPending}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkora-produccion-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inp = { border: '1.5px solid #dde1ef', borderRadius: 7, padding: '7px 10px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#2d3352', background: 'white', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, display: 'block' };

  const optionStyle = (active) => ({
    padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
    fontWeight: active ? 700 : 400,
    background: active ? '#eef4ff' : 'transparent',
    color: active ? '#2D6BE4' : '#2d3352',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { label: 'Diseños distintos', value: totalDesigns, color: '#1B2F5E' },
              { label: 'Unidades pendientes', value: totalPending, color: totalPending > 0 ? '#e53e3e' : '#18a36a' },
              { label: 'Stock global producido', value: totalProduced, color: '#2D6BE4' },
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
          <div style={{ background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1.5px solid #dde1ef' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Cola de producción</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {hasFilters && (
                  <button onClick={() => { setFilterSeller('all'); setFilterProduct('all'); setFilterStatus('all'); setFilterDateFrom(''); setFilterDateTo(''); setFilterSearch(''); }}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'white', color: '#9aa3bc' }}>
                    ✕ Limpiar filtros
                  </button>
                )}
                <button onClick={exportReport}
                  style={{ background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ↓ Exportar reporte
                </button>
              </div>
            </div>

            {/* Barra filtros externos sticky */}
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f7f8fc', borderBottom: '1px solid #dde1ef', padding: '8px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Vendedor</span>
                <select value={filterSeller} onChange={e => setFilterSeller(e.target.value)}
                  style={{ border: filterSeller !== 'all' ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', color: filterSeller !== 'all' ? '#2D6BE4' : '#5a6380', background: 'white', cursor: 'pointer' }}>
                  <option value="all">Todos</option>
                  <option value="none">Sin vendedor</option>
                  {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cliente</span>
                <input type="text" placeholder="Buscar..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                  style={{ border: filterSearch ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', color: '#2d3352', background: 'white', width: 110 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Fecha</span>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  style={{ border: filterDateFrom ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', background: 'white' }} />
                <span style={{ fontSize: 11, color: '#9aa3bc' }}>→</span>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  style={{ border: filterDateTo ? '1.5px solid #2D6BE4' : '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', background: 'white' }} />
              </div>
            </div>

            {rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa3bc' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <p style={{ fontSize: 14 }}>No hay diseños en la cola con los filtros actuales.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 49, zIndex: 9, background: 'white' }}>
                    <tr>
                      <ColHeader label="Diseño" active={!!filterSearch} filter={
                        <input type="text" placeholder="Filtrar diseño..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} autoFocus
                          style={{ border: '1.5px solid #dde1ef', borderRadius: 5, padding: '5px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', width: '100%', outline: 'none' }} />
                      } />
                      <ColHeader label="Producto" active={filterProduct !== 'all'} filter={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {[{ id: 'all', name: 'Todos' }, ...products].map(p => (
                            <div key={p.id} onClick={() => setFilterProduct(p.id)} style={optionStyle(filterProduct === p.id)}>{p.name}</div>
                          ))}
                        </div>
                      } />
                      <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', textAlign: 'center', whiteSpace: 'nowrap', background: 'white' }}>Demanda</th>
                      <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', textAlign: 'center', whiteSpace: 'nowrap', background: 'white' }}>Stock</th>
                      <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', textAlign: 'center', whiteSpace: 'nowrap', background: 'white' }}>Falta</th>
                      <ColHeader label="Estado prod." active={false} filter={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {STATUS_CYCLE.map(s => (
                            <div key={s} style={{ padding: '5px 8px', borderRadius: 5, fontSize: 12, color: STATUS_COLOR[s], fontWeight: 600 }}>{STATUS_LABEL[s]}</div>
                          ))}
                        </div>
                      } />
                      <ColHeader label="Estado pedido" active={filterStatus !== 'all'} filter={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {[['all','Todos'],['pending','Pendiente'],['confirmed','Confirmado'],['in_production','En producción'],['ready','Listo'],['cancelled','Cancelado']].map(([val, label]) => (
                            <div key={val} onClick={() => setFilterStatus(val)} style={optionStyle(filterStatus === val)}>{label}</div>
                          ))}
                        </div>
                      } />
                      <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap', background: 'white' }}>Nota</th>
                      <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', textAlign: 'center', whiteSpace: 'nowrap', background: 'white' }}>Pedidos</th>
                      <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap', background: 'white' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const isExpanded = expandedRow === row.designName;
                      const urgent = isUrgent(row.orders);
                      const rowBg = row.falta <= 0 ? 'rgba(24,163,106,0.06)' : 'transparent';
                      return (
                        <React.Fragment key={row.designName}>
                          <tr style={{ borderBottom: '1px solid #f0f2f8', background: rowBg }}>
                            <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1B2F5E', whiteSpace: 'nowrap' }}>
                              {row.designName}
                              {urgent && <span style={{ marginLeft: 6, fontSize: 11 }}>🔴 <span style={{ color: '#e53e3e', fontWeight: 700 }}>Urgente</span></span>}
                              {row.falta < 0 && <span style={{ marginLeft: 6, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>Exceso +{Math.abs(row.falta)}</span>}
                            </td>
                            <td style={{ padding: '10px 10px', color: '#5a6380' }}>{row.productName}</td>
                            <td style={{ padding: '10px 10px', fontWeight: 600, color: '#2d3352', textAlign: 'center' }}>{row.demand}</td>
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              <StockCell row={row} onSave={(qty) => saveStockInline(row, qty)} />
                            </td>
                            <td style={{ padding: '10px 10px', fontWeight: 700, color: row.falta > 0 ? '#e53e3e' : '#18a36a', textAlign: 'center' }}>{row.falta}</td>
                            <td style={{ padding: '10px 10px' }}>
                              <button onClick={() => cycleStatus(row)} disabled={savingStatus[row.designName]}
                                style={{ background: `${STATUS_COLOR[row.status]}20`, color: STATUS_COLOR[row.status], border: `1.5px solid ${STATUS_COLOR[row.status]}`, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {STATUS_LABEL[row.status]}
                              </button>
                            </td>
                            <td style={{ padding: '10px 10px', color: '#5a6380', fontSize: 11 }}>—</td>
                            <td style={{ padding: '10px 10px' }}>
                              <NoteCell row={row} onSave={(note) => saveNote(row, note)} />
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              <button onClick={() => setExpandedRow(isExpanded ? null : row.designName)}
                                style={{ background: 'none', border: '1.5px solid #dde1ef', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#5a6380', fontWeight: 600 }}>
                                {row.orders.length} {isExpanded ? '▲' : '▼'}
                              </button>
                            </td>
                            <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                              <button onClick={() => { setStockModal({ designName: row.designName, designId: null, type: 'add' }); setStockQty(''); setStockNote(''); }}
                                style={{ background: '#e8f5e9', color: '#18a36a', border: '1.5px solid #18a36a', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>+</button>
                              <button onClick={() => { setStockModal({ designName: row.designName, designId: null, type: 'subtract' }); setStockQty(''); setStockNote(''); }}
                                style={{ background: '#fef2f2', color: '#e53e3e', border: '1.5px solid #e53e3e', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>−</button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={10} style={{ padding: '0 10px 12px 30px', background: '#f7f8fc' }}>
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
                                      const qty = items.filter(i => i.name?.toLowerCase() === row.designName?.toLowerCase()).reduce((acc, i) => acc + (i.qty || 0), 0);
                                      const sColor = { pending: '#f6a800', confirmed: '#2D6BE4', in_production: '#6d28d9', ready: '#18a36a', cancelled: '#e53e3e' };
                                      const sLabel = { pending: 'Pendiente', confirmed: 'Confirmado', in_production: 'En producción', ready: 'Listo', cancelled: 'Cancelado' };
                                      return (
                                        <tr key={o.id} style={{ borderBottom: '1px solid #eef0f6' }}>
                                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1B2F5E' }}>{o.order_code}</td>
                                          <td style={{ padding: '6px 8px', color: '#2d3352' }}>{o.customer_name || '—'}</td>
                                          <td style={{ padding: '6px 8px', color: '#5a6380' }}>{formatDate(o.created_at)}</td>
                                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1B2F5E' }}>{qty}</td>
                                          <td style={{ padding: '6px 8px' }}>
                                            <span style={{ background: `${sColor[o.status]}20`, color: sColor[o.status], borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                                              {sLabel[o.status] || o.status}
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
            )}
          </div>
        </>
      )}

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

      {/* Modal stock */}
      {stockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden' }}>
            <div style={{ background: '#1B2F5E', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 15 }}>
              <span>{stockModal.type === 'add' ? '+ Agregar stock' : '− Restar stock'}</span>
              <button onClick={() => setStockModal(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Diseño</label>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1B2F5E' }}>{stockModal.designName}</div>
              </div>
              <div>
                <label style={lbl}>Stock actual</label>
                <div style={{ fontSize: 14, color: '#2d3352' }}>{stock.find(s => s.design_name?.toLowerCase() === stockModal.designName?.toLowerCase())?.qty_produced || 0} unidades</div>
              </div>
              <div>
                <label style={lbl}>Cantidad a {stockModal.type === 'add' ? 'agregar' : 'restar'}</label>
                <input style={{ ...inp, width: '100%' }} type="number" min="1" value={stockQty}
                  onChange={e => setStockQty(e.target.value)} autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmStock()} />
              </div>
              <div>
                <label style={lbl}>Nota (opcional)</label>
                <input style={{ ...inp, width: '100%' }} type="text" value={stockNote}
                  onChange={e => setStockNote(e.target.value)} placeholder="Ej: Prensa 1, lote del lunes..." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStockModal(null)}
                  style={{ flex: 1, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, color: '#5a6380', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={confirmStock} disabled={savingStock || !stockQty || parseInt(stockQty) <= 0}
                  style={{ flex: 2, background: '#1B2F5E', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', opacity: savingStock || !stockQty ? 0.6 : 1 }}>
                  {savingStock ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}