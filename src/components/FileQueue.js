'use client';

import FileCard from './FileCard';

export default function FileQueue({ files, onRemove, onRetry, onPreview, onAdjust, onDownload, exportQuality, onQualityChange }) {
  if (files.length === 0) return null;

  return (
    <section className="queue-section">
      <div className="queue-header">
        <h2>Queue</h2>
        <div className="quality-slider">
          <label htmlFor="quality-range">Export quality</label>
          <input
            id="quality-range"
            type="range"
            min="50"
            max="100"
            value={exportQuality}
            onChange={(e) => onQualityChange(Number(e.target.value))}
          />
          <span className="quality-value">{exportQuality}%</span>
        </div>
      </div>

      <div className="queue-grid">
        {files.map((file, i) => (
          <FileCard
            key={file.id}
            file={file}
            index={i}
            onRemove={() => onRemove(file.id)}
            onRetry={() => onRetry(file.id)}
            onPreview={() => onPreview(file)}
            onAdjust={onAdjust ? () => onAdjust(file) : undefined}
            onDownload={() => onDownload(file.id)}
          />
        ))}
      </div>
    </section>
  );
}
