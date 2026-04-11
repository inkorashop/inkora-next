'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    if (!form.email || !form.password) { setError('Completá todos los campos.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { data, error: e } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (e) throw e;
        onSuccess(data.user);
      } else {
        if (!form.name.trim()) { setError('Ingresá tu nombre.'); setLoading(false); return; }
        const { data, error: e } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.name } },
        });
        if (e) throw e;
        onSuccess(data.user);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError('');
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://inkora-next.vercel.app/auth/callback' },
    });
    if (e) setError(e.message);
  }

  const s = styles;
  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <span>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.body}>
          <div style={s.tabs}>
            <button style={{...s.tab, ...(mode === 'login' ? s.tabActive : {})}} onClick={() => { setMode('login'); setError(''); }}>
              Ingresar
            </button>
            <button style={{...s.tab, ...(mode === 'register' ? s.tabActive : {})}} onClick={() => { setMode('register'); setError(''); }}>
              Registrarse
            </button>
          </div>

          {mode === 'register' && (
            <div style={s.formGroup}>
              <label style={s.label}>Nombre</label>
              <input style={s.input} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Tu nombre" />
            </div>
          )}

          <div style={s.formGroup}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={form.email}
              onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="tu@email.com" />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Contraseña</label>
            <input style={s.input} type="password" value={form.password}
              onChange={e => setForm(f => ({...f, password: e.target.value}))}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••'} />
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <button style={{...s.btnPrimary, opacity: loading ? 0.6 : 1}} disabled={loading} onClick={handleSubmit}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>

          <div style={s.divider}><span style={{background:'white', padding:'0 10px', position:'relative', zIndex:1}}>o</span></div>

          <button style={s.btnGoogle} onClick={handleGoogle}>
            <svg viewBox="0 0 24 24" width="18" height="18" style={{flexShrink:0}}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          {mode === 'login' && (
            <p style={s.hint}>¿No tenés cuenta? <button style={s.linkBtn} onClick={() => { setMode('register'); setError(''); }}>Registrate gratis</button></p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: 'white', borderRadius: 16, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' },
  header: { background: '#1B2F5E', color: 'white', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 16 },
  closeBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  body: { padding: 24, display: 'flex', flexDirection: 'column' },
  tabs: { display: 'flex', background: '#f7f8fc', borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, background: 'none', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 14, fontWeight: 600, color: '#9aa3bc', cursor: 'pointer' },
  tabActive: { background: 'white', color: '#1B2F5E', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  formGroup: { marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  input: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#2d3352', boxSizing: 'border-box', outline: 'none' },
  errorBox: { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 },
  btnPrimary: { width: '100%', background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16 },
  divider: { textAlign: 'center', color: '#dde1ef', fontSize: 12, marginBottom: 16, position: 'relative', borderTop: '1px solid #dde1ef', marginTop: 0 },
  btnGoogle: { width: '100%', background: 'white', color: '#2d3352', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 },
  hint: { textAlign: 'center', fontSize: 13, color: '#9aa3bc' },
  linkBtn: { background: 'none', border: 'none', color: '#2D6BE4', fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 },
};
