'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDesigns } from '@/contexts/DesignsContext';
import DesignThumb from '@/components/DesignThumb';
import { fuzzyMatchDesigns } from '@/lib/fuzzy-match';

function generateAdminCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = 'ADM-';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function newRow() {
  return { id: Math.random().toString(36).slice(2), type: 'manual', text: '', design_id: '', name: '', productName: '', qty: 1 };
}

// ── Row component ────────────────────────────────────────────────────────────
function DesignRow({ row, index, active, activeCell, rows, designs,
  onChange, onDelete, onFocus, onKeyNav, isLast }) {

  const [inputVal, setInputVal] = useState(row.type === 'linked' ? row.name : row.text);
  const [dropItems, setDropItems] = useState([]);
  const [dropIdx, setDropIdx]   = useState(-1);
  const inputRef = useRef(null);
  const qtyRef   = useRef(null);
  const dropRef  = useRef(null);

  const isActive = active && activeCell === 'design';
  const isQty    = active && activeCell === 'qty';

  // Sync inputVal when row changes externally
  useEffect(() => {
    const next = row.type === 'linked' ? row.name : row.text;
    setInputVal(next);
  }, [row.type, row.name, row.text]);

  // Focus management
  useEffect(() => {
    if (isActive && inputRef.current) inputRef.current.focus();
    if (isQty   && qtyRef.current)   qtyRef.current.focus();
  }, [isActive, isQty]);

  // Live fuzzy dropdown
  useEffect(() => {
    if (!isActive || !inputVal.trim()) { setDropItems([]); setDropIdx(-1); return; }
    const matches = fuzzyMatchDesigns(inputVal, designs, 8);
    setDropItems(matches);
    setDropIdx(-1);
  }, [inputVal, isActive, designs]);

  function handleInputChange(e) {
    const val = e.target.value;
    setInputVal(val);
    onChange(index, { type: 'manual', text: val, design_id: '', name: '', productName: '' });
  }

  function selectDrop(item) {
    const d = item.design;
    onChange(index, { type: 'linked', design_id: d.id, name: d.name, productName: d.products?.name || '', text: '' });
    setInputVal(d.name);
    setDropItems([]);
    setDropIdx(-1);
    onKeyNav('next-row', index);
  }

  function handleInputKeyDown(e) {
    if (dropItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropIdx(i => Math.min(i + 1, dropItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropIdx(i => Math.max(i - 1, -1));
        return;
      }
      if (e.key === 'Enter' && dropIdx >= 0) {
        e.preventDefault();
        selectDrop(dropItems[dropIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setDropItems([]);
        setDropIdx(-1);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onKeyNav('next-row', index);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onKeyNav('qty', index);
    }
    if (e.key === 'Backspace' && !inputVal && rows.length > 1) {
      e.preventDefault();
      onDelete(index);
      onKeyNav('prev-row', index);
    }
  }

  function handleQtyKeyDown(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onKeyNav('design', index); }
    if (e.key === 'Enter')     { e.preventDefault(); onKeyNav('next-row', index); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onKeyNav('next-qty', index); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); onKeyNav('prev-qty', index); }
  }

  const linked = row.type === 'linked' && row.design_id;

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 64px 28px', gap: 4, alignItems: 'center', padding: '3px 8px', background: active ? '#f0f4ff' : 'transparent', borderRadius: 6 }}>
      {/* Design cell */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {linked && <DesignThumb designId={row.design_id} name={row.name} size={22} />}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={handleInputChange}
          onFocus={() => onFocus(index, 'design')}
          onKeyDown={handleInputKeyDown}
          placeholder={isLast && rows.length === 1 ? 'Buscar o escribir diseño...' : ''}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12, fontWeight: linked ? 700 : 400,
            color: linked ? '#1B2F5E' : '#5a6380',
            fontStyle: linked ? 'normal' : 'italic',
            fontFamily: 'Barlow, sans-serif',
            minWidth: 0,
          }}
        />
      </div>

      {/* Qty cell */}
      <input
        ref={qtyRef}
        type="number" min={1} max={9999}
        value={row.qty}
        onChange={e => onChange(index, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
        onFocus={() => onFocus(index, 'qty')}
        onKeyDown={handleQtyKeyDown}
        style={{ width: '100%', textAlign: 'center', border: '1.5px solid #dde1ef', borderRadius: 5, padding: '2px 4px', fontSize: 12, fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}
      />

      {/* Delete */}
      <button
        type="button" onClick={() => { if (rows.length > 1) { onDelete(index); onKeyNav('prev-row', index); } }}
        style={{ border: 'none', background: 'none', cursor: rows.length > 1 ? 'pointer' : 'default', color: '#c0c5d4', fontSize: 14, lineHeight: 1, padding: 0 }}
      >×</button>

      {/* Dropdown */}
      {isActive && dropItems.length > 0 && (
        <div
          ref={dropRef}
          style={{
            position: 'absolute', top: '100%', left: 8, right: 36, zIndex: 200,
            background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
          }}
        >
          {dropItems.map((item, i) => (
            <div
              key={item.design.id}
              onMouseDown={e => { e.preventDefault(); selectDrop(item); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                cursor: 'pointer', background: i === dropIdx ? '#f0f4ff' : 'transparent',
                borderBottom: i < dropItems.length - 1 ? '1px solid #f0f2f8' : 'none',
              }}
            >
              <DesignThumb designId={item.design.id} name={item.design.name} size={20} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#1B2F5E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.design.name}</span>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 8,
                background: item.score >= 0.8 ? '#dcfce7' : item.score >= 0.6 ? '#fef9c3' : '#fee2e2',
                color:      item.score >= 0.8 ? '#15803d' : item.score >= 0.6 ? '#92400e' : '#b91c1c',
              }}>{Math.round(item.score * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────
export default function CreateOrderModal({ sellers = [], operators = [], currentAdminSellerId = null, onSave, onClose }) {
  const { designs } = useDesigns();

  const [date,         setDate]         = useState(nowStr());
  const [deliveryDate, setDeliveryDate] = useState('');
  const [sellerId,     setSellerId]     = useState(currentAdminSellerId || '');
  const [operatorId,   setOperatorId]   = useState(operators[0]?.id || '');
  const [rows,         setRows]         = useState([newRow()]);
  const [activeRow,    setActiveRow]    = useState(0);
  const [activeCell,   setActiveCell]   = useState('design');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  // Escape to close
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  function changeRow(index, patch) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  }

  function deleteRow(index) {
    setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }

  function handleKeyNav(action, fromIndex) {
    setRows(prev => {
      let next = [...prev];
      let nextRow = fromIndex, nextCell = 'design';
      if (action === 'next-row') {
        if (fromIndex === prev.length - 1) next = [...prev, newRow()];
        nextRow = fromIndex + 1;
        nextCell = 'design';
      } else if (action === 'prev-row') {
        nextRow = Math.max(0, fromIndex - 1);
        nextCell = 'design';
      } else if (action === 'qty') {
        nextRow = fromIndex; nextCell = 'qty';
      } else if (action === 'design') {
        nextRow = fromIndex; nextCell = 'design';
      } else if (action === 'next-qty') {
        if (fromIndex === prev.length - 1) next = [...prev, newRow()];
        nextRow = fromIndex + 1; nextCell = 'qty';
      } else if (action === 'prev-qty') {
        nextRow = Math.max(0, fromIndex - 1); nextCell = 'qty';
      }
      setActiveRow(nextRow);
      setActiveCell(nextCell);
      return next;
    });
  }

  async function handleSave() {
    const validRows = rows.filter(r =>
      (r.type === 'linked' && r.design_id) || (r.type === 'manual' && r.text.trim())
    );
    // Allow saving even with zero design rows (text-only or empty)
    setSaving(true);
    setError('');
    try {
      const items = validRows.map(r =>
        r.type === 'linked'
          ? { type: 'linked', design_id: r.design_id, name: r.name, productName: r.productName, qty: r.qty }
          : { type: 'manual', text: r.text.trim(), qty: r.qty }
      );
      const orderCode = generateAdminCode();
      await onSave({
        order_code: orderCode,
        source: 'admin',
        status: 'pending',
        created_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        delivery_date: deliveryDate || null,
        seller_id: sellerId || null,
        items,
        _operator_id: operatorId || null, // handled separately by caller
      });
      onClose();
    } catch (e) {
      setError(e.message || 'Error al crear pedido');
    } finally {
      setSaving(false);
    }
  }

  const hasContent = rows.some(r => (r.type === 'linked' && r.design_id) || (r.type === 'manual' && r.text.trim()));

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #dde1ef', boxShadow: '0 8px 40px rgba(27,47,94,0.18)', width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', height: '82vh', maxHeight: '82vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1.5px solid #f0f2f8', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1B2F5E' }}>Nuevo pedido</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9aa3bc', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Fecha</div>
              <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Entrega</div>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Seller + Operator */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Vendedor</div>
              <select value={sellerId} onChange={e => setSellerId(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }}>
                <option value="">— Sin vendedor</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Operario</div>
              <select value={operatorId} onChange={e => setOperatorId(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }}>
                <option value="">— Sin operario</option>
                {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
              </select>
            </div>
          </div>

          {/* Design list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5 }}>Diseños</div>
              <div style={{ fontSize: 10, color: '#9aa3bc' }}>Enter = siguiente · → = cant · ↓ = lista</div>
            </div>
            <div style={{ border: '1.5px solid #dde1ef', borderRadius: 8, overflow: 'hidden' }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 28px', gap: 4, padding: '4px 8px', background: '#f7f8fc', borderBottom: '1px solid #f0f2f8' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Diseño</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Cant.</span>
                <span />
              </div>
              {rows.map((row, i) => (
                <DesignRow
                  key={row.id}
                  row={row}
                  index={i}
                  active={activeRow === i}
                  activeCell={activeCell}
                  rows={rows}
                  designs={designs}
                  onChange={changeRow}
                  onDelete={deleteRow}
                  onFocus={(ri, cell) => { setActiveRow(ri); setActiveCell(cell); }}
                  onKeyNav={handleKeyNav}
                  isLast={i === rows.length - 1}
                />
              ))}
              {/* Add row button */}
              <button
                type="button"
                onClick={() => { setRows(p => [...p, newRow()]); setActiveRow(rows.length); setActiveCell('design'); }}
                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', padding: '5px 8px', fontSize: 11, color: '#9aa3bc', textAlign: 'left', fontFamily: 'Barlow, sans-serif' }}
              >+ Agregar línea</button>
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: '#b91c1c', background: '#fee2e2', borderRadius: 6, padding: '6px 10px' }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1.5px solid #f0f2f8', flexShrink: 0 }}>
          <button onClick={onClose} style={{ border: '1.5px solid #dde1ef', background: 'white', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#5a6380' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            style={{ border: 'none', background: '#1B2F5E', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif', color: 'white', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creando...' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
