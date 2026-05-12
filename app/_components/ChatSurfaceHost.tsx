'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVoice } from './VoiceContext';
import { ChatSurface } from './ChatSurface';

function ChatSurfaceInner() {
  const { voiceActive, openVoice } = useVoice();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('chat') ?? undefined;
  return <ChatSurface voiceActive={voiceActive} onOpenVoice={openVoice} sessionId={sessionId} />;
}

/**
 * ChatSurfaceHost — wires VoiceContext + URL chat session into ChatSurface.
 * Suspense boundary required because useSearchParams suspends during SSR
 * prerender.
 */
export function ChatSurfaceHost() {
  return (
    <Suspense fallback={null}>
      <ChatSurfaceInner />
    </Suspense>
  );
}
