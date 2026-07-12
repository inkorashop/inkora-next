'use client';
import { useEffect, useRef, useState } from 'react';
import { useDesigns } from '@/contexts/DesignsContext';
import DesignThumb from '@/components/DesignThumb';
import { fuzzyMatchDesigns } from '@/lib/fuzzy-match';

// Mini-form para agregar un diseno extra a un pedido ya existente, usado
// tanto desde "Ver pedido" (Pedido) como desde Produccion. Busqueda difusa
// sobre el catalogo de disenos (mismo criterio que "Nuevo pedido"), mas un
// stepper de cantidad. No decide el origen (pedido/produccion) ni llama a
// Supabase: eso lo maneja quien lo use, via onSubmit.
export default function AddExtraDesignForm({ onSubmit, onCancel, busy = false, error = '', usedDesignIds = null }) {
  const { designs, productOrderById } = useDesigns();
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState(1);
  const [dropItems, setDropItems] = useState([]);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setDropItems([]); return; }
    setDropItems(fuzzyMatchDesigns(query, designs, 8, productOrderById));
  }, [query, designs, productOrderById]);

  useEffect(() => {
    if (!dropItems.length) return;
    function onOutside(e) {
      if (!inputRef.current?.contains(e.target) && !dropRef.current?.contains(e.target)) setDropItems([]);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [dropItems.length]);

  // Elegir un diseño lo agrega ya mismo (con la cantidad puesta en el
  // stepper, 1 por defecto) — no hace falta un boton "Agregar" aparte. Si
  // se agrego mal, se borra despues con el boton de quitar de la fila.
  function pick(design) {
    if (busy || usedDesignIds?.has(String(design.id))) return;
    onSubmit({ design, qty: Number(qty) || 1 });
    setQuery('');
    setDropItems([]);
    inputRef.current?.focus();
  }

  return (
    <div style={{ background: '#f8faff', border: '1.5px solid #dde1ef', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar diseño…"
            disabled={busy}
            style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352', boxSizing: 'border-box' }}
          />
          {dropItems.length > 0 && (
            <div ref={dropRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8, boxShadow: '0 8px 24px rgba(27,47,94,0.15)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
              {dropItems.map(({ design, score }) => {
                const isDupe = usedDesignIds?.has(String(design.id));
                return (
                  <div
                    key={design.id}
                    onMouseDown={e => { e.preventDefault(); pick(design); }}
                    title={isDupe ? 'Este diseño ya está en el pedido' : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: isDupe ? 'not-allowed' : 'pointer', opacity: isDupe ? 0.45 : 1, borderBottom: '1px solid #f0f2f8' }}
                    onMouseEnter={e => e.currentTarget.style.background = isDupe ? 'transparent' : '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <DesignThumb designId={design.id} name={design.name} size={22} />
                    <span style={{ fontSize: 12.5, color: '#2d3352', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDupe ? 'line-through' : 'none' }}>{design.name}</span>
                    {isDupe
                      ? <span style={{ fontSize: 9, color: '#9aa3bc', whiteSpace: 'nowrap' }}>ya agregado</span>
                      : <span style={{ fontSize: 10, color: '#9aa3bc' }}>{design.products?.name || ''}</span>
                    }
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" onClick={() => setQty(q => Math.max(1, Number(q) - 1))} style={{ border: '1.5px solid #dde1ef', background: 'white', borderRadius: 7, width: 26, height: 30, cursor: 'pointer', fontWeight: 700, color: '#1B2F5E' }}>−</button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 52, textAlign: 'center', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 4px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}
          />
          <button type="button" onClick={() => setQty(q => Number(q) + 1)} style={{ border: '1.5px solid #dde1ef', background: 'white', borderRadius: 7, width: 26, height: 30, cursor: 'pointer', fontWeight: 700, color: '#1B2F5E' }}>+</button>
        </div>

        {busy && <span style={{ fontSize: 12, fontWeight: 700, color: '#9aa3bc' }}>Agregando…</span>}
        <button type="button" onClick={onCancel} style={{ border: '1.5px solid #dde1ef', background: 'white', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#5a6380' }}>
          Cerrar
        </button>
      </div>
      {error && <div style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
