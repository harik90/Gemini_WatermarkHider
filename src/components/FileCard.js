'use client';

import { useState, useEffect, useRef } from 'react';
import { formatFileSize } from '@/lib/utils';

export default function FileCard({ file, index, onRemove, onRetry, onPreview, onAdjust, onDownload }) {
  const [thumbUrl, setThumbUrl] = useState(() => {
    if (!file.isVideo && file.file instanceof Blob) {
      return URL.createObjectURL(file.file);
    }
    return null;
  });
  const thumbGenerated = useRef(false);

  useEffect(() => {
    if (!file.isVideo) {
      return () => {
        if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      };
    }

    if (thumbGenerated.current) return;
    thumbGenerated.current = true;

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const url = URL.createObjectURL(file.file);
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };
    video.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      setThumbUrl(c.toDataURL('image/jpeg', 0.6));
      URL.revokeObjectURL(url);
    };
  }, [file, thumbUrl]);

  const isProcessing = file.status === 'processing';
  const isDone = file.status === 'done';
  const isReview = file.status === 'review';
  const isFailed = file.status === 'failed';
  const isQueued = file.status === 'queued';

  const displayUrl = (isDone || isReview) && file.resultUrl && !file.isVideo ? file.resultUrl : thumbUrl;

  return (
    <div
      className="file-card"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      <div className="file-card-thumb">
        {displayUrl ? (
          <img src={displayUrl} alt={file.name} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="progress-ring">
            <svg viewBox="0 0 48 48">
              <circle className="progress-ring-track" cx="24" cy="24" r="20" />
              <circle
                className="progress-ring-fill"
                cx="24" cy="24" r="20"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - file.progress / 100)}`}
              />
            </svg>
            <span className="progress-ring-text">{file.progress}%</span>
          </div>
        )}

        {/* Done overlay checkmark */}
        {isDone && (
          <div className="file-card-overlay">
            <div className="done-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        )}

        {/* Review badge */}
        {isReview && (
          <div style={{ position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)' }}>
            <span className="badge badge-warning" onClick={onAdjust ? () => onAdjust(file) : undefined} style={{ cursor: onAdjust ? 'pointer' : 'default' }}>
              Check result
            </span>
          </div>
        )}

        {/* Failed badge */}
        {isFailed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
        )}

        {/* Video badge */}
        {file.isVideo && (
          <div style={{ position: 'absolute', bottom: 'var(--space-2)', left: 'var(--space-2)' }}>
            <span className="badge badge-accent">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
              Video
            </span>
          </div>
        )}

        {/* Hover actions */}
        <div className="file-card-actions">
          {(isDone || isReview) && (
            <button className="file-card-action-btn" onClick={(e) => { e.stopPropagation(); onPreview(); }} title="Compare Before / After">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
          {(isDone || isReview) && !file.isVideo && onAdjust && (
            <button className="file-card-action-btn" onClick={(e) => { e.stopPropagation(); onAdjust(file); }} title="Adjust Watermark Region">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </button>
          )}
          {(isDone || isReview) && (
            <button className="file-card-action-btn" onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download Clean File">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          <button className="file-card-action-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="file-card-body">
        <div className="file-card-name" title={file.name}>{file.name}</div>
        <div className="file-card-meta">
          <span>{formatFileSize(file.outputSize || file.size)}</span>
          <span className="file-card-status">
            {isQueued && <span style={{ color: 'var(--text-tertiary)' }}>Queued</span>}
            {isProcessing && <span style={{ color: 'var(--accent-text)' }}>Processing…</span>}
            {isDone && <span style={{ color: 'var(--success-text)' }}>✓ Clean</span>}
            {isReview && <span style={{ color: 'var(--warning-text)', cursor: 'pointer' }} onClick={onAdjust ? () => onAdjust(file) : undefined}>Review</span>}
            {isFailed && (
              <button className="btn btn-ghost" style={{ height: 'auto', padding: '0', fontSize: 'var(--text-xs)', color: 'var(--error-text)', fontWeight: 600 }} onClick={onRetry}>
                Retry
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
