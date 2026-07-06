'use client';

import { useEffect, useState } from 'react';

export default function ChatNewChannelModal({ directory, onCreate, onClose, creating }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const members = [...directory.values()].sort((a, b) => a.name.localeCompare(b.name));

  function toggle(email) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.55)', zIndex: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 14, color: '#1B2F5E' }}>Nuevo canal</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: '#9aa3bc', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#5a6380', textTransform: 'uppercase' }}>Nombre del canal</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej. Diseño"
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 6, marginBottom: 14, fontFamily: 'Barlow, sans-serif' }}
          />
          <label style={{ fontSize: 11, fontWeight: 800, color: '#5a6380', textTransform: 'uppercase' }}>Miembros ({selected.size})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
            {members.map(member => (
              <label key={member.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', fontSize: 13, color: '#2d3352', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(member.email)} onChange={() => toggle(member.email)} />
                <span>{member.name}</span>
                <span style={{ fontSize: 11, color: '#9aa3bc' }}>{member.email}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ padding: 14, borderTop: '1px solid #eef0f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ border: '1.5px solid #dde1ef', background: 'white', color: '#5a6380', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button
            disabled={!name.trim() || creating}
            onClick={() => onCreate(name.trim(), [...selected])}
            style={{ border: 'none', background: '#2D6BE4', color: 'white', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 800, cursor: name.trim() && !creating ? 'pointer' : 'not-allowed', opacity: name.trim() && !creating ? 1 : 0.55 }}
          >
            {creating ? 'Creando...' : 'Crear canal'}
          </button>
        </div>
      </div>
    </div>
  );
}
