'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export default function ManualRegion({ file, onApply, onCancel }) {
  const containerRef = useRef(null);
  const mediaRef = useRef(null);

  const isVideo = !!file.isVideo;
  const boxAspectW = isVideo ? 1.65 : 1.0;
  const boxAspectH = isVideo ? 1.25 : 1.0;

  const initialSize = file.detectedRegion?.logoSize || file.logoSize || 48;
  const initialBoxW = Math.round(initialSize * boxAspectW);
  const initialBoxH = Math.round(initialSize * boxAspectH);

  const initialX = file.detectedRegion?.x !== undefined
    ? file.detectedRegion.x
    : (file.width ? Math.max(0, file.width - initialBoxW - 16) : 0);
  const initialY = file.detectedRegion?.y !== undefined
    ? file.detectedRegion.y
    : (file.height ? Math.max(0, file.height - initialBoxH - 16) : 0);

  const [region, setRegion] = useState({
    x: initialX,
    y: initialY,
    size: initialSize,
  });

  const [mode, setMode] = useState(isVideo ? 'inpaint' : 'reverse-blend');
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, regionX: 0, regionY: 0 });

  // Scale factor between displayed media and natural dimensions
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    if (mediaRef.current) {
      const naturalWidth = mediaRef.current.videoWidth || mediaRef.current.naturalWidth || file.width || 1;
      const displayedWidth = mediaRef.current.clientWidth;
      if (displayedWidth && naturalWidth) {
        setScale(displayedWidth / naturalWidth);
      }
    }
  }, [file.width]);

  useEffect(() => {
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  const boxW = Math.round(region.size * boxAspectW);
  const boxH = Math.round(region.size * boxAspectH);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      regionX: region.x,
      regionY: region.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !scale) return;
    const dx = (e.clientX - dragStart.current.mouseX) / scale;
    const dy = (e.clientY - dragStart.current.mouseY) / scale;

    const naturalW = mediaRef.current?.videoWidth || mediaRef.current?.naturalWidth || file.width || 1000;
    const naturalH = mediaRef.current?.videoHeight || mediaRef.current?.naturalHeight || file.height || 1000;
    const maxX = Math.max(0, naturalW - boxW);
    const maxY = Math.max(0, naturalH - boxH);

    setRegion((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(maxX, Math.round(dragStart.current.regionX + dx))),
      y: Math.max(0, Math.min(maxY, Math.round(dragStart.current.regionY + dy))),
    }));
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already lost
    }
  };

  const handleStageClick = (e) => {
    if (isDragging) return;
    if (e.target.closest('.region-bounding-box')) return;
    if (!mediaRef.current || !scale) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / scale;
    const clickY = (e.clientY - rect.top) / scale;
    const naturalW = mediaRef.current.videoWidth || mediaRef.current.naturalWidth || file.width || 1024;
    const naturalH = mediaRef.current.videoHeight || mediaRef.current.naturalHeight || file.height || 1024;

    const newX = Math.max(0, Math.min(naturalW - boxW, Math.round(clickX - boxW / 2)));
    const newY = Math.max(0, Math.min(naturalH - boxH, Math.round(clickY - boxH / 2)));
    setRegion((prev) => ({ ...prev, x: newX, y: newY }));
  };

  const handleResetAuto = () => {
    const naturalW = mediaRef.current?.videoWidth || mediaRef.current?.naturalWidth || file.width || 1024;
    const naturalH = mediaRef.current?.videoHeight || mediaRef.current?.naturalHeight || file.height || 1024;
    const s = file.detectedRegion?.logoSize || file.logoSize || 48;
    const curBoxW = Math.round(s * boxAspectW);
    const curBoxH = Math.round(s * boxAspectH);
    const defX = file.detectedRegion?.x !== undefined ? file.detectedRegion.x : Math.max(0, naturalW - curBoxW - 16);
    const defY = file.detectedRegion?.y !== undefined ? file.detectedRegion.y : Math.max(0, naturalH - curBoxH - 16);
    setRegion({
      x: defX,
      y: defY,
      size: s,
    });
  };

  const handleApply = () => {
    onApply({
      x: region.x,
      y: region.y,
      logoSize: region.size,
      mode,
    });
  };

  const displayBox = {
    left: region.x * scale,
    top: region.y * scale,
    width: boxW * scale,
    height: boxH * scale,
  };

  return (
    <div className="manual-region-wrapper">
      <div className="manual-region-toolbar">
        <div className="manual-region-meta">
          <span className="badge badge-accent">
            {isVideo ? 'Dual-Star Video Region' : 'Interactive Adjustment'}
          </span>
          <span className="manual-region-hint">
            {isVideo
              ? 'Drag the dual-star box over both Gemini stars. Auto-adjusted for video.'
              : 'Click or drag the box to reposition the watermark region.'}
          </span>
        </div>

        <div className="manual-region-controls">
          <div className="size-control">
            <label htmlFor="region-size">Size</label>
            <input
              id="region-size"
              type="range"
              min="24"
              max="160"
              step="4"
              value={region.size}
              onChange={(e) => setRegion((prev) => ({ ...prev, size: Number(e.target.value) }))}
            />
            <span className="size-val">{region.size}px</span>
          </div>

          <div className="mode-toggle">
            {isVideo ? (
              <button
                type="button"
                className="mode-btn active"
                title="Chroma-safe dual-star boundary inpainting (eliminates cyan/green YUV compression artifacts)"
              >
                Chroma-Safe Inpaint
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`mode-btn ${mode === 'reverse-blend' ? 'active' : ''}`}
                  onClick={() => setMode('reverse-blend')}
                  title="Reverse Alpha Blend (Lossless for Gemini)"
                >
                  Exact Blend
                </button>
                <button
                  type="button"
                  className={`mode-btn ${mode === 'inpaint' ? 'active' : ''}`}
                  onClick={() => setMode('inpaint')}
                  title="Seamless Diffusion Inpainting (Unknown watermarks)"
                >
                  Inpaint
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="manual-region-canvas-container" ref={containerRef}>
        <div
          className="manual-region-stage"
          onClick={handleStageClick}
          title="Click anywhere to reposition the watermark box"
        >
          {isVideo ? (
            <video
              ref={mediaRef}
              src={file.originalUrl}
              onLoadedData={() => {
                if (mediaRef.current) {
                  mediaRef.current.currentTime = Math.min(1.0, (file.duration || 3) * 0.1);
                }
                updateScale();
              }}
              onSeeked={updateScale}
              muted
              playsInline
              preload="auto"
              className="manual-region-image"
            />
          ) : (
            <img
              ref={mediaRef}
              src={file.originalUrl}
              alt="Original"
              onLoad={updateScale}
              draggable={false}
              className="manual-region-image"
            />
          )}

          {/* Draggable Precision Bounding Box */}
          <div
            className={`region-bounding-box ${isDragging ? 'dragging' : ''} ${displayBox.top < 32 ? 'tag-flip' : ''}`}
            style={{
              left: `${displayBox.left}px`,
              top: `${displayBox.top}px`,
              width: `${displayBox.width}px`,
              height: `${displayBox.height}px`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            tabIndex={0}
            role="slider"
            aria-label="Watermark bounding box"
            aria-valuenow={region.size}
            aria-valuemin={24}
            aria-valuemax={160}
          >
            <div className="box-corner top-left" />
            <div className="box-corner top-right" />
            <div className="box-corner bottom-left" />
            <div className="box-corner bottom-right" />

            {isVideo ? (
              <svg
                viewBox="0 0 165 125"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  opacity: 0.85,
                }}
              >
                {/* Primary Star Astroid (Left) */}
                <path
                  d="M 66 9 C 66 38 41 62 13 62 C 41 62 66 86 66 115 C 66 86 91 62 119 62 C 91 62 66 38 66 9 Z"
                  fill="rgba(245, 158, 11, 0.22)"
                  stroke="#FBBF24"
                  strokeWidth="1.5"
                />
                {/* Secondary Star Astroid (Lower-Right) */}
                <path
                  d="M 115 67 C 115 78 106 87 95 87 C 106 87 115 96 115 107 C 115 96 124 87 135 87 C 124 87 115 78 115 67 Z"
                  fill="rgba(245, 158, 11, 0.22)"
                  stroke="#FBBF24"
                  strokeWidth="1.5"
                />
              </svg>
            ) : (
              <div className="box-center-crosshair">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 9 2 12 5 15" />
                  <polyline points="9 5 12 2 15 5" />
                  <polyline points="15 19 12 22 9 19" />
                  <polyline points="19 9 22 12 19 15" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                </svg>
              </div>
            )}

            <span className="box-tag">
              {isVideo ? 'Dual-Star Video Watermark' : 'Watermark'}
            </span>
          </div>
        </div>
      </div>

      <div className="manual-region-footer">
        <div className="coord-readout">
          <span>X: <strong>{region.x}px</strong></span>
          <span className="coord-sep">·</span>
          <span>Y: <strong>{region.y}px</strong></span>
          <span className="coord-sep">·</span>
          <span>
            Box: <strong>{boxW}×{boxH}px</strong> {isVideo ? '(Dual-Star)' : ''}
          </span>
        </div>

        <div className="footer-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleResetAuto}>
            Reset Position
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Re-process Region
          </button>
        </div>
      </div>
    </div>
  );
}
