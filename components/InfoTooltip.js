'use client';
import { useState } from 'react';

// Icono "i" chico: al pasar el mouse muestra una ventanita con `content` sin
// necesidad de click, y se cierra al instante al sacar el mouse (sin delay).
export default function InfoTooltip({ content, dark = false }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
          background: dark ? 'rgba(255,255,255,0.16)' : '#e8eef9',
          color: dark ? 'rgba(255,255,255,0.85)' : '#2D6BE4',
          fontSize: 9, fontWeight: 800, fontStyle: 'italic', fontFamily: 'Georgia, serif',
          cursor: 'default', userSelect: 'none',
        }}
      >
        i
      </span>
      {open && (
        <span
          style={{
            position: 'absolute', bottom: '140%', left: '50%', transform: 'translateX(-50%)',
            background: '#1B2F5E', color: 'white', borderRadius: 7, padding: '6px 10px',
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            zIndex: 500, lineHeight: 1.5, fontFamily: 'Barlow, sans-serif', pointerEvents: 'none',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
