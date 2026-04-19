'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function toSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function Landing() {
  const [products, setProducts] = useState([]);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    supabase.from('products').select('*').eq('active', true).order('created_at')
      .then(({ data }) => { if (data) setProducts(data); });
  }, []);

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", minHeight: '100vh', background: '#0f1e3d', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .product-card { animation: fadeUp 0.5s ease both; }
        .product-card:hover .card-overlay { opacity: 1 !important; }
        .product-card:hover .card-img { transform: scale(1.05); }
      `}</style>

      <header style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3851.7 5415.62" style={{height: 44, width: 'auto', fill: 'white'}}>
                <path d="M2716.33 2392.49l-395.78 595.37c104.16,158.12 210.84,282.15 210.95,500.49 0.14,332.45 -270.51,604.21 -604.21,604.21 -333.68,0 -604.2,-270.51 -604.2,-604.21 0,-110.21 29.53,-213.62 81.1,-302.66l1318.42 -1991.44c45.9,69.66 91.82,139.33 137.72,208.99 219.36,332.58 448.72,664.89 660.52,1001.6 107.52,170.93 183.37,342.58 247.33,533.71 95.44,302.36 100.58,561.17 57.96,872.87 -4.02,28.43 -8.92,55.75 -14.61,83.83 -193.2,899.02 -969.61,1506.15 -1884.24,1520.38 -1064.41,0 -1927.27,-862.86 -1927.27,-1927.27 0,-390.76 116.29,-754.35 316.16,-1058.06 199.85,-303.71 1619.83,-2430.3 1619.83,-2430.3l394.76 599.32 -1464.04 2175.48c-137.37,203.78 -217.56,449.31 -217.56,713.55 0,705.9 572.23,1278.13 1278.12,1278.13 705.9,0 1278.13,-572.23 1278.13,-1278.13 0,-252.97 -73.51,-488.77 -200.3,-687.23l-288.79 -408.63z"/>
              </svg>
      </header>

      <div style={{ textAlign: 'center', padding: '48px 24px 40px' }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: 'white', margin: 0, letterSpacing: -1 }}>
          ¿Qué estás buscando?
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 18, marginTop: 12 }}>
          Elegí un producto para ver el catálogo completo
        </p>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 40px 60px', gap: 24, flexWrap: 'wrap' }}>
        {products.map((p, i) => (
          
            <a
key={p.id}
            href={`/catalogo/${toSlug(p.name)}`}
            className="product-card"
            style={{ animationDelay: `${i * 0.1}s`, textDecoration: 'none', borderRadius: 20, overflow: 'hidden', position: 'relative', width: 320, height: 420, display: 'block', boxShadow: hovered === p.id ? '0 24px 60px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.3)', transition: 'box-shadow 0.3s ease, transform 0.3s ease', transform: hovered === p.id ? 'translateY(-6px)' : 'translateY(0)' }}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2, background: '#1B2F5E' }}>
              {[...Array(4)].map((_, j) => (
                <div key={j} style={{ background: `rgba(45,107,228,${0.15 + j * 0.08})` }} />
              ))}
            </div>

            <div className="card-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,20,50,0.95) 40%, rgba(10,20,50,0.3) 100%)', transition: 'opacity 0.3s ease' }} />

            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 24px' }}>
              <h2 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{p.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Ver catálogo</span>
                <span style={{ color: '#2D6BE4', fontSize: 18 }}>→</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <footer style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
        <strong>INKORA®</strong> Soluciones Gráficas — Todos los derechos reservados © 2026
      </footer>
    </div>
  );
}