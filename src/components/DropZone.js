'use client';

import { useRef, useState, useCallback } from 'react';
import JSZip from 'jszip';
import { isAccepted, isZip, isImage, isVideo, getAcceptString } from '@/lib/utils';

// Recursively read directory entries from webkitGetAsEntry
async function readEntryRecursive(entry) {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => resolve(isAccepted(file) ? [file] : []));
    });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise((resolve) => {
      reader.readEntries((results) => resolve(results));
    });
    const nested = await Promise.all(entries.map((e) => readEntryRecursive(e)));
    return nested.flat();
  }
  return [];
}

export default function DropZone({ onFilesAdded, hasFiles, mode = 'images' }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);

  const processFileList = useCallback(async (files) => {
    const outputFiles = [];

    for (const file of files) {
      if (isZip(file)) {
        setIsUnpacking(true);
        try {
          const zip = await JSZip.loadAsync(file);
          const zipPromises = [];

          zip.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return;
            const name = zipEntry.name.split('/').pop();
            const ext = name.split('.').pop().toLowerCase();

            if (['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov'].includes(ext)) {
              zipPromises.push(
                zipEntry.async('blob').then((blob) => {
                  const mime = ext === 'png' ? 'image/png'
                    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                    : ext === 'webp' ? 'image/webp'
                    : ext === 'mp4' ? 'video/mp4'
                    : ext === 'webm' ? 'video/webm'
                    : 'video/quicktime';
                  return new File([blob], name, { type: mime });
                })
              );
            }
          });

          const unpacked = await Promise.all(zipPromises);
          outputFiles.push(...unpacked);
        } catch (err) {
          console.error('Failed to unpack zip:', err);
        } finally {
          setIsUnpacking(false);
        }
      } else if (isAccepted(file)) {
        outputFiles.push(file);
      }
    }

    if (outputFiles.length > 0) {
      onFilesAdded(outputFiles);
    }
  }, [onFilesAdded]);


  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragActive(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const collectedFiles = [];
      const entryPromises = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entryPromises.push(readEntryRecursive(entry));
            continue;
          }
        }
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) collectedFiles.push(file);
        }
      }

      if (entryPromises.length > 0) {
        const directoryResults = await Promise.all(entryPromises);
        collectedFiles.push(...directoryResults.flat());
      }

      await processFileList(collectedFiles);
    } else if (e.dataTransfer.files) {
      await processFileList(Array.from(e.dataTransfer.files));
    }
  }, [processFileList]);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e) => {
    if (e.target.files) {
      processFileList(Array.from(e.target.files));
      e.target.value = '';
    }
  }, [processFileList]);

  // Paste from clipboard
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file && isAccepted(file)) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      processFileList(files);
    }
  }, [processFileList]);

  const isVideoMode = mode === 'videos';

  return (
    <div
      className={`drop-zone ${isDragActive ? 'active' : ''} ${hasFiles ? 'compact' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      onPaste={handlePaste}
      tabIndex={0}
      role="button"
      aria-label={isVideoMode ? "Upload video files" : "Upload image files"}
      id="drop-zone"
    >
      <input
        ref={inputRef}
        type="file"
        accept={getAcceptString()}
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
        id="file-input"
      />

      {isUnpacking ? (
        <div className="drop-zone-unpacking">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin">
            <line x1="12" y1="2" x2="12" y2="6"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
            <line x1="2" y1="12" x2="6" y2="12"/>
            <line x1="18" y1="12" x2="22" y2="12"/>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
          </svg>
          <span className="unpacking-text">Unpacking archive…</span>
        </div>
      ) : isDragActive ? (
        <div className="drop-zone-drag-prompt">
          <div className="drag-plus-icon">+</div>
          <span className="drag-text">Drop {isVideoMode ? 'videos' : 'images or folders'} here</span>
        </div>
      ) : (
        <div className="drop-zone-content">
          <button
            type="button"
            className="btn-start-action"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>{isVideoMode ? 'Start with videos' : 'Start with photos'}</span>
          </button>

          <p className="drop-zone-subtext">
            {isVideoMode ? 'or drag videos here' : 'or drag images here'}
          </p>
        </div>
      )}
    </div>
  );
}
