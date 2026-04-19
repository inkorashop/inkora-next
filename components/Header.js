'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/contexts/CartContext';

export default function Header({ headerVisible = true, showCart = false, page = 'landing' }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(null);
  const [uiSettings, setUiSettings] = useState({});
  const cartRef = useRef(null);
  const { cartItems, totalItems, removeFromCart } = useCart();

  useEffect(() => {
    const saved = localStorage.getItem('inkora_theme');
    if (saved) {
      setDarkMode(saved === 'dark');
    } else {
      supabase.from('settings').select('value').eq('key', 'landing_mode').single()
        .then(({ data }) => { if (data) setDarkMode(data.value === 'dark'); });
    }
    supabase.from('settings').select('*')
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(s => { map[s.key] = s.value; });
          setUiSettings(map);
        }
      });
  }, []);

  useEffect(() => {
    if (darkMode === null) return;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('inkora_theme', darkMode ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('inkora_theme_change', { detail: darkMode ? 'dark' : 'light' }));
  }, [darkMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id); else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (cartRef.current && !cartRef.current.contains(e.target)) {
        setCartOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
  }

  return (
    <header style={{ background: '#1B2F5E', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 16px rgba(27,47,94,0.25)', transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)', transition: 'transform 0.3s ease' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', transition: 'transform 0.3s ease, filter 0.3s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(45,107,228,1))'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none'; }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3851.7 5415.62" style={{ height: 36, width: 'auto', fill: 'white', fillRule: 'evenodd' }}>
            <path d="M2716.33 2392.49l-395.78 595.37c104.16,158.12 210.84,282.15 210.95,500.49 0.14,332.45 -270.51,604.21 -604.21,604.21 -333.68,0 -604.2,-270.51 -604.2,-604.21 0,-110.21 29.53,-213.62 81.1,-302.66l1318.42 -1991.44c45.9,69.66 91.82,139.33 137.72,208.99 219.36,332.58 448.72,664.89 660.52,1001.6 107.52,170.93 183.37,342.58 247.33,533.71 95.44,302.36 100.58,561.17 57.96,872.87 -4.02,28.43 -8.92,55.75 -14.61,83.83 -193.2,899.02 -969.61,1506.15 -1884.24,1520.38 -1064.41,0 -1927.27,-862.86 -1927.27,-1927.27 0,-390.76 116.29,-754.35 316.16,-1058.06 199.85,-303.71 1619.83,-2430.3 1619.83,-2430.3l394.76 599.32 -1464.04 2175.48c-137.37,203.78 -217.56,449.31 -217.56,713.55 0,705.9 572.23,1278.13 1278.12,1278.13 705.9,0 1278.13,-572.23 1278.13,-1278.13 0,-252.97 -73.51,-488.77 -200.3,-687.23l-288.79 -408.63z"/>
          </svg>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

          {darkMode !== null && uiSettings[`${page}_show_theme`] !== 'false' && (
            <div
              onClick={() => setDarkMode(v => !v)}
              title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="header-btn" style={{ width: 64, height: 32, borderRadius: 16, background: darkMode ? '#0f1e3d' : 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.2)', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', transition: 'background 0.3s ease, box-shadow 0.3s ease', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', width: 26, height: 26, borderRadius: '50%', background: '#2D6BE4', top: 2, left: darkMode ? 'calc(100% - 28px)' : 2, transition: 'left 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                {darkMode ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="12" y1="21" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="1" y1="12" x2="3" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="21" y1="12" x2="23" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
              <div style={{ position: 'absolute', left: 7, display: 'flex', alignItems: 'center', opacity: darkMode ? 0.3 : 0, transition: 'opacity 0.3s' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="21" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="1" y1="12" x2="3" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="21" y1="12" x2="23" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ position: 'absolute', right: 7, display: 'flex', alignItems: 'center', opacity: darkMode ? 0 : 0.3, transition: 'opacity 0.3s' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              </div>
            </div>
          )}

          {showCart && uiSettings[`${page}_show_cart`] !== 'false' && (
            <div ref={cartRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setCartOpen(v => !v)}
                className="header-btn" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 8, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="20" height="20">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                {totalItems > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -6, background: '#2D6BE4', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {totalItems}
                  </span>
                )}
              </button>

              {cartOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, width: 300, background: 'rgba(27,47,94,0.92)', backdropFilter: 'blur(16px)', borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', zIndex: 300 }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Tu Pedido</span>
                    <span style={{ background: '#2D6BE4', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{totalItems} items</span>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto', padding: '8px 0' }}>
                    {cartItems.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                        Tu pedido está vacío
                      </div>
                    ) : (
                      cartItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
                          {item.image_url && <img src={item.image_url} alt={item.name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>x{item.qty}</div>
                          </div>
                          <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>x</button>
                        </div>
                      ))
                    )}
                  </div>
                  {cartItems.length > 0 && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <a href="/catalogo" style={{ display: 'block', background: '#2D6BE4', color: 'white', textAlign: 'center', padding: '10px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                        Ver pedido completo
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {uiSettings[`${page}_show_account`] !== 'false' && user ? (
            <div style={{ position: 'relative' }}>
              <button className="header-btn" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }} onClick={() => setUserMenuOpen(v => !v)}>
                {profile?.name || user.email?.split('@')[0]} {'▾'}
              </button>
              {userMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 10, boxShadow: '0 4px 16px rgba(27,47,94,0.12)', minWidth: 160, zIndex: 200, overflow: 'hidden' }} onClick={() => setUserMenuOpen(false)}>
                  <a href="/dashboard" style={{ display: 'block', padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1B2F5E', textDecoration: 'none', borderBottom: '1px solid #eef0f6' }}>Mi cuenta</a>
                  <button style={{ display: 'block', width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Barlow, sans-serif' }} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
                </div>
              )}
            </div>
          ) : (
            uiSettings[`${page}_show_account`] !== 'false' && <button className="header-btn" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }} onClick={() => window.location.href = '/catalogo'}>
              Ingresar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}