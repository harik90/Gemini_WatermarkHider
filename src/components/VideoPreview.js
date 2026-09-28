'use client';

export default function VideoPreview({ originalUrl, resultUrl }) {
  if (!originalUrl || !resultUrl) return null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)',
      padding: 'var(--space-4)',
    }}>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>Original</div>
        <video
          src={originalUrl}
          controls
          style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)' }}
        />
      </div>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>Cleaned</div>
        <video
          src={resultUrl}
          controls
          style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)' }}
        />
      </div>
    </div>
  );
}
