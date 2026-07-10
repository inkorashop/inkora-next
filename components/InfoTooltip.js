'use client';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Icono "i" chico: al pasar el mouse muestra una ventanita con `content` sin
// necesidad de click, y se cierra al instante al sacar el mouse (sin delay).
// Se renderiza en un portal a document.body, con posicion calculada en
// pixeles reales (getBoundingClientRect), para que nunca quede recortado por
// el overflow/scroll de una tabla o encabezado sticky que lo contenga -
// dentro del propio contenedor no hay forma de que "se superponga" bien en
// todos los casos (una fila cerca del borde superior de una tabla con scroll
// no tiene lugar arriba para el viejo popup posicionado con position:absolute
// dentro del propio icono).
export default function InfoTooltip({ content, dark = false }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const iconRef = useRef(null);

  function show() {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <span
      ref={iconRef}
      onMouseEnter={show}
      onMouseLeave={hide}
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
      {open && coords && typeof document !== 'undefined' && createPortal(
        <span
          style={{
            position: 'fixed', top: coords.top, left: coords.left, transform: 'translateX(-50%)',
            background: '#1B2F5E', color: 'white', borderRadius: 7, padding: '6px 10px',
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            zIndex: 9999, lineHeight: 1.5, fontFamily: 'Barlow, sans-serif', pointerEvents: 'none',
          }}
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}
