'use client';

import { useVoice } from './VoiceContext';
import { ChatSurface } from './ChatSurface';

/**
 * ChatSurfaceHost — wires VoiceContext into ChatSurface so the
 * chat input's "talk" button + the topbar talk button share state.
 * Thin adapter; all real logic lives in ChatSurface.
 */
export function ChatSurfaceHost() {
  const { voiceActive, openVoice } = useVoice();
  return <ChatSurface voiceActive={voiceActive} onOpenVoice={openVoice} />;
}
