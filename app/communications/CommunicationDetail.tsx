import { CommRow } from './CommunicationsList';

export default function CommunicationDetail({ comm }: { comm: CommRow }) {
  return (
    <div style={{ padding: '24px 28px', height: '100%', display: 'flex', flexDirection: 'column', background: '#FAF8F5' }}>
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid #E8E4DB', marginBottom: '20px' }}>
        <h2 style={{
          fontFamily: 'var(--font-lora, Lora, Georgia, serif)',
          fontSize: '18px',
          fontWeight: 500,
          color: '#1A1713',
          letterSpacing: '-0.02em',
          lineHeight: 1.3,
          margin: '0 0 8px',
        }}>
          {comm.subject || 'Communication'}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12.5px', color: '#4A4540', flexWrap: 'wrap' }}>
          <span>From: <span style={{ color: '#1A1713', fontWeight: 500 }}>{comm.from_address}</span></span>
          <span style={{ color: '#BAB5AE' }}>→</span>
          <span>To: {comm.to_address}</span>
        </div>
        <span style={{ fontSize: '11px', color: '#BAB5AE', display: 'block', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          {new Date(comm.ts).toLocaleString()}
        </span>
      </div>
      <div style={{ flex: 1, fontSize: '13.5px', color: '#4A4540', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>{comm.body}</p>
      </div>
    </div>
  );
}
