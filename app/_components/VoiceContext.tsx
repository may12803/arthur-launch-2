'use client';

import { createContext, useContext } from 'react';

interface VoiceContextValue {
  voiceActive: boolean;
  openVoice: () => void;
}

export const VoiceContext = createContext<VoiceContextValue>({
  voiceActive: false,
  openVoice: () => {},
});

export function useVoice() {
  return useContext(VoiceContext);
}
