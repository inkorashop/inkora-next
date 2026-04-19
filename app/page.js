'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP;

function toSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function Landing() {
  const [products, setProducts] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [uiSettings, setUiSettings] = useState({});

  useEffect(() => {
    supabase.from('products').select('*').eq('active', true).order('created_at')
      .then(({ data }) => { if (data) setProducts(data); });

    supabase.from('settings').select('*')
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(s => { map[s.key] = s.value; });
          setUiSettings(map);
        }
      });

    const handler = () => {
      const saved = localStorage.getItem('inkora_theme');
      if (saved) setDarkMode(saved === 'dark');
    };
    window.addEventListener('storage', handler);
    window.addEventListener('inkora_theme_change', e => setDarkMode(e.detail === 'dark'));

    const saved = localStorage.getItem('inkora_theme');
    if (saved) {
      setDarkMode(saved === 'dark');
    } else {
      supabase.from('settings').select('*').eq('key', 'landing_mode')
        .then(({ data }) => { if (data?.[0]) setDarkMode(data[0].value === 'dark'); });
    }

    let tabInterval;
    let tabToggle = false;

    function startTabAnim(cfg) {
      const text = cfg.tab_text || 'INKORA 🔷';
      const interval = parseInt(cfg.tab_interval) || 1000;
      const onAway = cfg.tab_on_away === 'true';
      const onActive = cfg.tab_on_active === 'true';
      clearInterval(tabInterval);

      if (!onAway && !onActive) return;

      function animate() {
        clearInterval(tabInterval);
        tabInterval = setInterval(() => {
          document.title = tabToggle ? 'INKORA' : text;
          tabToggle = !tabToggle;
        }, interval);
      }

      function stop() {
        clearInterval(tabInterval);
        tabToggle = false;
        document.title = 'INKORA';
      }

      if (onAway && onActive) {
        animate();
      } else {
        function handleVisibility() {
          if (document.hidden && onAway) { animate(); }
          else if (!document.hidden && onActive) { animate(); }
          else { stop(); }
        }
        document.addEventListener('visibilitychange', handleVisibility);
        if (onActive && !document.hidden) animate();
      }
    }

    supabase.from('settings').select('*').in('key', ['landing_tab_text', 'landing_tab_interval', 'landing_tab_on_away', 'landing_tab_on_active'])
      .then(({ data }) => {
        if (data) {
          const cfg = {};
          data.forEach(s => { cfg[s.key.replace('landing_', '')] = s.value; });
          startTabAnim(cfg);
        }
      });

    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('inkora_theme_change', handler);
      clearInterval(tabInterval);
    };
  }, []);

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", minHeight: '100vh', background: darkMode ? '#0f1e3d' : '#f0f4ff', display: 'flex', flexDirection: 'column', transition: 'background 0.3s ease' }}>
      <style>{`
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .page-exit { animation: fadeOut 0.3s ease forwards; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .product-card { animation: fadeUp 0.5s ease both; }
        .product-card:hover .card-overlay { opacity: 1 !important; }
        .product-card:hover .card-img { transform: scale(1.05); }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        .product-card:nth-child(1) { will-change: transform; animation: fadeUp 0.5s ease both, float 4s ease-in-out 0.5s infinite; }
        .product-card:nth-child(2) { will-change: transform; animation: fadeUp 0.5s ease both, float 4s ease-in-out 1.5s infinite; }
        .product-card:nth-child(3) { will-change: transform; animation: fadeUp 0.5s ease both, float 4s ease-in-out 2.5s infinite; }
        .product-card:nth-child(4) { will-change: transform; animation: fadeUp 0.5s ease both, float 4s ease-in-out 3.5s infinite; }
      `}</style>

      <Header showCart={true} page="landing" />

      <div style={{ textAlign: 'center', padding: '24px 24px 20px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: darkMode ? 'white' : '#1B2F5E', margin: 0, letterSpacing: -1 }}>
          {'\u00bfQu\u00e9 est\u00e1s buscando?'}
        </h1>
        <p style={{ color: darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(27,47,94,0.55)', fontSize: 15, marginTop: 8 }}>
          {'Eleg\u00ed un producto para ver el cat\u00e1logo completo'}
        </p>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 40px 60px', gap: 24, flexWrap: 'wrap' }}>
        {products.map((p, i) => (
          <a
            key={p.id}
            href="#"
            className="product-card"
            onClick={e => {
              e.preventDefault();
              document.body.classList.add('page-exit');
              setTimeout(() => { window.location.href = "/catalogo/" + toSlug(p.name); }, 280);
            }}
            style={{
              animationDelay: (i * 0.1) + "s",
              textDecoration: 'none',
              borderRadius: 20,
              overflow: 'hidden',
              position: 'relative',
              width: 320,
              height: 420,
              display: 'block',
              boxShadow: hovered === p.id ? '0 24px 60px rgba(45,107,228,0.5)' : '0 8px 32px rgba(0,0,0,0.3)',
              transition: 'box-shadow 0.3s ease, transform 0.3s ease',
              transform: 'translateY(0)',
              zIndex: hovered === p.id ? 0 : 1
            }}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ position: 'absolute', inset: 0, background: '#1B2F5E', overflow: 'hidden' }}>
              {p.landing_image
                ? <img src={p.landing_image} alt={p.name} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                : [...Array(4)].map((_, j) => (
                    <div key={j} style={{position:'absolute', width:'50%', height:'50%', top: j < 2 ? 0 : '50%', left: j % 2 === 0 ? 0 : '50%', background: 'rgba(45,107,228,' + (0.15 + j * 0.08) + ')'}} />
                  ))
              }
            </div>

            <div className="card-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,20,50,0.85) 30%, rgba(10,20,50,0.1) 100%)', transition: 'opacity 0.3s ease' }} />

            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 24px' }}>
              <h2 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{p.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{'Ver cat\u00e1logo'}</span>
                <span style={{ color: '#2D6BE4', fontSize: 18 }}>{'\u2192'}</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      {uiSettings['landing_show_whatsapp'] !== 'false' && (
        <a
          href={"https://wa.me/" + WHATSAPP + "?text=Hola!%20Vengo%20desde%20la%20p%C3%A1gina.%20"}
          target="_blank"
          rel="noreferrer"
          style={{ position: 'fixed', zIndex: 150, width: 56, height: 56, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(37,211,102,0.4)', textDecoration: 'none', bottom: 24, right: 24 }}
        >
          <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.934 1.395 5.604L0 24l6.532-1.372A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.368l-.36-.214-3.724.782.795-3.632-.235-.374A9.818 9.818 0 012.182 12C2.182 6.578 6.578 2.182 12 2.182S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/>
          </svg>
        </a>
      )}

      <footer style={{ textAlign: 'center', padding: '20px', color: darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(27,47,94,0.25)', fontSize: 12 }}>
        <strong>INKORA</strong> Soluciones Graficas — Todos los derechos reservados 2026
      </footer>
    </div>
  );
}