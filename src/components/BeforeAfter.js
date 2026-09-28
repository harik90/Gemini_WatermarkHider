'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

export default function BeforeAfter({ beforeUrl, afterUrl }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const updatePosition = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientX);
    containerRef.current?.setPointerCapture(e.pointerId);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  }, [isDragging, updatePosition]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (beforeUrl && afterUrl) {
      const img1 = new Image();
      const img2 = new Image();
      let count = 0;
      const onLoad = () => { count++; if (count >= 2) setLoaded(true); };
      img1.onload = onLoad;
      img2.onload = onLoad;
      img1.src = beforeUrl;
      img2.src = afterUrl;
    }
  }, [beforeUrl, afterUrl]);

  if (!beforeUrl || !afterUrl) return null;

  return (
    <div
      ref={containerRef}
      className="before-after"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      {/* After image (bottom layer) */}
      <img className="before-after-img" src={afterUrl} alt="After removal" draggable={false} />

      {/* Before image (clipped top layer) */}
      <div
        className="before-after-before"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={beforeUrl} alt="Before removal" draggable={false} />
      </div>

      {/* Divider line */}
      <div className="before-after-line" style={{ left: `${position}%` }} />

      {/* Handle */}
      <div
        className="before-after-handle"
        style={{ left: `${position}%` }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="8 4 4 8 8 12" />
          <polyline points="16 4 20 8 16 12" />
        </svg>
      </div>

      {/* Labels */}
      <span className="before-after-label before-after-label-before">Before</span>
      <span className="before-after-label before-after-label-after">After</span>
    </div>
  );
}
