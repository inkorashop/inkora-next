'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';


function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusLabel(status) {
  const map = { pending: 'Pendiente', confirmed: 'Confirmado', completed: 'Completado', cancelled: 'Cancelado' };
  return map[status] || status;
}

function statusColor(status) {
  const map = { pending: '#f6a800', confirmed: '#2D6BE4', completed: '#18a36a', cancelled: '#e53e3e' };
  return map[status] || '#9aa3bc';
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('perfil');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'mispedidos' || tab === 'pedidos') setActiveTab('pedidos');
  }, []);

  function switchTab(key) {
    setActiveTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key === 'pedidos' ? 'mispedidos' : 'miperfil');
    window.history.replaceState(null, '', url.toString());
  }

  // Profile form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');

  // Orders
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showOrderStatus, setShowOrderStatus] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      if (!u) { router.replace('/'); return; }
      setUser(u);
      loadProfile(u.id, u.email);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId, email) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) {
      setName(data.name || '');
      setPhone(data.phone || '');
    }
    setLoading(false);
    loadOrders(email);
    supabase.from('settings').select('value').eq('key', 'show_order_status').single()
      .then(({ data }) => { if (data) setShowOrderStatus(data.value !== 'false'); });
  }

  async function loadOrders(email) {
    setLoadingOrders(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_email', email)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
    setLoadingOrders(false);
  }

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    await supabase.from('profiles').update({ name, phone }).eq('id', user.id);
    setSavingProfile(false);
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 2000);
  }

  async function changePassword() {
    setPasswordMsg('');
    if (!newPassword || !confirmPassword) { setPasswordMsg('Completá ambos campos.'); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg('Las contraseñas no coinciden.'); return; }
    if (newPassword.length < 6) { setPasswordMsg('Mínimo 6 caracteres.'); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordMsg('Error: ' + error.message);
    } else {
      setPasswordMsg('¡Contraseña actualizada!');
      setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setPasswordMsg(''), 3000);
    }
  }

  const inp = { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#2d3352', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow, sans-serif' }}>
      <div style={{ color: '#9aa3bc', fontSize: 16 }}>Cargando...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", minHeight: '100vh', background: '#f7f8fc' }}>

      {/* Header */}
      <header style={{ background: '#1B2F5E', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 16px rgba(27,47,94,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href="#"
            onClick={e => { e.preventDefault(); if (window.history.length > 1) window.history.back(); else router.replace('/'); }}
            style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', transition: 'transform 0.3s ease, filter 0.3s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(45,107,228,1))'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'none'; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3851.7 5415.62" style={{ height: 36, width: 'auto', fill: 'white', fillRule: 'evenodd' }}>
              <path d="M2716.33 2392.49l-395.78 595.37c104.16,158.12 210.84,282.15 210.95,500.49 0.14,332.45 -270.51,604.21 -604.21,604.21 -333.68,0 -604.2,-270.51 -604.2,-604.21 0,-110.21 29.53,-213.62 81.1,-302.66l1318.42 -1991.44c45.9,69.66 91.82,139.33 137.72,208.99 219.36,332.58 448.72,664.89 660.52,1001.6 107.52,170.93 183.37,342.58 247.33,533.71 95.44,302.36 100.58,561.17 57.96,872.87 -4.02,28.43 -8.92,55.75 -14.61,83.83 -193.2,899.02 -969.61,1506.15 -1884.24,1520.38 -1064.41,0 -1927.27,-862.86 -1927.27,-1927.27 0,-390.76 116.29,-754.35 316.16,-1058.06 199.85,-303.71 1619.83,-2430.3 1619.83,-2430.3l394.76 599.32 -1464.04 2175.48c-137.37,203.78 -217.56,449.31 -217.56,713.55 0,705.9 572.23,1278.13 1278.12,1278.13 705.9,0 1278.13,-572.23 1278.13,-1278.13 0,-252.97 -73.51,-488.77 -200.3,-687.23l-288.79 -408.63z"/>
            </svg>
          </a>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>|</span>
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>Mi Cuenta</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>{name || user?.email?.split('@')[0]}</span>
          <button
            style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 4 }}
            onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }}
          >Cerrar sesión</button>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 20, background: 'white', borderRadius: 10, border: '1.5px solid #dde1ef', overflow: 'hidden' }}>
          {[['perfil', 'Mi Perfil'], ['pedidos', 'Mis Pedidos']].map(([key, label]) => (
            <button key={key}
              style={{ flex: 1, padding: '13px 20px', border: 'none', background: activeTab === key ? '#1B2F5E' : 'white', color: activeTab === key ? 'white' : '#5a6380', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s, color 0.2s' }}
              onClick={() => switchTab(key)}
            >{label}</button>
          ))}
        </div>

        {/* ── PERFIL ── */}
        {activeTab === 'perfil' && (
          <>
            <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', padding: 24, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 22 }}>Información de perfil</h2>

<div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={lbl}>Nombre de tu comercio</label>
                  <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={{ ...inp, background: '#f7f8fc', color: '#9aa3bc', cursor: 'not-allowed' }}
                    value={user?.email || ''} readOnly />
                </div>
                <div>
                  <label style={lbl}>Teléfono</label>
                  <input style={inp} type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))} placeholder="3764000000" />
                </div>
              </div>

              <button
                style={{ marginTop: 22, background: savedProfile ? '#18a36a' : '#1B2F5E', color: 'white', border: 'none', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: savingProfile ? 0.6 : 1, transition: 'background 0.3s' }}
                onClick={saveProfile} disabled={savingProfile}
              >
                {savingProfile ? 'Guardando...' : savedProfile ? '✓ Guardado' : 'Guardar cambios'}
              </button>
            </div>

            {/* Cambiar contraseña */}
            <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', padding: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 20 }}>Cambiar contraseña</h2>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label style={lbl}>Nueva contraseña</label>
                  <input type="password" style={inp} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </div>
                <div>
                  <label style={lbl}>Confirmar contraseña</label>
                  <input type="password" style={inp} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repetí la contraseña" />
                </div>
              </div>
              {passwordMsg && (
                <div style={{ marginTop: 10, fontSize: 13, color: passwordMsg.startsWith('¡') ? '#18a36a' : '#e53e3e', fontWeight: 600 }}>
                  {passwordMsg}
                </div>
              )}
              <button
                style={{ marginTop: 18, background: 'white', color: '#1B2F5E', border: '1.5px solid #1B2F5E', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: savingPassword ? 0.6 : 1 }}
                onClick={changePassword} disabled={savingPassword}
              >
                {savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </>
        )}

        {/* ── PEDIDOS ── */}
        {activeTab === 'pedidos' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #dde1ef', padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 20 }}>
              Historial de pedidos {orders.length > 0 && <span style={{ fontSize: 13, color: '#9aa3bc', fontWeight: 400 }}>({orders.length})</span>}
            </h2>
            {loadingOrders ? (
              <p style={{ color: '#9aa3bc', fontSize: 13 }}>Cargando pedidos...</p>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9aa3bc' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
                <p style={{ fontSize: 14 }}>Todavía no tenés pedidos.</p>
                <a href="/" style={{ display: 'inline-block', marginTop: 12, background: '#1B2F5E', color: 'white', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Ver catálogo →</a>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Código', 'Fecha', 'Items', 'Total', ...(showOrderStatus ? ['Estado'] : [])].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dde1ef', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #f0f2f8' }}>
                        <td style={{ padding: '11px 10px', fontWeight: 700, color: '#1B2F5E', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{order.order_code}</td>
                        <td style={{ padding: '11px 10px', color: '#5a6380', whiteSpace: 'nowrap' }}>{formatDate(order.created_at)}</td>
                        <td style={{ padding: '11px 10px', color: '#2d3352', maxWidth: 220 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {Array.isArray(order.items) ? order.items.map(i => `${i.name} ×${i.qty}`).join(', ') : '—'}
                          </div>
                        </td>
                        <td style={{ padding: '11px 10px', fontWeight: 700, color: '#2d3352', whiteSpace: 'nowrap' }}>
                          {order.total ? `$${Number(order.total).toLocaleString()}` : '—'}
                        </td>
                        {showOrderStatus && (
                          <td style={{ padding: '11px 10px' }}>
                            <span style={{ background: `${statusColor(order.status)}20`, color: statusColor(order.status), borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {statusLabel(order.status)}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      <footer style={{ textAlign: 'center', padding: '20px', fontSize: 12, color: 'rgba(0,0,0,0.2)', letterSpacing: 1, marginTop: 20 }}>
        INKORA® Soluciones Gráficas
      </footer>
    </div>
  );
}
