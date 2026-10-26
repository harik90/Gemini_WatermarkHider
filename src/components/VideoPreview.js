'use client';

import { useRef, useCallback } from 'react';

export default function VideoPreview({ originalUrl, resultUrl }) {
  const origVideoRef = useRef(null);
  const cleanVideoRef = useRef(null);

  const requestFullscreen = useCallback((ref) => {
    const el = ref.current;
    if (!el) return;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  }, []);

  if (!originalUrl || !resultUrl) return null;

  return (
    <div className="video-compare-grid">
      <div className="video-compare-col">
        <div className="video-compare-header">
          <span className="compare-badge-label">Original Source</span>
          <button
            type="button"
            className="video-fs-btn"
            onClick={() => requestFullscreen(origVideoRef)}
            title="Watch in Fullscreen"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            <span>Fullscreen</span>
          </button>
        </div>
        <video
          ref={origVideoRef}
          src={originalUrl}
          controls
          loop
          playsInline
          className="compare-video-el"
        />
      </div>

      <div className="video-compare-col">
        <div className="video-compare-header">
          <span className="compare-badge-label success">Cleaned Result</span>
          <button
            type="button"
            className="video-fs-btn"
            onClick={() => requestFullscreen(cleanVideoRef)}
            title="Watch Cleaned in Fullscreen"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            <span>Fullscreen</span>
          </button>
        </div>
        <video
          ref={cleanVideoRef}
          src={resultUrl}
          controls
          loop
          playsInline
          className="compare-video-el"
        />
      </div>
    </div>
  );
}
