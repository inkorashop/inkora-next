'use client';

import { useEffect, useMemo, useState } from 'react';
import SafeImage from '@/components/SafeImage';
import { getDesignDisplayImageUrl } from '@/lib/design-image-url';

const TITLES = {
  order: 'Referenciar un pedido',
  production: 'Referenciar producción',
  design: 'Referenciar un diseño',
};

export default function ChatReferencePicker({ type, orders = [], designs = [], onSelect, onClose }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (type === 'design') {
      const list = q
        ? designs.filter(d => d.name?.toLowerCase().includes(q))
        : designs.slice(0, 40);
      return list.slice(0, 40);
    }
    const list = q
      ? orders.filter(o =>
          o.order_code?.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_email?.toLowerCase().includes(q)
        )
      : [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 40);
    return list.slice(0, 40);
  }, [type, query, orders, designs]);

  function pick(item) {
    if (type === 'design') {
      onSelect({
        type: 'design',
        id: item.id,
        label: item.name,
        productName: item.products?.name || '',
        imageUrl: getDesignDisplayImageUrl(item) || '',
      });
    } else {
      onSelect({
        type,
        id: item.id,
        label: item.order_code || item.customer_name || 'Pedido',
        customerName: item.customer_name || '',
        status: item.status || '',
        total: Number(item.total) || 0,
        itemsCount: Array.isArray(item.items) ? item.items.length : 0,
      });
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.55)', zIndex: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 14, color: '#1B2F5E' }}>{TITLES[type] || 'Referenciar'}</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: '#9aa3bc', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 12 }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={type === 'design' ? 'Buscar diseño por nombre...' : 'Buscar por código, cliente o email...'}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif' }}
          />
        </div>
        <div style={{ overflowY: 'auto', padding: '0 8px 10px' }}>
          {results.length === 0 && <div style={{ padding: 16, fontSize: 12, color: '#9aa3bc', textAlign: 'center' }}>Sin resultados.</div>}
          {results.map(item => (
            <button
              key={item.id}
              onClick={() => pick(item)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 8, padding: '8px 8px', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f6f8fd'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {type === 'design' ? (
                <>
                  {getDesignDisplayImageUrl(item) ? (
                    <SafeImage src={getDesignDisplayImageUrl(item)} alt={item.name} style={{ width: 32, height: 32, objectFit: 'contain', background: '#f0f2f8', borderRadius: 6, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f2f8', flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2d3352', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: '#9aa3bc' }}>{item.products?.name || 'Sin producto'}</div>
                  </div>
                </>
              ) : (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2d3352' }}>{item.order_code || 'Sin código'} · {item.customer_name || 'Cliente'}</div>
                  <div style={{ fontSize: 11, color: '#9aa3bc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.customer_email || ''} {item.status ? `· ${item.status}` : ''}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
