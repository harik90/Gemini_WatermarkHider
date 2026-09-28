'use client';

export default function BatchBar({
  total, done, review, failed, processing,
  onProcessAll, onDownloadAll, onClearAll,
  hasResults, isExporting,
}) {
  return (
    <div className="batch-bar">
      <div className="batch-bar-inner">
        <div className="batch-bar-info">
          <div className="batch-bar-stat">
            <strong>{done + review}</strong> of <strong>{total}</strong> done
          </div>
          {review > 0 && (
            <div className="batch-bar-stat">
              <span style={{ color: 'var(--warning-text)' }}>●</span> <strong>{review}</strong> need review
            </div>
          )}
          {failed > 0 && (
            <div className="batch-bar-stat">
              <span style={{ color: 'var(--error-text)' }}>●</span> <strong>{failed}</strong> failed
            </div>
          )}
          {processing > 0 && (
            <div className="batch-bar-stat">
              <span style={{ color: 'var(--accent-text)', animation: 'pulse 1.5s ease-in-out infinite' }}>●</span> <strong>{processing}</strong> processing
            </div>
          )}
        </div>

        <div className="batch-bar-actions">
          <button className="btn btn-ghost" onClick={onClearAll}>
            Clear all
          </button>
          {processing === 0 && failed > 0 && (
            <button className="btn btn-secondary" onClick={onProcessAll}>
              Retry failed
            </button>
          )}
          {hasResults && (
            <button
              className="btn btn-primary"
              onClick={onDownloadAll}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {done + review > 1 ? `Download all (${done + review})` : 'Download'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
