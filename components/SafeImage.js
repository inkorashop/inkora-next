'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const SUPABASE_PUBLIC_ASSET_MARKER = '/storage/v1/object/public/assets/';

export function normalizeAssetUrl(src) {
  const raw = String(src || '').trim();
  if (!raw) return '';

  const httpsUrl = raw.replace(/^http:\/\//i, 'https://');

  try {
    const parsed = new URL(httpsUrl, typeof window !== 'undefined' ? window.location.origin : 'https://www.inkora.com.ar');

    if (parsed.pathname.includes('/storage/v1/object/sign/')) {
      parsed.pathname = parsed.pathname.replace('/storage/v1/object/sign/', '/storage/v1/object/public/');
      parsed.search = '';
    }

    // Supabase doesn't reliably honor long-lived Cache-Control on public
    // Storage URLs, so route through our own proxy (app/api/asset) which
    // re-serves the same file with a real long-lived cache header.
    const markerIdx = parsed.pathname.indexOf(SUPABASE_PUBLIC_ASSET_MARKER);
    if (markerIdx !== -1) {
      const assetPath = parsed.pathname.slice(markerIdx + SUPABASE_PUBLIC_ASSET_MARKER.length);
      return `/api/asset/${assetPath}`;
    }

    return parsed.toString();
  } catch {
    return httpsUrl.replace(/\s/g, '%20');
  }
}

function buildCandidates(src) {
  const normalized = normalizeAssetUrl(src);
  if (!normalized) return [];

  const candidates = [normalized];

  try {
    const parsed = new URL(normalized);
    if (parsed.search) {
      parsed.search = '';
      candidates.push(parsed.toString());
    }
  } catch {
    const clean = normalized.split('?')[0];
    if (clean && clean !== normalized) candidates.push(clean);
  }

  return [...new Set(candidates)];
}

function DefaultFallback({ style, compact = false }) {
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#eef0f6',
        color: '#8b95b3',
        fontSize: compact ? 9 : 11,
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1.2,
        padding: compact ? 2 : 8,
        boxSizing: 'border-box',
      }}
    >
      {compact ? '-' : 'Imagen no disponible'}
    </div>
  );
}

export default function SafeImage({
  src,
  alt = '',
  style,
  fallback = null,
  compactFallback = false,
  onError,
  onLoad,
  ...props
}) {
  const candidates = useMemo(() => buildCandidates(src), [src]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  // "loaded" gates opacity; "instant" skips the transition when the image
  // was already in the browser cache, so cached images never wait to appear.
  const [loaded, setLoaded] = useState(false);
  const [instant, setInstant] = useState(false);
  const imgRef = useRef(null);
  const currentSrc = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
    setLoaded(false);
    setInstant(false);
  }, [src]);

  useLayoutEffect(() => {
    if (imgRef.current?.complete) {
      setInstant(true);
      setLoaded(true);
    }
  }, [currentSrc]);

  if (!candidates.length || failed) {
    return fallback || <DefaultFallback style={style} compact={compactFallback} />;
  }

  return (
    <img
      ref={imgRef}
      {...props}
      src={currentSrc}
      alt={alt}
      style={{
        ...style,
        opacity: loaded ? (style?.opacity ?? 1) : 0,
        transition: instant ? 'none' : 'opacity .25s ease-out',
      }}
      loading={props.loading || 'lazy'}
      decoding={props.decoding || 'async'}
      referrerPolicy={props.referrerPolicy || 'no-referrer'}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex(index => index + 1);
          return;
        }
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
