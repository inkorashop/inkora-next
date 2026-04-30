'use client';
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'inkora_session_id';
const SESSION_TS_KEY = 'inkora_session_last_seen';
const SESSION_GAP_MS = 20 * 60 * 1000;

let globalClickMounted = false;
let globalTrackFn = null;

function nowIso() {
  return new Date().toISOString();
}

function readSession() {
  if (typeof window === 'undefined') return { sessionId: null, isNew: false, reason: null };

  const now = Date.now();
  const lastSeen = Number(localStorage.getItem(SESSION_TS_KEY) || 0);
  let sessionId = localStorage.getItem(SESSION_KEY);
  let isNew = false;
  let reason = null;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    isNew = true;
    reason = 'new_visitor';
  } else if (!lastSeen || now - lastSeen > SESSION_GAP_MS) {
    sessionId = crypto.randomUUID();
    isNew = true;
    reason = 'inactivity_gap';
  }

  localStorage.setItem(SESSION_KEY, sessionId);
  localStorage.setItem(SESSION_TS_KEY, String(now));
  return { sessionId, isNew, reason };
}

function getPageName() {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  if (path === '/') return 'landing';
  if (path === '/catalogo') return 'catalogo';
  if (path.startsWith('/catalogo/')) return 'catalogo/[producto]';
  if (path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/admin')) return 'admin';
  return path;
}

function getDeviceType() {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

function findTextElement(el) {
  let current = el;
  for (let i = 0; current && i < 4; i += 1) {
    const text = current.innerText?.trim();
    if (text) return current;
    current = current.parentElement;
  }
  return el;
}

function getClickMetadata(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return {};

  const textEl = findTextElement(target);
  const trackedEl = target.closest('[data-track]');
  const sectionEl = target.closest('[data-section]');
  const linkEl = target.closest('a');

  return {
    element_text: textEl?.innerText?.trim().slice(0, 100) || '',
    element_tag: target.tagName || '',
    element_id: target.id || '',
    data_track: trackedEl?.getAttribute('data-track') || '',
    href: linkEl?.href || '',
    section: sectionEl?.getAttribute('data-section') || '',
  };
}

export function useTrack() {
  const sessionRef = useRef(null);
  const userRef = useRef({ loaded: false, user: null, profile: null });
  const sessionStartSentRef = useRef(false);
  const ownsGlobalRef = useRef(false);

  const getSessionId = useCallback(() => {
    const sessionInfo = readSession();
    sessionRef.current = sessionInfo.sessionId;
    return sessionInfo;
  }, []);

  const getUserInfo = useCallback(async () => {
    if (userRef.current.loaded) return userRef.current;
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user || null;
    let profile = null;

    if (user?.id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .maybeSingle();
      profile = profileData || null;
    }

    userRef.current = { loaded: true, user, profile };
    return userRef.current;
  }, []);

  const track = useCallback((eventType, metadata = {}) => {
    if (typeof window === 'undefined' || !eventType) return;

    const sessionInfo = getSessionId();
    if (sessionInfo.isNew && !sessionStartSentRef.current && eventType !== 'session_start') {
      sessionStartSentRef.current = true;
      track('session_start', { reason: sessionInfo.reason });
    }

    getUserInfo()
      .then(({ user, profile }) => {
        const payload = {
          session_id: sessionInfo.sessionId,
          user_id: user?.id || null,
          is_anonymous: !user,
          user_email: user?.email || profile?.email || null,
          user_name: profile?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || null,
          event_type: eventType,
          metadata: metadata || {},
          page: getPageName(),
          device_type: getDeviceType(),
          created_at: nowIso(),
        };

        supabase.from('user_activity_events').insert(payload).then(() => {});
      })
      .catch(() => {});
  }, [getSessionId, getUserInfo]);

  useEffect(() => {
    if (!globalTrackFn) {
      globalTrackFn = track;
      window.__inkora_track = track;
      ownsGlobalRef.current = true;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      userRef.current = { loaded: false, user: null, profile: null };
    });

    if (!globalClickMounted) {
      globalClickMounted = true;
      document.addEventListener('click', event => {
        if (!globalTrackFn) return;
        if (window.location.pathname.startsWith('/admin')) return;
        globalTrackFn('click_global', getClickMetadata(event));
      });
    }

    return () => {
      subscription.unsubscribe();
      if (ownsGlobalRef.current && globalTrackFn === track) {
        globalTrackFn = null;
        if (window.__inkora_track === track) window.__inkora_track = null;
      }
    };
  }, [track]);

  return { track };
}
