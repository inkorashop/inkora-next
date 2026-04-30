'use client';
import { useState, useEffect, useCallback } from 'react';

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

export default function ProductionTab({ supabase, sellers, products, orders }) {
  // ── Filtros ──
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // ── Datos producción ──
  const [stock, setStock] = useState([]); // production_stock rows
  const [prodStatus, setProdStatus] = useState([]); // production_status rows
  const [stockLog, setStockLog] = useState([]);
  const [logOpen, setLogOpen] = useState(false);

  // ── UI ──
  const [expandedRow, setExpandedRow] = useState(null);
  const [stockModal, setStockModal] = useState(null); // { designName, designId, type: 'add'|'subtract' }
  const [stockQty, setStockQty] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [savingStatus, setSavingStatus] = useState({});

  // ── Cargar datos ──
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

    // Realtime
    const stockSub = supabase.channel('prod_stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_stock' }, () => loadStock())
      .subscribe();
    const statusSub = supabase.channel('prod_status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_status' }, () => loadProdStatus())
      .subscribe();

    return () => {
      supabase.removeChannel(stockSub);
      supabase.removeChannel(statusSub);
    };
  }, [loadStock, loadProdStatus]);

  // ── Filtrar pedidos ──
  const filteredOrders = orders.filter(o => {
    if (filterSeller !== 'all' && o.seller_id !== filterSeller) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterDateFrom && new Date(o.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo && new Date(o.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!o.customer_name?.toLowerCase().includes(q) && !o.customer_email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Agrupar por diseño ──
  const designMap = {};
  filteredOrders.forEach(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach(item => {
      if (filterProduct !== 'all') {
        const prod = products.find(p => p.name === item.productName);
        if (!prod || prod.id !== filterProduct) return;
      }
      const key = item.name?.toLowerCase() || '';
      if (!designMap[key]) {
        designMap[key] = {
          designName: item.name,
          productName: item.productName || '—',
          demand: 0,
          orders: [],
        };
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

  // Ordenar: in_press primero, luego pending por falta desc, luego done
  rows.sort((a, b) => {
    const order = { in_press: 0, pending: 1, done: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status === 'pending') return b.falta - a.falta;
    return 0;
  });

  // ── Summary ──
  const totalDesigns = rows.length;
  const totalPending = rows.reduce((acc, r) => acc + Math.max(0, r.falta), 0);
  const totalProduced = stock.reduce((acc, s) => acc + (s.qty_produced || 0), 0);
  const totalOrders = filteredOrders.length;
  const totalExcess = rows.filter(r => r.falta < 0).length;

  // ── Ciclar estado ──
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

  // ── Guardar nota ──
  async function saveNote(row, note) {
    if (row.statusId) {
      await supabase.from('production_status').update({ note, updated_at: new Date().toISOString() }).eq('id', row.statusId);
    } else {
      await supabase.from('production_status').insert({ design_name: row.designName, note, status: row.status || 'pending' });
    }
    await loadProdStatus();
  }

  // ── Modal stock ──
  async function confirmStock() {
    if (!stockQty || isNaN(parseInt(stockQty)) || parseInt(stockQty) <= 0) return;
    setSavingStock(true);
    const qty = parseInt(stockQty);
    const { designName, designId, type } = stockModal;
    const existing = stock.find(s => s.design_name?.toLowerCase() === designName?.toLowerCase());
    const delta = type === 'add' ? qty : -qty;
    const newQty = Math.max(0, (existing?.qty_produced || 0) + delta);

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

  // ── Exportar ──
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
  const sel = { ...inp, cursor: 'pointer' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, display: 'block' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Filtros ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Filtros</h2>
          <button
            onClick={() => { setFilterSeller('all'); setFilterProduct('all'); setFilterStatus('all'); setFilterDateFrom(''); setFilterDateTo(''); setFilterSearch(''); }}
            style={{ background: 'none', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#5a6380', cursor: 'pointer' }}
          >Limpiar filtros</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>Vendedor</label>
            <select style={{ ...sel, width: '100%' }} value={filterSeller} onChange={e => setFilterSeller(e.target.value)}>
              <option value="all">Todos</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Producto</label>
            <select style={{ ...sel, width: '100%' }} value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
              <option value="all">Todos</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Estado pedido</label>
            <select style={{ ...sel, width: '100%' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmado</option>
              <option value="in_production">En producción</option>
              <option value="ready">Listo</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Desde</label>
            <input style={{ ...inp, width: '100%' }} type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Hasta</label>
            <input style={{ ...inp, width: '100%' }} type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Cliente / Email</label>
            <input style={{ ...inp, width: '100%' }} type="text" placeholder="Buscar..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Diseños distintos', value: totalDesigns, color: '#1B2F5E' },
          { label: 'Unidades pendientes', value: totalPending, color: totalPending > 0 ? '#e53e3e' : '#18a36a' },
          { label: 'Stock global producido', value: totalProduced, color: '#2D6BE4' },
          { label: 'Pedidos en filtro', value: totalOrders, color: '#5a6380' },
          { label: 'Diseños en exceso', value: totalExcess, color: totalExcess > 0 ? '#f6a800' : '#18a36a' },
        ].map(card => (
          <div key={card.label} style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Cola de producción ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Cola de producción</h2>
          <button onClick={exportReport} style={{ background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ↓ Exportar reporte
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9aa3bc' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: 14 }}>No hay diseños en la cola con los filtros actuales.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Diseño', 'Producto', 'Demanda', 'Stock', 'Falta', 'Estado', 'Nota', 'Pedidos', 'Acciones'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isExpanded = expandedRow === row.designName;
                  const urgent = isUrgent(row.orders);
                  const rowBg = row.falta <= 0 ? 'rgba(24,163,106,0.06)' : 'transparent';
                  return (
                    <>
                      <tr
                        key={row.designName}
                        style={{ borderBottom: '1px solid #f0f2f8', background: rowBg, cursor: 'pointer' }}
                        onClick={() => setExpandedRow(isExpanded ? null : row.designName)}
                      >
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1B2F5E', whiteSpace: 'nowrap' }}>
                          {row.designName}
                          {urgent && <span style={{ marginLeft: 6, fontSize: 11 }}>🔴 <span style={{ color: '#e53e3e', fontWeight: 700 }}>Urgente</span></span>}
                          {row.falta < 0 && <span style={{ marginLeft: 6, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>Exceso +{Math.abs(row.falta)}</span>}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#5a6380' }}>{row.productName}</td>
                        <td style={{ padding: '10px 10px', fontWeight: 600, color: '#2d3352', textAlign: 'center' }}>{row.demand}</td>
                        <td style={{ padding: '10px 10px', fontWeight: 600, color: '#2d3352', textAlign: 'center' }}>{row.qty_produced}</td>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: row.falta > 0 ? '#e53e3e' : '#18a36a', textAlign: 'center' }}>{row.falta}</td>
                        <td style={{ padding: '10px 10px' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => cycleStatus(row)}
                            disabled={savingStatus[row.designName]}
                            style={{ background: `${STATUS_COLOR[row.status]}20`, color: STATUS_COLOR[row.status], border: `1.5px solid ${STATUS_COLOR[row.status]}`, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            {STATUS_LABEL[row.status]}
                          </button>
                        </td>
                        <td style={{ padding: '10px 10px' }} onClick={e => e.stopPropagation()}>
                          <NoteCell row={row} onSave={(note) => saveNote(row, note)} />
                        </td>
                        <td style={{ padding: '10px 10px', color: '#5a6380', textAlign: 'center' }}>
                          {row.orders.length} {isExpanded ? '▲' : '▼'}
                        </td>
                        <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setStockModal({ designName: row.designName, designId: null, type: 'add' }); setStockQty(''); setStockNote(''); }}
                            style={{ background: '#e8f5e9', color: '#18a36a', border: '1.5px solid #18a36a', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginRight: 4 }}
                          >+</button>
                          <button
                            onClick={() => { setStockModal({ designName: row.designName, designId: null, type: 'subtract' }); setStockQty(''); setStockNote(''); }}
                            style={{ background: '#fef2f2', color: '#e53e3e', border: '1.5px solid #e53e3e', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                          >−</button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={row.designName + '_exp'}>
                          <td colSpan={9} style={{ padding: '0 10px 12px 30px', background: '#f7f8fc' }}>
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
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historial de stock ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', overflow: 'hidden' }}>
        <button
          onClick={() => { setLogOpen(v => !v); if (!logOpen) loadStockLog(); }}
          style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E' }}>Historial de movimientos de stock</span>
          <span style={{ fontSize: 18, color: '#9aa3bc' }}>{logOpen ? '▲' : '▼'}</span>
        </button>
        {logOpen && (
          <div style={{ padding: '0 20px 20px', overflowX: 'auto' }}>
            {stockLog.length === 0 ? (
              <p style={{ color: '#9aa3bc', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Sin movimientos registrados.</p>
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
        )}
      </div>

      {/* ── Modal stock ── */}
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
                <input
                  style={{ ...inp, width: '100%' }}
                  type="number"
                  min="1"
                  value={stockQty}
                  onChange={e => setStockQty(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmStock()}
                />
              </div>
              <div>
                <label style={lbl}>Nota (opcional)</label>
                <input style={{ ...inp, width: '100%' }} type="text" value={stockNote} onChange={e => setStockNote(e.target.value)} placeholder="Ej: Prensa 1, lote del lunes..." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStockModal(null)} style={{ flex: 1, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, color: '#5a6380', cursor: 'pointer' }}>Cancelar</button>
                <button
                  onClick={confirmStock}
                  disabled={savingStock || !stockQty || parseInt(stockQty) <= 0}
                  style={{ flex: 2, background: '#1B2F5E', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', opacity: savingStock || !stockQty ? 0.6 : 1 }}
                >
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

function NoteCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.note || '');

  useEffect(() => { setVal(row.note || ''); }, [row.note]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ color: val ? '#2d3352' : '#c4c9d9', cursor: 'text', fontSize: 12, display: 'block', minWidth: 80, padding: '2px 4px', borderRadius: 4, border: '1.5px solid transparent' }}
        title="Click para editar"
      >
        {val || 'Agregar nota...'}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { setEditing(false); onSave(val); }}
      onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(val); } if (e.key === 'Escape') { setEditing(false); setVal(row.note || ''); } }}
      style={{ border: '1.5px solid #2D6BE4', borderRadius: 6, padding: '3px 6px', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#2d3352', minWidth: 120, outline: 'none' }}
    />
  );
}