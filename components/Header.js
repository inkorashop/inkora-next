'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Header({ headerVisible = true }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
  }

  return (
    <header style={{ background: '#1B2F5E', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 16px rgba(27,47,94,0.25)', transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)', transition: 'transform 0.3s ease' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3851.7 5415.62" style={{ height: 36, width: 'auto', fill: 'white' }}>
            <path d="M2716.33 2392.49l-395.78 595.37c104.16,158.12 210.84,282.15 210.95,500.49 0.14,332.45 -270.51,604.21 -604.21,604.21 -333.68,0 -604.2,-270.51 -604.2,-604.21 0,-110.21 29.53,-213.62 81.1,-302.66l1318.42 -1991.44c45.9,69.66 91.82,139.33 137.72,208.99 219.36,332.58 448.72,664.89 660.52,1001.6 107.52,170.93 183.37,342.58 247.33,533.71 95.44,302.36 100.58,561.17 57.96,872.87 -4.02,28.43 -8.92,55.75 -14.61,83.83 -193.2,899.02 -969.61,1506.15 -1884.24,1520.38 -1064.41,0 -1927.27,-862.86 -1927.27,-1927.27 0,-390.76 116.29,-754.35 316.16,-1058.06 199.85,-303.71 1619.83,-2430.3 1619.83,-2430.3l394.76 599.32 -1464.04 2175.48c-137.37,203.78 -217.56,449.31 -217.56,713.55 0,705.9 572.23,1278.13 1278.12,1278.13 705.9,0 1278.13,-572.23 1278.13,-1278.13 0,-252.97 -73.51,-488.77 -200.3,-687.23l-288.79 -408.63z"/>
          </svg>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user ? (
            <div style={{ position: 'relative' }}>
              <button style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }} onClick={() => setUserMenuOpen(v => !v)}>
                {profile?.name || user.email?.split('@')[0]} ▾
              </button>
              {userMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 10, boxShadow: '0 4px 16px rgba(27,47,94,0.12)', minWidth: 160, zIndex: 200, overflow: 'hidden' }} onClick={() => setUserMenuOpen(false)}>
                  <a href="/dashboard" style={{ display: 'block', padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1B2F5E', textDecoration: 'none', borderBottom: '1px solid #eef0f6' }}>Mi cuenta</a>
                  <button style={{ display: 'block', width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Barlow, sans-serif' }} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
                </div>
              )}
            </div>
          ) : (
            <button style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }} onClick={() => window.location.href = '/catalogo'}>
              Ingresar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}