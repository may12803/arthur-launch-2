'use client';

import { useState } from 'react';

interface ApiLogoProps {
  domain: string;
  name: string;
  size?: number;
}

export function ApiLogo({ domain, name, size = 28 }: ApiLogoProps) {
  const [stage, setStage] = useState<'clearbit' | 'favicon' | 'monogram'>('clearbit');

  const clearbitSrc = `https://logo.clearbit.com/${domain}`;
  const faviconSrc = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  const letter = name.charAt(0).toUpperCase();

  if (stage === 'monogram') {
    return (
      <div style={{
        width: size, height: size, borderRadius: 6,
        background: '#0B504F', color: '#ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.floor(size * 0.45), fontWeight: 600,
        flexShrink: 0, letterSpacing: '-.01em',
        fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)',
      }}>
        {letter}
      </div>
    );
  }

  return (
    <img
      src={stage === 'clearbit' ? clearbitSrc : faviconSrc}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: 6, objectFit: 'contain', flexShrink: 0 }}
      onError={() => {
        if (stage === 'clearbit') setStage('favicon');
        else setStage('monogram');
      }}
    />
  );
}
