'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDesigns } from '@/contexts/DesignsContext';
import DesignThumb from '@/components/DesignThumb';
import { fuzzyMatchDesigns } from '@/lib/fuzzy-match';
import { parseOrderText } from '@/lib/order-text-parser';
import { splitVoiceText, parseVoiceSegment } from '@/lib/voice-order-parser';

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
const IMPORT_MATCH_THRESHOLD = 0.68;

// ── Row component ─────────────────────────────────────────────────────────────
function DesignRow({ row, index, focused, editing, rows, designs, usedDesignIds,
  onChange, onDelete, onKeyNav, isLast, selected, onSelect,
  onStartEdit, onEndEdit, onFocusQty, onFocusRow, qtyInputRef }) {

  const [inputVal, setInputVal] = useState(row.type === 'linked' ? row.name : row.text);
  const [dropItems, setDropItems] = useState([]);
  const [dropIdx, setDropIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropRef  = useRef(null);

  useEffect(() => {
    const next = row.type === 'linked' ? row.name : row.text;
    setInputVal(next);
  }, [row.type, row.name, row.text]);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  useEffect(() => {
    if (!editing || !inputVal.trim()) { setDropItems([]); setDropIdx(-1); return; }
    const matches = fuzzyMatchDesigns(inputVal, designs, 8);
    setDropItems(matches);
    setDropIdx(-1);
  }, [inputVal, editing, designs]);

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
  const suggested = row.suggested;

  // Background priority: selected > focused > suggested > transparent
  const bg = selected ? '#dbeafe' : focused ? '#f1f5f9' : suggested ? '#fefce8' : 'transparent';
  // Hamburger lines color
  const lineColor = selected ? '#2D6BE4' : suggested ? '#d97706' : '#c0c5d4';

  return (
    <div onClick={() => onFocusRow(index)}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: '18px 1fr auto 22px', gap: 4, alignItems: 'center', padding: '3px 8px', background: bg, borderRadius: 6, cursor: 'default' }}>

      {/* Selection indicator — hamburger lines */}
      <div onMouseDown={e => { e.preventDefault(); onSelect(index, e); }}
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.5px', cursor: 'pointer', alignSelf: 'stretch', padding: '0 2px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 8, height: 1.5, borderRadius: 1, background: lineColor }} />
        ))}
      </div>

      {/* Design cell — click on empty space focuses row; click on text opens edit */}
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
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 18, padding: '2px 0', display: 'flex', alignItems: 'center' }}>
            <span onClick={e => { e.stopPropagation(); onStartEdit(index); }}
              style={{ fontSize: 12, fontWeight: linked ? 700 : 400,
                color: linked ? '#1B2F5E' : suggested ? '#92400e' : (isLast && rows.length === 1 ? '#c0c5d4' : '#9aa3bc'),
                fontStyle: linked ? 'normal' : 'italic', fontFamily: 'Barlow, sans-serif',
                cursor: 'text', userSelect: 'none', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
              {inputVal || (isLast && rows.length === 1 ? 'Clic o Enter para buscar...' : '')}
            </span>
          </div>
        )}
        {/* Subtle "suggestion" badge on unmatched manual rows */}
        {suggested && !linked && !editing && (
          <span style={{ fontSize: 9, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '0px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>?</span>
        )}
      </div>

      {/* Qty cell — stopPropagation so clicking qty doesn't also fire row focus */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
          style={{ width: 34, textAlign: 'center', border: `1.5px solid ${suggested ? '#fde68a' : '#dde1ef'}`, borderRadius: 5, padding: '2px 2px', fontSize: 12, fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}
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
      <button type="button" onClick={e => { e.stopPropagation(); if (rows.length > 1) { onDelete(index); onKeyNav('prev-row', index); } }}
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
export default function CreateOrderModal({ sellers = [], operators = [], currentAdminSellerId = null, initialValues = null, recentOrders = [], pdfEnabledIds = null, onSave, onClose, onDiscard }) {
  const { designs } = useDesigns();

  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? '');
  const [date,         setDate]         = useState(initialValues?.date         ?? nowStr());
  const [deliveryDate, setDeliveryDate] = useState(initialValues?.deliveryDate ?? '');
  const [sellerId,     setSellerId]     = useState(initialValues?.sellerId     ?? (currentAdminSellerId || ''));
  const [operatorId,   setOperatorId]   = useState(initialValues?.operatorId   ?? (operators[0]?.id || ''));
  const [rows,         setRows]         = useState(initialValues?.rows         ?? [newRow()]);
  const [notes,        setNotes]        = useState(initialValues?.notes        ?? '');
  const [focusedRow,   setFocusedRow]   = useState(null);
  const [editingRow,   setEditingRow]   = useState(null);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const lastSelectedRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Paste area state
  const [pasteText, setPasteText] = useState('');
  const pasteRef = useRef(null);

  const qtyRefs = useRef({});
  const snap = useRef({});
  snap.current = { editingRow, focusedRow, rows };

  // ── Voice dictation state ────────────────────────────────────────────────────
  const [voiceState,      setVoiceState]      = useState('idle'); // 'idle'|'recording'|'paused'
  const [voiceTranscript, setVoiceTranscript] = useState(''); // full dictated log
  const [voiceInterim,    setVoiceInterim]    = useState(''); // live unsaved text
  const [voiceBuffer,     setVoiceBuffer]     = useState(''); // text pending "siguiente"
  const [voiceSupported,  setVoiceSupported]  = useState(false);
  const voiceStateRef      = useRef('idle');
  const voiceBufferRef     = useRef('');
  const voiceTranscriptRef = useRef('');
  const recognitionRef     = useRef(null);
  const designsRef         = useRef(designs);

  // Auto-save draft
  const draftIdRef = useRef(initialValues?.id || null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent = rows.some(r => r.name || r.text) || customerName.trim();
      if (!hasContent) return;
      if (!draftIdRef.current) draftIdRef.current = `draft_${Date.now()}`;
      const draft = { id: draftIdRef.current, customerName, date, deliveryDate, sellerId, operatorId, rows, notes };
      try {
        const stored = JSON.parse(localStorage.getItem('inkora_order_drafts') || '[]');
        const idx = stored.findIndex(d => d.id === draft.id);
        if (idx >= 0) stored[idx] = draft; else stored.push(draft);
        localStorage.setItem('inkora_order_drafts', JSON.stringify(stored));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [rows, customerName, date, deliveryDate, sellerId, operatorId, notes]);

  useEffect(() => { designsRef.current = designs; }, [designs]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    }
    return () => {
      // Set idle first so onend (fired by abort) does not restart recognition.
      voiceStateRef.current = 'idle';
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    };
  }, []);

  const usedDesignIds = useMemo(() => {
    const s = new Set();
    rows.forEach(r => { if (r.type === 'linked' && r.design_id) s.add(r.design_id); });
    return s;
  }, [rows]);

  // Parse pasted text + fuzzy match — only match designs that have PDFs linked
  const parsedPreview = useMemo(() => {
    if (!pasteText.trim() || !designs?.length) return [];
    const pdfSet = pdfEnabledIds instanceof Set ? pdfEnabledIds
      : Array.isArray(pdfEnabledIds) ? new Set(pdfEnabledIds.map(String)) : null;
    const matchableDesigns = pdfSet ? designs.filter(d => pdfSet.has(String(d.id))) : designs;
    const items = parseOrderText(pasteText);
    return items.map(item => {
      const matches = fuzzyMatchDesigns(item.name, matchableDesigns, 1);
      const top = matches[0];
      return { ...item, match: top && top.score >= IMPORT_MATCH_THRESHOLD ? top : null };
    });
  }, [pasteText, designs, pdfEnabledIds]);

  const unmatchedCount = parsedPreview.filter(p => !p.match).length;

  function importFromText() {
    if (!parsedPreview.length) return;
    const seenDesignIds = new Set();
    const newRows = [];
    for (const item of parsedPreview) {
      if (item.match) {
        const d = item.match.design;
        if (seenDesignIds.has(d.id)) continue; // skip duplicates
        seenDesignIds.add(d.id);
        newRows.push({
          id: Math.random().toString(36).slice(2),
          type: 'linked', design_id: d.id, name: d.name,
          productName: d.products?.name || '', text: '',
          qty: item.qty, suggested: true,
        });
      } else {
        newRows.push({
          id: Math.random().toString(36).slice(2),
          type: 'manual', text: item.name,
          design_id: '', name: '', productName: '',
          qty: item.qty, suggested: true,
        });
      }
    }
    setRows(newRows);
    setPasteText('');
    setFocusedRow(0);
    setEditingRow(null);
    setSelectedIndices(new Set());
  }

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
    onClose(filled || customerName.trim() ? { customerName, date, deliveryDate, sellerId, operatorId, rows, notes } : null);
  }, [customerName, date, deliveryDate, sellerId, operatorId, rows, onClose]);

  useEffect(() => {
    function onKey(e) {
      const { editingRow, focusedRow, rows } = snap.current;

      // Escape is always intercepted regardless of e.defaultPrevented
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editingRow !== null) { setEditingRow(null); return; }
        handleClose(); return;
      }

      if (e.defaultPrevented) return;
      const tag = document.activeElement?.tagName;
      const inTextInput = (tag === 'INPUT' || tag === 'TEXTAREA') && document.activeElement?.type !== 'number';

      if (!inTextInput) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedRow(r => Math.min(rows.length - 1, (r ?? -1) + 1));
          setEditingRow(null); return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedRow(r => Math.max(0, (r ?? rows.length) - 1));
          setEditingRow(null); return;
        }
        if (e.key === 'Enter' && focusedRow !== null && editingRow === null) {
          e.preventDefault(); setEditingRow(focusedRow); return;
        }
        if (/^\d$/.test(e.key) && focusedRow !== null && editingRow === null) {
          e.preventDefault();
          const digit = parseInt(e.key, 10);
          setRows(prev => prev.map((r, i) => i === focusedRow ? { ...r, qty: digit, suggested: false } : r));
          setTimeout(() => { qtyRefs.current[focusedRow]?.focus(); }, 0);
        }
      }
    }
    // capture: true — fires before React synthetic events and any child handlers
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [handleClose]);

  // Any edit on a row clears its "suggested" flag
  function changeRow(index, patch) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch, suggested: false } : r));
  }

  function deleteRow(index) {
    setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
    if (focusedRow === index) setFocusedRow(Math.max(0, index - 1));
    if (editingRow === index) setEditingRow(null);
  }

  function handleKeyNav(action, fromIndex) {
    setRows(prev => {
      const next = (action === 'next-row' || action === 'next-qty') && fromIndex === prev.length - 1
        ? [...prev, newRow()] : prev;
      let targetRow = fromIndex;
      if (action === 'next-row' || action === 'next-qty') targetRow = fromIndex + 1;
      else if (action === 'prev-row' || action === 'prev-qty') targetRow = Math.max(0, fromIndex - 1);
      setFocusedRow(targetRow);
      if (action === 'qty') { setEditingRow(null); setTimeout(() => { qtyRefs.current[fromIndex]?.focus(); }, 0); }
      else if (action === 'design') { setEditingRow(fromIndex); }
      else if (action === 'next-qty' || action === 'prev-qty') { setEditingRow(null); setTimeout(() => { qtyRefs.current[targetRow]?.focus(); }, 0); }
      else { setEditingRow(null); }
      return next;
    });
  }

  function handlePasteImport(e) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    const pdfSet = pdfEnabledIds instanceof Set ? pdfEnabledIds
      : Array.isArray(pdfEnabledIds) ? new Set(pdfEnabledIds.map(String)) : null;
    const matchableDesigns = pdfSet ? designs.filter(d => pdfSet.has(String(d.id))) : designs;
    const items = parseOrderText(text);
    if (!items.length) return;
    const preview = items.map(item => {
      const matches = fuzzyMatchDesigns(item.name, matchableDesigns, 1);
      const top = matches[0];
      return { ...item, match: top && top.score >= IMPORT_MATCH_THRESHOLD ? top : null };
    });
    const seenDesignIds = new Set();
    const newRows = [];
    for (const item of preview) {
      if (item.match) {
        const d = item.match.design;
        if (seenDesignIds.has(d.id)) continue;
        seenDesignIds.add(d.id);
        newRows.push({ id: Math.random().toString(36).slice(2), type: 'linked', design_id: d.id, name: d.name, productName: d.products?.name || '', text: '', qty: item.qty, suggested: true });
      } else {
        newRows.push({ id: Math.random().toString(36).slice(2), type: 'manual', text: item.name, design_id: '', name: '', productName: '', qty: item.qty, suggested: true });
      }
    }
    if (newRows.length > 0) {
      setRows(newRows);
      setPasteText('');
      setFocusedRow(0);
      setEditingRow(null);
      setSelectedIndices(new Set());
      e.preventDefault();
    }
  }

  async function handleSave() {
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
        order_code: generateAdminCode(), source: 'admin', status: 'pending',
        customer_name: customerName.trim(),
        created_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        delivery_date: deliveryDate ? new Date(deliveryDate).toISOString() : null,
        seller_id: sellerId || null, items, _operator_id: operatorId || null,
        notes: notes.trim(),
      });
      onClose(null);
    } catch (e) {
      setError(e.message || 'Error al crear pedido');
    } finally { setSaving(false); }
  }

  // ── Voice helpers ─────────────────────────────────────────────────────────────

  function stopRecognition() {
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
  }

  function addVoiceRow(segText) {
    const parsed = parseVoiceSegment(segText);
    if (!parsed?.name) return;
    const allDesigns = designsRef.current || [];
    const pdfSet = pdfEnabledIds instanceof Set ? pdfEnabledIds
      : Array.isArray(pdfEnabledIds) ? new Set(pdfEnabledIds.map(String)) : null;
    const matchable = pdfSet ? allDesigns.filter(d => pdfSet.has(String(d.id))) : allDesigns;
    const matches = fuzzyMatchDesigns(parsed.name, matchable, 1);
    const top = matches[0];
    const row = (top && top.score >= IMPORT_MATCH_THRESHOLD)
      ? { id: Math.random().toString(36).slice(2), type: 'linked', design_id: top.design.id, name: top.design.name, productName: top.design.products?.name || '', text: '', qty: parsed.qty, suggested: true }
      : { id: Math.random().toString(36).slice(2), type: 'manual', text: parsed.name, design_id: '', name: '', productName: '', qty: parsed.qty, suggested: true };
    setRows(prev => {
      const last = prev[prev.length - 1];
      const isEmpty = last && last.type === 'manual' && !last.text && !last.name && last.qty === 0;
      return isEmpty ? [...prev.slice(0, -1), row] : [...prev, row];
    });
  }

  function processVoiceFinal(text) {
    const transcript = voiceTranscriptRef.current + (voiceTranscriptRef.current ? ' ' : '') + text;
    voiceTranscriptRef.current = transcript;
    setVoiceTranscript(transcript);

    const combined = (voiceBufferRef.current ? voiceBufferRef.current + ' ' : '') + text;
    const { segments, remaining, shouldStop } = splitVoiceText(combined);

    for (const seg of segments) addVoiceRow(seg);

    if (shouldStop) {
      if (remaining.trim()) addVoiceRow(remaining);
      voiceBufferRef.current = '';
      setVoiceBuffer('');
      setVoiceInterim('');
      stopRecognition();
      voiceStateRef.current = 'idle';
      setVoiceState('idle');
    } else {
      voiceBufferRef.current = remaining;
      setVoiceBuffer(remaining);
      setVoiceInterim('');
    }
  }

  function createRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = 'es-AR';
    // continuous:false avoids Chrome's resultIndex=0 bug that causes duplicates.
    // Each session captures one utterance; onend restarts for the next one.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      // With continuous:false there is exactly one result slot per session.
      const result = event.results[0];
      if (!result) return;
      if (result.isFinal) {
        setVoiceInterim('');
        processVoiceFinal(result[0].transcript);
      } else {
        setVoiceInterim(result[0].transcript);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceInterim('');
    };
    rec.onend = () => {
      if (voiceStateRef.current !== 'recording') return;
      // Restart after each utterance (or after no-speech timeout).
      // Small delay lets the audio pipeline reset cleanly.
      setTimeout(() => {
        if (voiceStateRef.current !== 'recording') return;
        const newRec = createRecognition();
        if (newRec) { recognitionRef.current = newRec; try { newRec.start(); } catch {} }
      }, 150);
    };
    return rec;
  }

  function startVoice() {
    voiceStateRef.current = 'recording';
    setVoiceState('recording');
    const rec = createRecognition();
    if (!rec) { voiceStateRef.current = 'idle'; setVoiceState('idle'); return; }
    recognitionRef.current = rec;
    try { rec.start(); } catch {}
  }

  function pauseVoice() {
    voiceStateRef.current = 'paused';
    setVoiceState('paused');
    stopRecognition();
    setVoiceInterim('');
  }

  function resumeVoice() {
    voiceStateRef.current = 'recording';
    setVoiceState('recording');
    const rec = createRecognition();
    if (!rec) { voiceStateRef.current = 'paused'; setVoiceState('paused'); return; }
    recognitionRef.current = rec;
    try { rec.start(); } catch {}
  }

  function stopVoice() {
    // Process any text pending "siguiente" before stopping
    if (voiceBufferRef.current.trim()) {
      addVoiceRow(voiceBufferRef.current);
      voiceBufferRef.current = '';
      setVoiceBuffer('');
    }
    stopRecognition();
    voiceStateRef.current = 'idle';
    setVoiceState('idle');
    setVoiceInterim('');
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #dde1ef', boxShadow: '0 8px 40px rgba(27,47,94,0.18)', width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', height: '94vh', maxHeight: '94vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1.5px solid #f0f2f8', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1B2F5E' }}>Nuevo pedido</div>
          <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9aa3bc', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Body — no outer scroll; design rows scroll internally */}
        <div style={{ flex: 1, minHeight: 0, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

          {/* Customer name */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Cliente</div>
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente..."
              style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Fecha pedido</div>
              <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Fecha entrega</div>
              <input type="datetime-local" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Seller + Operator */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, flexShrink: 0 }}>
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

          {/* Design list — grows to fill, rows scroll internally */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5 }}>Diseños</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {voiceSupported && voiceState === 'idle' && (
                  <button type="button" onClick={startVoice}
                    style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#5a6380', background: 'white', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    Carga por voz
                  </button>
                )}
                {voiceSupported && voiceState !== 'idle' && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: voiceState === 'recording' ? '#15803d' : '#d97706' }}>
                    {voiceState === 'recording' ? '● Grabando' : '|| Pausado'}
                  </span>
                )}
                <div style={{ fontSize: 10, color: '#9aa3bc' }}>↑↓ · Enter editar · dígito = cant</div>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, border: '1.5px solid #dde1ef', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

              {/* ── Paste area — always visible ── */}
              <div style={{ borderBottom: `1px solid ${pasteText.trim() ? '#fde68a' : '#f0f2f8'}`, background: pasteText.trim() ? '#fffbeb' : 'transparent' }}>
                <textarea ref={pasteRef} value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  onPaste={handlePasteImport}
                  placeholder="Pegá una lista de diseños para importar..."
                  style={{ width: '100%', minHeight: 52, border: 'none', background: 'transparent', resize: 'vertical', padding: '7px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box', outline: 'none', color: '#1B2F5E', lineHeight: 1.5 }}
                />
                {pasteText.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', flexWrap: 'wrap' }}>
                    {parsedPreview.length > 0 ? (
                      <>
                        <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>
                          {parsedPreview.length} diseño{parsedPreview.length !== 1 ? 's' : ''} detectado{parsedPreview.length !== 1 ? 's' : ''}
                        </span>
                        {unmatchedCount > 0 && (
                          <span style={{ fontSize: 11, color: '#b91c1c', background: '#fee2e2', borderRadius: 5, padding: '1px 6px' }}>
                            {unmatchedCount} sin match
                          </span>
                        )}
                        <button type="button" onClick={importFromText}
                          style={{ marginLeft: 'auto', border: 'none', background: '#d97706', color: 'white', borderRadius: 6, padding: '3px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                          Cargar {parsedPreview.length}
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: '#b45309' }}>Sin coincidencias</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Voice panel ── */}
              {(voiceState !== 'idle' || voiceTranscript.trim()) && (
                <div style={{ borderBottom: '1px solid #f0f2f8', background: voiceState === 'recording' ? '#f0fdf4' : '#f8faff', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {/* Status + buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: voiceState === 'recording' ? '#15803d' : voiceState === 'paused' ? '#d97706' : '#9aa3bc' }}>
                      {voiceState === 'recording' ? '● Escuchando...' : voiceState === 'paused' ? '|| Pausado' : 'Dictado guardado'}
                    </span>
                    {voiceState === 'recording' && (
                      <button type="button" onClick={pauseVoice}
                        style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#5a6380', background: 'white' }}>
                        Pausar
                      </button>
                    )}
                    {voiceState === 'paused' && (
                      <button type="button" onClick={resumeVoice}
                        style={{ border: '1.5px solid #2D6BE4', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#2D6BE4', background: '#f0f4ff' }}>
                        Reanudar
                      </button>
                    )}
                    {voiceState !== 'idle' && (
                      <button type="button" onClick={stopVoice}
                        style={{ border: '1.5px solid #bbf7d0', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', color: '#15803d', background: '#f0fdf4' }}>
                        Guardar voz
                      </button>
                    )}
                  </div>
                  {/* Live interim text */}
                  {voiceInterim.trim() && (
                    <div style={{ fontSize: 11, color: '#9aa3bc', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {voiceInterim}
                    </div>
                  )}
                  {/* Pending buffer (not yet "siguiente") */}
                  {voiceBuffer.trim() && (
                    <div style={{ fontSize: 11, color: '#92400e', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 5, padding: '2px 7px', display: 'inline-block', alignSelf: 'flex-start' }}>
                      {voiceBuffer}
                    </div>
                  )}
                  {/* Full transcript log */}
                  {voiceTranscript.trim() && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>Dictado completo</div>
                      <textarea readOnly value={voiceTranscript} rows={2}
                        style={{ width: '100%', border: '1px solid #e8eaf4', borderRadius: 5, padding: '4px 7px', fontSize: 11, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box', resize: 'none', background: '#f7f8fc', color: '#5a6380', lineHeight: 1.4, outline: 'none' }} />
                    </div>
                  )}
                </div>
              )}

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

              {/* scrollable rows area */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                    onFocusRow={idx => { setFocusedRow(idx); setEditingRow(null); }}
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
          </div>

          {/* Observaciones */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Observaciones</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notas internas del pedido..."
              rows={2}
              style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box', resize: 'vertical', outline: 'none', lineHeight: 1.5, color: '#1B2F5E', minHeight: 52 }} />
          </div>

          {error && <div style={{ flexShrink: 0, fontSize: 12, color: '#b91c1c', background: '#fee2e2', borderRadius: 6, padding: '6px 10px' }}>{error}</div>}
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
