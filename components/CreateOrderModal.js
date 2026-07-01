'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function newRow() {
  return { id: Math.random().toString(36).slice(2), type: 'manual', text: '', design_id: '', name: '', productName: '', qty: 0 };
}

const QTY_DELTAS = [-10, -2, 2, 10];

// ── Row component ─────────────────────────────────────────────────────────────
function DesignRow({ row, index, focused, editing, rows, designs, usedDesignIds,
  onChange, onDelete, onKeyNav, isLast, selected, onSelect,
  onStartEdit, onEndEdit, onFocusQty, qtyInputRef }) {

  const [inputVal, setInputVal] = useState(row.type === 'linked' ? row.name : row.text);
  const [dropItems, setDropItems] = useState([]);
  const [dropIdx, setDropIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropRef  = useRef(null);

  // Sync display value when row data changes externally
  useEffect(() => {
    const next = row.type === 'linked' ? row.name : row.text;
    setInputVal(next);
  }, [row.type, row.name, row.text]);

  // Focus and select-all when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Compute dropdown when typing (only while editing)
  useEffect(() => {
    if (!editing || !inputVal.trim()) { setDropItems([]); setDropIdx(-1); return; }
    const matches = fuzzyMatchDesigns(inputVal, designs, 8);
    setDropItems(matches);
    setDropIdx(-1);
  }, [inputVal, editing, designs]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropItems.length) return;
    function onOutside(e) {
      if (!inputRef.current?.contains(e.target) && !dropRef.current?.contains(e.target)) {
        setDropItems([]); setDropIdx(-1);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [dropItems.length]);

  // Per-row: exclude own design_id from dupe set
  const localUsedIds = useMemo(() => {
    const s = new Set(usedDesignIds);
    if (row.type === 'linked' && row.design_id) s.delete(row.design_id);
    return s;
  }, [usedDesignIds, row.type, row.design_id]);

  function handleInputChange(e) {
    const val = e.target.value;
    setInputVal(val);
    onChange(index, { type: 'manual', text: val, design_id: '', name: '', productName: '' });
  }

  function selectDrop(item) {
    if (localUsedIds.has(item.design.id)) return;
    const d = item.design;
    onChange(index, { type: 'linked', design_id: d.id, name: d.name, productName: d.products?.name || '', text: '' });
    setInputVal(d.name);
    setDropItems([]); setDropIdx(-1);
    onEndEdit();
    onKeyNav('next-row', index);
  }

  function handleInputKeyDown(e) {
    if (dropItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setDropIdx(i => Math.min(i + 1, dropItems.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setDropIdx(i => Math.max(i - 1, -1)); return; }
      if (e.key === 'Enter' && dropIdx >= 0) { e.preventDefault(); selectDrop(dropItems[dropIdx]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setDropItems([]); setDropIdx(-1); onEndEdit(); return; }
    }
    if (e.key === 'Escape')    { e.preventDefault(); onEndEdit(); return; }
    if (e.key === 'Enter')     { e.preventDefault(); onEndEdit(); onKeyNav('next-row', index); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); onEndEdit(); onKeyNav('next-row', index); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); onEndEdit(); onKeyNav('prev-row', index); return; }
    if (e.key === 'ArrowRight'){ e.preventDefault(); onEndEdit(); onKeyNav('qty', index); return; }
    if (e.key === 'Backspace' && !inputVal && rows.length > 1) { e.preventDefault(); onDelete(index); onKeyNav('prev-row', index); }
  }

  function handleQtyKeyDown(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onKeyNav('design', index); }
    if (e.key === 'Enter')     { e.preventDefault(); onKeyNav('next-qty', index); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onKeyNav('next-qty', index); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); onKeyNav('prev-qty', index); }
  }

  const linked = row.type === 'linked' && row.design_id;
  const bg = selected ? '#dbeafe' : focused ? '#f1f5f9' : 'transparent';

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '18px 1fr auto 22px', gap: 4, alignItems: 'center', padding: '3px 8px', background: bg, borderRadius: 6 }}>

      {/* Selection indicator — hamburger lines */}
      <div onMouseDown={e => { e.preventDefault(); onSelect(index, e); }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.5px', cursor: 'pointer', alignSelf: 'stretch', padding: '0 2px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 8, height: 1.5, borderRadius: 1, background: selected ? '#2D6BE4' : '#c0c5d4' }} />
        ))}
      </div>

      {/* Design cell */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {linked && <DesignThumb designId={row.design_id} name={row.name} size={22} />}
        {editing ? (
          <input ref={inputRef} value={inputVal} onChange={handleInputChange}
            onBlur={() => { if (!dropItems.length) onEndEdit(); }}
            onKeyDown={handleInputKeyDown}
            placeholder={isLast && rows.length === 1 ? 'Buscar o escribir diseño...' : ''}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12,
              fontWeight: linked ? 700 : 400, color: linked ? '#1B2F5E' : '#5a6380',
              fontStyle: linked ? 'normal' : 'italic', fontFamily: 'Barlow, sans-serif', minWidth: 0 }} />
        ) : (
          <div onClick={e => { e.stopPropagation(); onStartEdit(index); }}
            style={{ flex: 1, fontSize: 12, fontWeight: linked ? 700 : 400,
              color: linked ? '#1B2F5E' : isLast && rows.length === 1 ? '#c0c5d4' : '#9aa3bc',
              fontStyle: linked ? 'normal' : 'italic', fontFamily: 'Barlow, sans-serif',
              cursor: 'text', userSelect: 'none', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 0', minHeight: 18 }}>
            {inputVal || (isLast && rows.length === 1 ? 'Clic o Enter para buscar...' : '')}
          </div>
        )}
      </div>

      {/* Qty cell — inline ±buttons always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {[-10, -2].map(d => (
          <button key={d} type="button"
            onMouseDown={e => { e.preventDefault(); onChange(index, { qty: Math.max(0, row.qty + d) }); }}
            style={{ border: '1.5px solid #fecaca', borderRadius: 4, padding: '2px 4px', fontSize: 10, fontWeight: 800, background: '#fff5f5', color: '#b91c1c', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {d}
          </button>
        ))}
        <input ref={qtyInputRef} type="number" min={0} max={9999}
          value={row.qty}
          onChange={e => onChange(index, { qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
          onFocus={e => { e.target.select(); onFocusQty(index); }}
          onKeyDown={handleQtyKeyDown}
          style={{ width: 34, textAlign: 'center', border: '1.5px solid #dde1ef', borderRadius: 5, padding: '2px 2px', fontSize: 12, fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}
        />
        {[2, 10].map(d => (
          <button key={d} type="button"
            onMouseDown={e => { e.preventDefault(); onChange(index, { qty: row.qty + d }); }}
            style={{ border: '1.5px solid #bbf7d0', borderRadius: 4, padding: '2px 4px', fontSize: 10, fontWeight: 800, background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', lineHeight: 1, whiteSpace: 'nowrap' }}>
            +{d}
          </button>
        ))}
      </div>

      {/* Delete */}
      <button type="button" onClick={() => { if (rows.length > 1) { onDelete(index); onKeyNav('prev-row', index); } }}
        style={{ border: 'none', background: 'none', cursor: rows.length > 1 ? 'pointer' : 'default', color: '#c0c5d4', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>

      {/* Design dropdown — portal */}
      {editing && dropItems.length > 0 && typeof window !== 'undefined' && createPortal(
        (() => {
          const rect = inputRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return (
            <div ref={dropRef} style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, width: rect.width + 80,
              zIndex: 9999, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: 260, overflowY: 'auto' }}>
              {dropItems.map((item, i) => {
                const isDupe = localUsedIds.has(item.design.id);
                return (
                  <div key={item.design.id}
                    onMouseDown={e => { e.preventDefault(); if (!isDupe) selectDrop(item); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      cursor: isDupe ? 'not-allowed' : 'pointer',
                      background: i === dropIdx ? '#f0f4ff' : 'transparent',
                      opacity: isDupe ? 0.45 : 1,
                      borderBottom: i < dropItems.length - 1 ? '1px solid #f0f2f8' : 'none' }}>
                    <DesignThumb designId={item.design.id} name={item.design.name} size={20} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#1B2F5E', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textDecoration: isDupe ? 'line-through' : 'none' }}>{item.design.name}</span>
                    {isDupe
                      ? <span style={{ fontSize: 9, color: '#9aa3bc', whiteSpace: 'nowrap' }}>ya agregado</span>
                      : <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 8,
                          background: item.score >= 0.8 ? '#dcfce7' : item.score >= 0.6 ? '#fef9c3' : '#fee2e2',
                          color:      item.score >= 0.8 ? '#15803d' : item.score >= 0.6 ? '#92400e' : '#b91c1c' }}>
                          {Math.round(item.score * 100)}%
                        </span>
                    }
                  </div>
                );
              })}
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function CreateOrderModal({ sellers = [], operators = [], currentAdminSellerId = null, initialValues = null, recentOrders = [], onSave, onClose, onDiscard }) {
  const { designs } = useDesigns();

  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? '');
  const [date,         setDate]         = useState(initialValues?.date         ?? nowStr());
  const [deliveryDate, setDeliveryDate] = useState(initialValues?.deliveryDate ?? todayStr());
  const [sellerId,     setSellerId]     = useState(initialValues?.sellerId     ?? (currentAdminSellerId || ''));
  const [operatorId,   setOperatorId]   = useState(initialValues?.operatorId   ?? (operators[0]?.id || ''));
  const [rows,         setRows]         = useState(initialValues?.rows         ?? [newRow()]);
  const [focusedRow,   setFocusedRow]   = useState(null);
  const [editingRow,   setEditingRow]   = useState(null);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const lastSelectedRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Refs for qty inputs — keyed by row index
  const qtyRefs = useRef({});

  // Snapshot ref to avoid stale closures in global keydown
  const snap = useRef({});
  snap.current = { editingRow, focusedRow, rows };

  // Auto-save draft to localStorage on every meaningful change
  const draftIdRef = useRef(initialValues?.id || null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent = rows.some(r => r.name || r.text) || customerName.trim();
      if (!hasContent) return;
      if (!draftIdRef.current) draftIdRef.current = `draft_${Date.now()}`;
      const draft = { id: draftIdRef.current, customerName, date, deliveryDate, sellerId, operatorId, rows };
      try {
        const stored = JSON.parse(localStorage.getItem('inkora_order_drafts') || '[]');
        const idx = stored.findIndex(d => d.id === draft.id);
        if (idx >= 0) stored[idx] = draft; else stored.push(draft);
        localStorage.setItem('inkora_order_drafts', JSON.stringify(stored));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [rows, customerName, date, deliveryDate, sellerId, operatorId]);

  // All design_ids currently used (for dupe prevention)
  const usedDesignIds = useMemo(() => {
    const s = new Set();
    rows.forEach(r => { if (r.type === 'linked' && r.design_id) s.add(r.design_id); });
    return s;
  }, [rows]);

  function handleSelect(index, e) {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIndices(prev => { const n = new Set(prev); n.has(index) ? n.delete(index) : n.add(index); return n; });
    } else if (e.shiftKey && lastSelectedRef.current != null) {
      const lo = Math.min(lastSelectedRef.current, index), hi = Math.max(lastSelectedRef.current, index);
      setSelectedIndices(new Set(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)));
    } else {
      setSelectedIndices(prev => (prev.size === 1 && prev.has(index)) ? new Set() : new Set([index]));
    }
    lastSelectedRef.current = index;
    setFocusedRow(index);
  }

  function applyBulkDelta(delta) {
    setRows(prev => prev.map((r, i) => selectedIndices.has(i) ? { ...r, qty: Math.max(0, r.qty + delta) } : r));
  }
  function applyBulkSet(value) {
    setRows(prev => prev.map((r, i) => selectedIndices.has(i) ? { ...r, qty: value } : r));
  }

  const handleClose = useCallback(() => {
    const filled = rows.some(r => (r.type === 'linked' && r.design_id) || (r.type === 'manual' && r.text.trim()));
    onClose(filled || customerName.trim() ? { customerName, date, deliveryDate, sellerId, operatorId, rows } : null);
  }, [customerName, date, deliveryDate, sellerId, operatorId, rows, onClose]);

  // Global keyboard handler — uses snap ref to avoid stale closures
  useEffect(() => {
    function onKey(e) {
      if (e.defaultPrevented) return;
      const { editingRow, focusedRow, rows } = snap.current;
      const tag = document.activeElement?.tagName;
      const inTextInput = (tag === 'INPUT' || tag === 'TEXTAREA') && document.activeElement?.type !== 'number';

      if (e.key === 'Escape') {
        if (editingRow !== null) { setEditingRow(null); return; }
        handleClose(); return;
      }

      // Arrow navigation — available when not typing in a text field
      if (!inTextInput) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedRow(r => Math.min(rows.length - 1, (r ?? -1) + 1));
          setEditingRow(null);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedRow(r => Math.max(0, (r ?? rows.length) - 1));
          setEditingRow(null);
          return;
        }
        if (e.key === 'Enter' && focusedRow !== null && editingRow === null) {
          e.preventDefault();
          setEditingRow(focusedRow);
          return;
        }
        // Digit → start qty edit for focused row
        if (/^\d$/.test(e.key) && focusedRow !== null && editingRow === null) {
          e.preventDefault();
          const digit = parseInt(e.key, 10);
          setRows(prev => prev.map((r, i) => i === focusedRow ? { ...r, qty: digit } : r));
          setTimeout(() => { qtyRefs.current[focusedRow]?.focus(); }, 0);
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  function changeRow(index, patch) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  }

  function deleteRow(index) {
    setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
    if (focusedRow === index) setFocusedRow(Math.max(0, index - 1));
    if (editingRow === index) setEditingRow(null);
  }

  function handleKeyNav(action, fromIndex) {
    setRows(prev => {
      const next = action === 'next-row' || action === 'next-qty'
        ? (fromIndex === prev.length - 1 ? [...prev, newRow()] : prev)
        : prev;

      let targetRow = fromIndex;
      if (action === 'next-row' || action === 'next-qty') targetRow = fromIndex + 1;
      else if (action === 'prev-row' || action === 'prev-qty') targetRow = Math.max(0, fromIndex - 1);

      setFocusedRow(targetRow);

      if (action === 'qty') {
        setEditingRow(null);
        setTimeout(() => { qtyRefs.current[fromIndex]?.focus(); }, 0);
      } else if (action === 'design') {
        setEditingRow(fromIndex);
      } else if (action === 'next-qty' || action === 'prev-qty') {
        setEditingRow(null);
        setTimeout(() => { qtyRefs.current[targetRow]?.focus(); }, 0);
      } else {
        // next-row / prev-row: leave editing off; row navigated without entering edit mode
        setEditingRow(null);
      }

      return next;
    });
  }

  async function handleSave() {
    if (!customerName.trim()) { setError('El nombre del cliente es obligatorio.'); return; }
    const validRows = rows.filter(r =>
      (r.type === 'linked' && r.design_id) || (r.type === 'manual' && r.text.trim())
    );
    setSaving(true); setError('');
    try {
      const items = validRows.map(r =>
        r.type === 'linked'
          ? { type: 'linked', design_id: r.design_id, name: r.name, productName: r.productName, qty: r.qty }
          : { type: 'manual', text: r.text.trim(), qty: r.qty }
      );
      await onSave({
        order_code: generateAdminCode(),
        source: 'admin',
        status: 'pending',
        customer_name: customerName.trim(),
        created_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        delivery_date: deliveryDate || null,
        seller_id: sellerId || null,
        items,
        _operator_id: operatorId || null,
      });
      onClose(null);
    } catch (e) {
      setError(e.message || 'Error al crear pedido');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #dde1ef', boxShadow: '0 8px 40px rgba(27,47,94,0.18)', width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', height: '82vh', maxHeight: '82vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1.5px solid #f0f2f8', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1B2F5E' }}>Nuevo pedido</div>
          <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9aa3bc', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Customer name */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Cliente</div>
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente..."
              style={{ width: '100%', border: `1.5px solid ${!customerName.trim() && error ? '#b91c1c' : '#dde1ef'}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Fecha pedido</div>
              <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Fecha entrega</div>
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
              <div style={{ fontSize: 10, color: '#9aa3bc' }}>↑↓ navegar · Enter editar diseño · dígito = cant</div>
            </div>
            <div style={{ border: '1.5px solid #dde1ef', borderRadius: 8, overflow: 'hidden' }}>
              {/* Bulk qty bar */}
              {selectedIndices.size > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#e8f0fe', borderBottom: '1px solid #c7d7f8', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2D6BE4', marginRight: 2 }}>{selectedIndices.size} sel.</span>
                  {QTY_DELTAS.map(d => (
                    <button key={d} type="button" onClick={() => applyBulkDelta(d)}
                      style={{ border: '1.5px solid', borderColor: d < 0 ? '#fecaca' : '#bbf7d0', borderRadius: 5, padding: '2px 5px', fontSize: 11, fontWeight: 700,
                        background: d < 0 ? '#fff5f5' : '#f0fdf4', color: d < 0 ? '#b91c1c' : '#15803d', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                      {d > 0 ? `+${d}` : d}
                    </button>
                  ))}
                  <input type="number" min={0} placeholder="= cant"
                    onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0) applyBulkSet(v); }}
                    style={{ width: 58, border: '1.5px solid #dde1ef', borderRadius: 5, padding: '2px 4px', fontSize: 11, textAlign: 'center', fontFamily: 'Barlow, sans-serif' }} />
                  <button type="button" onClick={() => setSelectedIndices(new Set())}
                    style={{ border: 'none', background: 'none', color: '#9aa3bc', fontSize: 14, cursor: 'pointer', marginLeft: 'auto', lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              )}
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto 22px', gap: 4, padding: '4px 8px', background: '#f7f8fc', borderBottom: '1px solid #f0f2f8' }}>
                <span />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5 }}>Diseño</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Cant.</span>
                <span />
              </div>
              {rows.map((row, i) => (
                <DesignRow key={row.id} row={row} index={i}
                  focused={focusedRow === i && !selectedIndices.has(i)}
                  editing={editingRow === i}
                  rows={rows} designs={designs} usedDesignIds={usedDesignIds}
                  onChange={changeRow} onDelete={deleteRow}
                  onKeyNav={handleKeyNav}
                  onStartEdit={idx => { setEditingRow(idx); setFocusedRow(idx); }}
                  onEndEdit={() => setEditingRow(null)}
                  onFocusQty={idx => { setFocusedRow(idx); setEditingRow(null); }}
                  isLast={i === rows.length - 1}
                  prevQty={i > 0 ? rows[i - 1].qty : null}
                  selected={selectedIndices.has(i)}
                  onSelect={handleSelect}
                  qtyInputRef={el => { qtyRefs.current[i] = el; }}
                />
              ))}
              <button type="button"
                onClick={() => { const idx = rows.length; setRows(p => [...p, newRow()]); setFocusedRow(idx); setEditingRow(idx); }}
                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', padding: '5px 8px', fontSize: 11, color: '#9aa3bc', textAlign: 'left', fontFamily: 'Barlow, sans-serif' }}>
                + Agregar línea
              </button>
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: '#b91c1c', background: '#fee2e2', borderRadius: 6, padding: '6px 10px' }}>{error}</div>}

          {/* Recent orders history */}
          {recentOrders.length > 0 && (
            <div style={{ borderTop: '1.5px solid #f0f2f8', paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Mis pedidos recientes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {recentOrders.slice(0, 8).map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 7px', borderRadius: 6, background: '#f7f8fc' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1B2F5E', fontSize: 10, whiteSpace: 'nowrap' }}>{o.order_code}</span>
                    <span style={{ flex: 1, color: '#2d3352', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name || '—'}</span>
                    <span style={{ color: '#9aa3bc', whiteSpace: 'nowrap', fontSize: 10 }}>
                      {o.created_at ? new Date(o.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1.5px solid #f0f2f8', flexShrink: 0, alignItems: 'center' }}>
          {onDiscard && (
            <button onClick={onDiscard} style={{ border: '1.5px solid #fecaca', background: '#fff5f5', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#b91c1c', marginRight: 'auto' }}>
              Borrar
            </button>
          )}
          <button onClick={handleClose} style={{ border: '1.5px solid #dde1ef', background: 'white', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#5a6380' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            style={{ border: 'none', background: '#1B2F5E', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'Barlow, sans-serif', color: 'white', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creando...' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
