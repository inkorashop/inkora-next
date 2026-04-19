'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

function translateError(msg) {
  if (!msg) return 'Ocurrió un error. Intentá de nuevo.';
  const m = msg.toLowerCase();
  if (m.includes('email not confirmed'))            return 'Por favor confirmá tu email antes de ingresar.';
  if (m.includes('invalid login credentials') ||
      m.includes('invalid email or password') ||
      m.includes('email and password') ||
      m.includes('wrong password'))                 return 'Email o contraseña incorrectos.';
  if (m.includes('user already registered') ||
      m.includes('already been registered') ||
      m.includes('already registered'))             return 'Ya existe una cuenta con ese email.';
  if (m.includes('password should be at least') ||
      m.includes('password must be at least') ||
      m.includes('at least 6'))                     return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('unable to validate email') ||
      m.includes('invalid email'))                  return 'El email ingresado no es válido.';
  if (m.includes('email rate limit') ||
      m.includes('too many requests') ||
      m.includes('rate limit'))                     return 'Demasiados intentos. Esperá unos minutos.';
  if (m.includes('network') ||
      m.includes('fetch'))                          return 'Error de conexión. Verificá tu internet.';
  if (m.includes('signup') && m.includes('disabled')) return 'El registro está deshabilitado temporalmente.';
  return msg;
}

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isDark = typeof window !== 'undefined' ? localStorage.getItem('inkora_theme') === 'light' : false;

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
      setError(translateError(e.message));
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError('');
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://www.inkora.com.ar/auth/callback' },
    });
    if (e) setError(translateError(e.message));
  }

  const modalBg = isDark ? 'rgba(27,47,94,0.75)' : 'rgba(240,244,255,0.82)';
  const headerBg = isDark ? 'rgba(15,30,61,0.6)' : 'rgba(200,215,255,0.5)';
  const headerColor = isDark ? 'white' : '#1B2F5E';
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(27,47,94,0.7)';
  const inputBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.6)';
  const inputColor = isDark ? 'white' : '#1B2F5E';
  const inputBorder = isDark ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px solid rgba(27,47,94,0.2)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(27,47,94,0.15)';
  const dividerTextColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(27,47,94,0.4)';
  const tabBg = isDark ? 'rgba(0,0,0,0.2)' : 'rgba(27,47,94,0.08)';
  const tabColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(27,47,94,0.4)';
  const tabActiveColor = isDark ? 'white' : '#1B2F5E';
  const tabActiveBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)';
  const btnEmailBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(27,47,94,0.15)';
  const btnEmailColor = isDark ? 'white' : '#1B2F5E';
  const btnEmailBorder = isDark ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px solid rgba(27,47,94,0.2)';
  const hintColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(27,47,94,0.5)';
  const linkColor = isDark ? '#93c5fd' : '#2D6BE4';

  const s = styles;
  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{...s.modal, background: modalBg}}>
        <div style={{...s.header, background: headerBg, color: headerColor}}>
          <span>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.body}>

          <div style={{...s.tabs, background: tabBg}}>
            <button style={{...s.tab, color: mode === 'login' ? tabActiveColor : tabColor, background: mode === 'login' ? tabActiveBg : 'none', boxShadow: mode === 'login' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none'}} onClick={() => { setMode('login'); setError(''); }}>
              Ingresar
            </button>
            <button style={{...s.tab, color: mode === 'register' ? tabActiveColor : tabColor, background: mode === 'register' ? tabActiveBg : 'none', boxShadow: mode === 'register' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none'}} onClick={() => { setMode('register'); setError(''); }}>
              Registrarse
            </button>
          </div>

          <button style={s.btnGoogle} onClick={handleGoogle}>
            <svg viewBox="0 0 24 24" width="20" height="20" style={{flexShrink:0}}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <div style={{...s.divider, borderTopColor: dividerColor}}>
            <span style={{padding:'0 10px', position:'relative', zIndex:1, color: dividerTextColor}}>o</span>
          </div>

          {mode === 'register' && (
            <div style={s.formGroup}>
              <label style={{...s.label, color: labelColor}}>Nombre</label>
              <input style={{...s.input, background: inputBg, color: inputColor, border: inputBorder}} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Tu nombre" />
            </div>
          )}

          <div style={s.formGroup}>
            <label style={{...s.label, color: labelColor}}>Email</label>
            <input style={{...s.input, background: inputBg, color: inputColor, border: inputBorder}} type="email" value={form.email}
              onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="tu@email.com" />
          </div>

          <div style={s.formGroup}>
            <label style={{...s.label, color: labelColor}}>Contraseña</label>
            <input style={{...s.input, background: inputBg, color: inputColor, border: inputBorder}} type="password" value={form.password}
              onChange={e => setForm(f => ({...f, password: e.target.value}))}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••'} />
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <button style={{...s.btnEmail, background: btnEmailBg, color: btnEmailColor, border: btnEmailBorder, opacity: loading ? 0.6 : 1}} disabled={loading} onClick={handleSubmit}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>

          {mode === 'login' && (
            <p style={{...s.hint, color: hintColor}}>¿No tenés cuenta? <button style={{...s.linkBtn, color: linkColor}} onClick={() => { setMode('register'); setError(''); }}>Registrate gratis</button></p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' },
  modal: { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 16, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' },
  header: { padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' },
  closeBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  body: { padding: 24, display: 'flex', flexDirection: 'column' },
  tabs: { display: 'flex', borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', transition: 'background 0.2s, color 0.2s' },
  formGroup: { marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  input: { width: '100%', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  errorBox: { background: 'rgba(220,38,38,0.2)', color: '#fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14, border: '1px solid rgba(220,38,38,0.3)' },
  btnEmail: { width: '100%', borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontFamily: 'Barlow, sans-serif' },
  divider: { textAlign: 'center', fontSize: 12, marginBottom: 16, marginTop: 4, position: 'relative', borderTop: '1px solid' },
  btnGoogle: { width: '100%', background: 'white', color: '#2d3352', border: 'none', borderRadius: 10, padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', fontFamily: 'Barlow, sans-serif' },
  hint: { textAlign: 'center', fontSize: 13 },
  linkBtn: { background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'Barlow, sans-serif' },
};