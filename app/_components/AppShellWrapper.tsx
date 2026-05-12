'use client';

import { useState, useCallback } from 'react';
import { AppShell } from './AppShell';
import { VoiceOrb } from './VoiceOrb';
import { VoiceContext } from './VoiceContext';

/**
 * AppShellWrapper — thin client boundary that:
 * 1. Holds global voice-active state + provides VoiceContext to children
 * 2. Renders AppShell (sidebar + topbar)
 * 3. Conditionally renders VoiceOrb overlay
 *
 * This is the client component imported by the RSC layout.tsx.
 */
export function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const [voiceActive, setVoiceActive] = useState(false);

  const openVoice = useCallback(() => setVoiceActive(true), []);
  const closeVoice = useCallback(() => setVoiceActive(false), []);

  return (
    <VoiceContext.Provider value={{ voiceActive, openVoice }}>
      <AppShell onOpenVoice={openVoice} voiceActive={voiceActive}>
        {children}
      </AppShell>

      <VoiceOrb active={voiceActive} onEnd={closeVoice} />
    </VoiceContext.Provider>
  );
}
