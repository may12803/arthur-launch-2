'use client';

import ChatInterface from './_components/ChatInterface';
import RightRail from './_components/RightRail';

export default function DashboardPage() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Chat pane */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <ChatInterface />
      </div>

      {/* Right rail — hidden on narrow screens via inline media query */}
      <div
        id="dash-rail"
        style={{
          width: 260,
          flexShrink: 0,
          borderLeft: '1px solid var(--glass-border)',
          overflowY: 'auto',
          background: 'var(--glass-bg)',
        }}
      >
        <RightRail />
      </div>

      {/* Hide rail on narrow viewports without style jsx */}
      <style>{`
        @media (max-width: 1080px) { #dash-rail { display: none; } }
      `}</style>
    </div>
  );
}
