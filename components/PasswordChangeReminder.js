'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ENABLED_KEY = 'password_change_prompt_enabled';
const DELAY_DAYS_KEY = 'password_change_prompt_delay_days';
const DEFAULT_DELAY_DAYS = 14;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysSince(iso) {
  if (!iso) return 0;
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.floor((Date.now() - start) / 86400000);
}

function isManualPromptDue(profile) {
  const requested = profile?.password_prompt_manual_requested_at;
  if (!requested) return false;
  const seen = profile?.password_prompt_manual_seen_at;
  if (!seen) return true;
  return new Date(requested).getTime() > new Date(seen).getTime();
}

function canShowReminder({ profile, settings, userId }) {
  if (!profile || !userId) return false;
  if (settings[ENABLED_KEY] === 'false') return false;
  if (profile.registration_source !== 'admin_invite') return false;
  if (profile.password_changed_by_user) return false;
  if (profile.deleted_at) return false;

  if (isManualPromptDue(profile)) return true;

  const parsedDelay = parseInt(settings[DELAY_DAYS_KEY], 10);
  const delayDays = Number.isFinite(parsedDelay) ? Math.max(0, parsedDelay) : DEFAULT_DELAY_DAYS;
  if (daysSince(profile.created_at) < delayDays) return false;

  const today = localDateKey();
  const localDismissed = typeof window !== 'undefined'
    ? localStorage.getItem(`inkora_password_prompt_dismissed_${userId}`)
    : '';
  return profile.password_prompt_dismissed_on !== today && localDismissed !== today;
}

export default function PasswordChangeReminder() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({});
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const closeTimerRef = useRef(null);

  const skipPage = pathname?.startsWith('/admin') || pathname?.startsWith('/auth');

  useEffect(() => {
    return () => clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (skipPage) {
      setVisible(false);
      return;
    }

    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }

    async function loadForUser(currentUser) {
      if (!currentUser?.id) {
        setUser(null);
        setProfile(null);
        setVisible(false);
        return;
      }

      const [{ data: profileData }, { data: settingRows }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
        supabase.from('settings').select('key,value').in('key', [ENABLED_KEY, DELAY_DAYS_KEY]),
      ]);

      const nextSettings = {};
      (settingRows || []).forEach(row => { nextSettings[row.key] = row.value; });

      setUser(currentUser);
      setProfile(profileData || null);
      setSettings(nextSettings);
      setVisible(canShowReminder({ profile: profileData, settings: nextSettings, userId: currentUser.id }));
      setClosing(false);
      setEditing(false);
      setSaved(false);
      setError('');
      setPassword('');
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadForUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      loadForUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [skipPage, pathname]);

  async function closeReminder(markSeen = true) {
    if (!user?.id) return;
    setClosing(true);

    if (markSeen) {
      const today = localDateKey();
      localStorage.setItem(`inkora_password_prompt_dismissed_${user.id}`, today);
      const patch = { password_prompt_dismissed_on: today };
      if (isManualPromptDue(profile)) patch.password_prompt_manual_seen_at = new Date().toISOString();
      await supabase.from('profiles').update(patch).eq('id', user.id).then(() => {});
    }

    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 220);
  }

  async function savePassword() {
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const now = new Date().toISOString();
    await supabase.from('profiles').update({
      admin_set_password: null,
      password_changed_by_user: true,
      password_changed_at: now,
      password_prompt_dismissed_on: localDateKey(),
      password_prompt_manual_seen_at: now,
    }).eq('id', user.id).then(() => {});

    setSaved(true);
    setPassword('');
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => closeReminder(false), 1800);
  }

  if (!visible) return null;

  return (
    <div
      className={`password-reminder${closing ? ' password-reminder-out' : ''}${saved ? ' password-reminder-saved' : ''}`}
      role="status"
      aria-live="polite"
    >
      <style>{`
        @keyframes passwordReminderIn {
          from { opacity: 0; transform: translate3d(-14px, 12px, 0) scale(0.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes passwordReminderOut {
          from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          to { opacity: 0; transform: translate3d(-10px, 8px, 0) scale(0.985); }
        }
        @keyframes passwordReminderMorph {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .password-reminder {
          position: fixed;
          left: 96px;
          bottom: 24px;
          z-index: 540;
          width: 392px;
          max-width: calc(100vw - 128px);
          box-sizing: border-box;
          background: white;
          border: 1.5px solid #c7d2fe;
          border-left: 6px solid #2D6BE4;
          border-radius: 14px;
          box-shadow: 0 18px 46px rgba(27,47,94,0.22);
          padding: 15px 16px;
          color: #2d3352;
          font-family: Barlow, sans-serif;
          animation: passwordReminderIn 240ms ease-out both;
        }
        .password-reminder-out {
          animation: passwordReminderOut 200ms ease-in both;
        }
        .password-reminder-saved {
          border-color: #86efac;
          border-left-color: #18a36a;
        }
        .password-reminder-edit {
          animation: passwordReminderMorph 180ms ease-out both;
        }
        @media (max-width: 767px) {
          .password-reminder {
            left: 16px;
            bottom: 148px;
            width: calc(100vw - 32px);
            max-width: calc(100vw - 32px);
          }
        }
      `}</style>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:14, fontWeight:900, color: saved ? '#15803d' : '#1B2F5E'}}>
            {saved ? 'Contraseña actualizada' : 'Recomendación de seguridad'}
          </div>
          <div style={{fontSize:13, color:'#4b587c', lineHeight:1.42, marginTop:5}}>
            Creamos tu cuenta desde admin. Por seguridad, cambiá tu contraseña una primera y única vez.
          </div>
        </div>
        {!saved && (
          <button
            type="button"
            onClick={() => closeReminder(true)}
            aria-label="Cerrar aviso"
            style={{background:'#eef4ff', border:'none', color:'#1B2F5E', cursor:'pointer', fontSize:20, lineHeight:1, width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}
          >
            ×
          </button>
        )}
      </div>

      {!saved && (
        <div style={{display:'flex', gap:8, alignItems:'center', marginTop:13, minHeight:36}}>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{background:'#1B2F5E', color:'white', border:'none', borderRadius:9, padding:'9px 14px', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:'Barlow, sans-serif'}}
            >
              Cambiar contraseña
            </button>
          ) : (
            <div className="password-reminder-edit" style={{display:'flex', gap:8, alignItems:'center', flex:'1 1 auto', minWidth:0}}>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') savePassword();
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setError('');
                    setPassword('');
                  }
                }}
                placeholder="Nueva contraseña"
                style={{height:36, minWidth:0, flex:'1 1 auto', border:'1.5px solid #c7d2fe', borderRadius:9, padding:'0 10px', color:'#1B2F5E', fontSize:13, fontFamily:'Barlow, sans-serif', boxSizing:'border-box'}}
              />
              <button
                type="button"
                onClick={savePassword}
                disabled={saving}
                style={{height:36, border:'none', borderRadius:9, padding:'0 13px', background:saving ? '#9aa3bc' : '#18a36a', color:'white', fontSize:13, fontWeight:900, cursor:saving ? 'not-allowed' : 'pointer', fontFamily:'Barlow, sans-serif', flexShrink:0}}
              >
                {saving ? 'Guardando' : 'Guardar'}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div style={{fontSize:12, color:'#dc2626', fontWeight:700, marginTop:8}}>{error}</div>}
      {saved && <div style={{fontSize:12, color:'#15803d', fontWeight:800, marginTop:8}}>Listo. Este aviso no volverá a aparecer.</div>}
    </div>
  );
}
