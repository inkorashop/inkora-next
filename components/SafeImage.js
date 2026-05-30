'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';

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
  ...props
}) {
  const candidates = useMemo(() => buildCandidates(src), [src]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [src]);

  if (!candidates.length || failed) {
    return fallback || <DefaultFallback style={style} compact={compactFallback} />;
  }

  return (
    <img
      {...props}
      src={candidates[candidateIndex]}
      alt={alt}
      style={style}
      loading={props.loading || 'lazy'}
      decoding={props.decoding || 'async'}
      referrerPolicy={props.referrerPolicy || 'no-referrer'}
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
