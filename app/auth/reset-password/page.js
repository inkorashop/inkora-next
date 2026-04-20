'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const LOGO = 'https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else setError('El link es inválido o ya expiró. Pedí uno nuevo.');
    });
  }, []);

  async function handleSubmit() {
    setError('');
    if (!password) { setError('Ingresá una contraseña.'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (e) { setError(e.message); return; }
    setSuccess(true);
    setTimeout(() => { window.location.href = '/'; }, 2500);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Barlow', sans-serif" }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(27,47,94,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <img src={LOGO} alt="INKORA" style={{ height: 48, marginBottom: 4 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1B2F5E', margin: 0 }}>Nueva contraseña</h2>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ color: '#15803d', fontWeight: 600, fontSize: 15 }}>¡Contraseña actualizada!</p>
            <p style={{ color: '#9aa3bc', fontSize: 13 }}>Redirigiendo...</p>
          </div>
        ) : !ready ? (
          <p style={{ color: error ? '#dc2626' : '#9aa3bc', fontSize: 14, textAlign: 'center' }}>
            {error || 'Verificando...'}
          </p>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#2d3352', boxSizing: 'border-box', outline: 'none' }}
            />
            <input
              type="password"
              placeholder="Repetir contraseña"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              style={{ width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#2d3352', boxSizing: 'border-box', outline: 'none' }}
            />
            {error && <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>{error}</div>}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}