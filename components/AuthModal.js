'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { signInWithGoogle } from '@/lib/auth';

const supabase = createBrowserSupabaseClient();
const AUTH_TIMEOUT_MS = 18000;

function withTimeout(promise, message = 'La operacion demoro demasiado. Intenta de nuevo.') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('Respuesta invalida del servidor. Intenta de nuevo.');
      }
    }
    if (!res.ok) throw new Error(payload.error || 'No se pudo completar la operacion.');
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La conexion demoro demasiado. Intenta de nuevo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function translateError(msg) {
  if (!msg) return 'Ocurrio un error. Intenta de nuevo.';
  const m = msg.toLowerCase();
  if (m.includes('email not confirmed')) return 'Por favor confirma tu email antes de ingresar.';
  if (
    m.includes('invalid login credentials') ||
    m.includes('invalid email or password') ||
    m.includes('email and password') ||
    m.includes('wrong password')
  ) return 'Email o contraseña incorrectos.';
  if (
    m.includes('user already registered') ||
    m.includes('already been registered') ||
    m.includes('already registered')
  ) return 'Ya existe una cuenta con ese email.';
  if (
    m.includes('password should be at least') ||
    m.includes('password must be at least') ||
    m.includes('at least 6')
  ) return 'La contraseña debe tener al menos 6 caracteres.';
  if (
    m.includes('unable to validate email') ||
    m.includes('invalid email')
  ) return 'El email ingresado no es valido.';
  if (
    m.includes('email rate limit') ||
    m.includes('too many requests') ||
    m.includes('rate limit')
  ) return 'Demasiados intentos. Espera unos minutos.';
  if (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('conexion') ||
    m.includes('demoro demasiado')
  ) return 'Error de conexion. Intenta de nuevo en unos segundos.';
  if (m.includes('signup') && m.includes('disabled')) return 'El registro esta deshabilitado temporalmente.';
  return msg;
}

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const isDark = typeof window !== 'undefined' ? localStorage.getItem('inkora_theme') === 'light' : false;

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
    if (nextMode !== 'reset') setResetSent(false);
  }

  async function handleSubmit() {
    setError('');
    setMessage('');
    if (!form.email || !form.password) {
      setError('Completa todos los campos.');
      return;
    }

    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      const password = form.password;

      if (mode === 'login') {
        let { data, error: signInError } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password })
        );

        if (signInError?.message?.toLowerCase().includes('email not confirmed')) {
          const result = await fetchJsonWithTimeout('/api/auth/auto-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (result.confirmed) {
            ({ data, error: signInError } = await withTimeout(
              supabase.auth.signInWithPassword({ email, password })
            ));
          }
        }

        if (signInError) throw signInError;
        if (!data.user) throw new Error('invalid login credentials');
        window.dispatchEvent(new CustomEvent('inkora_auth_success'));
        onSuccess(data.user, { event_type: 'auth_login', method: 'email' });
        return;
      }

      const name = form.name.trim();
      const phone = form.phone.trim();
      if (!name) {
        setError('Ingresa el nombre de tu comercio.');
        return;
      }
      if (!phone) {
        setError('Ingresa tu telefono.');
        return;
      }

      const result = await fetchJsonWithTimeout('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, phone }),
      });

      if (result.confirmationRequired) {
        const { data, error: signUpError } = await withTimeout(supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name, phone, send_confirmation_email: false } },
        }));

        if (signUpError) throw signUpError;
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError('Ya existe una cuenta con ese email.');
          return;
        }
        if (!data.user) {
          setError('Ocurrio un error. Intenta de nuevo.');
          return;
        }
        if (!data.session) {
          setMessage('Cuenta creada. Revisa tu email para confirmar el acceso antes de ingresar.');
          setForm(current => ({ ...current, password: '' }));
          setMode('login');
          return;
        }
        window.dispatchEvent(new CustomEvent('inkora_auth_success'));
        onSuccess(data.user, { event_type: 'auth_register', method: 'email' });
        return;
      }

      const { data, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password })
      );
      if (signInError) throw signInError;
      if (!data.user) {
        setError('Ocurrio un error. Intenta de nuevo.');
        return;
      }
      window.dispatchEvent(new CustomEvent('inkora_auth_success'));
      onSuccess(data.user, { event_type: 'auth_register', method: 'email' });
    } catch (e) {
      setError(translateError(e.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setError('');
    setMessage('');
    if (!form.email) {
      setError('Ingresa tu email.');
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await withTimeout(supabase.auth.resetPasswordForEmail(form.email.trim().toLowerCase(), {
        redirectTo: 'https://www.inkora.com.ar/auth/reset-password',
      }));
      if (resetError) {
        setError(translateError(resetError.message));
        return;
      }
      setResetSent(true);
    } catch (e) {
      setError(translateError(e.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setMessage('');
    setLoading(true);
    const { error: googleError } = await signInWithGoogle();
    setLoading(false);
    if (googleError) setError(translateError(googleError.message));
    else onSuccess?.(null, { event_type: 'auth_login', method: 'google' });
  }

  const modalBg = isDark ? 'rgba(27,47,94,0.75)' : 'rgba(240,244,255,0.82)';
  const headerBg = isDark ? 'rgba(15,30,61,0.6)' : 'rgba(200,215,255,0.5)';
  const headerColor = isDark ? 'white' : '#1B2F5E';
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
  const inputStyle = { ...styles.input, background: inputBg, color: inputColor, border: inputBorder };

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...styles.modal, background: modalBg }}>
        <div style={{ ...styles.header, background: headerBg, color: headerColor }}>
          <span>{mode === 'login' ? 'Iniciar sesion' : mode === 'reset' ? 'Recuperar acceso' : 'Crear cuenta'}</span>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>
        <div style={styles.body}>
          {mode !== 'reset' && (
            <div style={{ ...styles.tabs, background: tabBg }}>
              <button
                style={{ ...styles.tab, color: mode === 'login' ? tabActiveColor : tabColor, background: mode === 'login' ? tabActiveBg : 'none', boxShadow: mode === 'login' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}
                onClick={() => switchMode('login')}
              >
                Ingresar
              </button>
              <button
                style={{ ...styles.tab, color: mode === 'register' ? tabActiveColor : tabColor, background: mode === 'register' ? tabActiveBg : 'none', boxShadow: mode === 'register' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}
                onClick={() => switchMode('register')}
              >
                Registrarse
              </button>
            </div>
          )}

          {mode !== 'reset' && (
            <button style={{ ...styles.btnGoogle, opacity: loading ? 0.65 : 1 }} disabled={loading} onClick={handleGoogle}>
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar con Google
            </button>
          )}

          {mode !== 'reset' && (
            <div style={{ ...styles.divider, borderTopColor: dividerColor }}>
              <span style={{ padding: '0 10px', position: 'relative', zIndex: 1, color: dividerTextColor }}>o</span>
            </div>
          )}

          {mode === 'register' && (
            <>
              <div style={styles.formGroup}>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre de tu comercio" />
              </div>
              <div style={styles.formGroup}>
                <input style={inputStyle} type="tel" inputMode="numeric" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Telefono - ej: 3764000000" />
              </div>
            </>
          )}

          {mode !== 'reset' && (
            <>
              <div style={styles.formGroup}>
                <input
                  style={inputStyle}
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder={mode === 'register' ? 'Email - ej: tu@email.com' : 'tu@email.com'}
                />
              </div>
              <div style={styles.formGroup}>
                <input
                  style={inputStyle}
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder={mode === 'register' ? 'Contraseña - minimo 6 caracteres' : '******'}
                />
              </div>
              {message && <div style={styles.messageBox}>{message}</div>}
              {error && <div style={styles.errorBox}>{error}</div>}
              <button style={{ ...styles.btnEmail, background: btnEmailBg, color: btnEmailColor, border: btnEmailBorder, opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={handleSubmit}>
                {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
              </button>
            </>
          )}

          {mode === 'login' && (
            <>
              <p style={{ ...styles.hint, color: hintColor }}>No tenes cuenta? <button style={{ ...styles.linkBtn, color: linkColor }} onClick={() => switchMode('register')}>Registrate gratis</button></p>
              <p style={{ ...styles.hint, color: hintColor, marginTop: 4 }}>
                <button style={{ ...styles.linkBtn, color: hintColor, textDecoration: 'underline' }} onClick={() => switchMode('reset')}>Olvidaste tu contraseña?</button>
              </p>
            </>
          )}

          {mode === 'reset' && !resetSent && (
            <div>
              <p style={{ ...styles.hint, color: hintColor, marginBottom: 12, textAlign: 'left' }}>Ingresa tu email y te mandamos un link para resetear tu contraseña.</p>
              <div style={styles.formGroup}>
                <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@email.com" onKeyDown={e => { if (e.key === 'Enter') handleReset(); }} />
              </div>
              {message && <div style={styles.messageBox}>{message}</div>}
              {error && <div style={styles.errorBox}>{error}</div>}
              <button style={{ ...styles.btnEmail, background: btnEmailBg, color: btnEmailColor, border: btnEmailBorder, opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={handleReset}>
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>
              <p style={{ ...styles.hint, color: hintColor, marginTop: 8 }}>
                <button style={{ ...styles.linkBtn, color: hintColor, textDecoration: 'underline' }} onClick={() => switchMode('login')}>Volver</button>
              </p>
            </div>
          )}

          {mode === 'reset' && resetSent && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>Email</div>
              <p style={{ color: hintColor, fontSize: 14, lineHeight: 1.5 }}>Te mandamos un email con el link para resetear tu contraseña. Revisa tu bandeja de entrada.</p>
              <button style={{ ...styles.linkBtn, color: linkColor, marginTop: 16, display: 'block', margin: '16px auto 0' }} onClick={() => switchMode('login')}>Volver al inicio</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, backdropFilter: 'blur(4px)', overflowY: 'auto', overscrollBehavior: 'contain' },
  modal: { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 16, width: '100%', maxWidth: 400, maxHeight: 'calc(100dvh - 24px)', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column' },
  header: { padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 },
  closeBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  body: { padding: 24, display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  tabs: { display: 'flex', borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif', transition: 'background 0.2s, color 0.2s' },
  formGroup: { marginBottom: 12 },
  input: { width: '100%', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  errorBox: { background: 'rgba(220,38,38,0.2)', color: '#fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14, border: '1px solid rgba(220,38,38,0.3)' },
  messageBox: { background: 'rgba(22,163,74,0.18)', color: '#bbf7d0', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14, border: '1px solid rgba(22,163,74,0.35)' },
  btnEmail: { width: '100%', borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontFamily: 'Barlow, sans-serif' },
  divider: { textAlign: 'center', fontSize: 12, marginBottom: 16, marginTop: 4, position: 'relative', borderTop: '1px solid' },
  btnGoogle: { width: '100%', background: 'white', color: '#2d3352', border: 'none', borderRadius: 10, padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', fontFamily: 'Barlow, sans-serif' },
  hint: { textAlign: 'center', fontSize: 13 },
  linkBtn: { background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'Barlow, sans-serif' },
};
