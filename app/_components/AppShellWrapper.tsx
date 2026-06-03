'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from './AppShell';
import { VoiceOrb } from './VoiceOrb';
import { VoiceContext } from './VoiceContext';

/**
 * AppShellWrapper — thin client boundary that:
 * 1. Holds global voice-active state + provides VoiceContext to children
 * 2. Renders AppShell (sidebar + topbar)
 * 3. Conditionally renders VoiceOrb overlay
 *
 * Standalone routes (/login, /lock) render full-screen with NO shell.
 */
const STANDALONE = ['/login', '/lock'];

export function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const [voiceActive, setVoiceActive] = useState(false);
  const pathname = usePathname();

  const openVoice = useCallback(() => setVoiceActive(true), []);
  const closeVoice = useCallback(() => setVoiceActive(false), []);

  if (pathname && STANDALONE.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return <>{children}</>;
  }

  return (
    <VoiceContext.Provider value={{ voiceActive, openVoice }}>
      <AppShell onOpenVoice={openVoice} voiceActive={voiceActive}>
        {children}
      </AppShell>

      <VoiceOrb active={voiceActive} onEnd={closeVoice} />
    </VoiceContext.Provider>
  );
}
