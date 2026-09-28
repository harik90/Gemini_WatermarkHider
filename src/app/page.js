'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ThemeProvider } from '@/hooks/useTheme';
import Header from '@/components/Header';
import DropZone from '@/components/DropZone';
import FileQueue from '@/components/FileQueue';
import BatchBar from '@/components/BatchBar';
import Modal from '@/components/Modal';
import BeforeAfter from '@/components/BeforeAfter';
import VideoPreview from '@/components/VideoPreview';
import ManualRegion from '@/components/ManualRegion';
import ToastContainer from '@/components/ToastContainer';
import Footer from '@/components/Footer';
import PrivacyContent from '@/components/PrivacyContent';
import Link from 'next/link';
import { processImageFile, canvasToBlob, getOutputMimeType } from '@/lib/removal-engine';
import { processVideo, formatETA } from '@/lib/video-processor';
import { createQueueManager } from '@/lib/queue-manager';
import { createZipFromFiles, downloadBlob } from '@/lib/zip-export';
import { generateId, isImage, isVideo, formatFileSize } from '@/lib/utils';
import {
  saveSessionFile,
  loadSessionFiles,
  removeSessionFile,
  clearSessionDB,
} from '@/lib/db';

const queueManager = createQueueManager();

// File states
const STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  DONE: 'done',
  REVIEW: 'review',
  FAILED: 'failed',
};

export default function Home() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

function App() {
  const [files, setFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [modalTab, setModalTab] = useState('slider'); // 'slider' | 'adjust'
  const [toasts, setToasts] = useState([]);
  const [exportQuality, setExportQuality] = useState(92);
  const [isExporting, setIsExporting] = useState(false);
  const [mode, setMode] = useState('images'); // 'images' | 'videos'
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const abortControllers = useRef(new Map());

  const addToast = useCallback((message, type = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const updateFile = useCallback((id, updates) => {
    setFiles((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...updates } : f));
      const target = next.find((f) => f.id === id);
      if (target) {
        saveSessionFile(target);
      }
      return next;
    });
  }, []);

  // Restore session from IndexedDB on startup
  useEffect(() => {
    async function restoreSession() {
      try {
        const saved = await loadSessionFiles();
        if (saved && saved.length > 0) {
          const restored = saved.map((item) => {
            const file = item.fileBlob || new File([], item.name, { type: item.type });
            const originalUrl = item.fileBlob ? URL.createObjectURL(item.fileBlob) : null;
            const resultUrl = item.resultBlob ? URL.createObjectURL(item.resultBlob) : null;
            return {
              ...item,
              file,
              originalUrl,
              resultUrl,
              blob: item.resultBlob,
            };
          });
          setFiles(restored);
          addToast(`Restored ${restored.length} files from previous session`, 'info');
        }
      } catch (err) {
        console.warn('Session restore note:', err);
      }
    }
    restoreSession();
  }, [addToast]);

  const processFile = useCallback(async (fileItem, customOptions = null) => {
    updateFile(fileItem.id, { status: STATUS.PROCESSING, progress: 0 });

    try {
      if (isImage(fileItem.file)) {
        const result = await processImageFile(fileItem.file, customOptions || {});
        const mimeType = getOutputMimeType(fileItem.file.name);
        const blob = await canvasToBlob(result.canvas, mimeType, exportQuality / 100);

        const detection = result.detection || {};
        const status = (detection.confidence !== undefined && detection.confidence < 0.45)
          ? STATUS.REVIEW
          : STATUS.DONE;

        const updatedItem = {
          status,
          progress: 100,
          blob,
          resultUrl: URL.createObjectURL(blob),
          originalUrl: result.originalUrl,
          cleanCanvas: result.canvas,
          width: result.width,
          height: result.height,
          confidence: detection.confidence,
          detectedRegion: {
            x: detection.x,
            y: detection.y,
            logoSize: detection.logoSize,
          },
          outputSize: blob.size,
        };

        updateFile(fileItem.id, updatedItem);

        // If preview modal is currently open for this file, update preview state as well
        setPreviewFile((curr) => (curr && curr.id === fileItem.id ? { ...curr, ...updatedItem } : curr));

        if (status === STATUS.REVIEW) {
          addToast(`${fileItem.file.name}: low match confidence — check result or adjust`, 'warning');
        }
      } else if (isVideo(fileItem.file)) {
        const controller = new AbortController();
        abortControllers.current.set(fileItem.id, controller);

        await processVideo(
          fileItem.file,
          (progress) => {
            updateFile(fileItem.id, {
              progress: progress.percent,
              videoProgress: progress,
            });
          },
          (result) => {
            const updatedItem = {
              status: STATUS.DONE,
              progress: 100,
              blob: result.blob,
              resultUrl: result.url,
              originalUrl: URL.createObjectURL(fileItem.file),
              width: result.width,
              height: result.height,
              confidence: result.detection?.confidence,
              detectedRegion: result.detection ? {
                x: result.detection.x,
                y: result.detection.y,
                logoSize: result.detection.logoSize,
                isDualStar: result.detection.isDualStar,
                mode: customOptions?.mode || 'reverse-blend',
              } : null,
              outputSize: result.blob.size,
              isVideo: true,
            };
            updateFile(fileItem.id, updatedItem);
            setPreviewFile((curr) => (curr && curr.id === fileItem.id ? { ...curr, ...updatedItem } : curr));
            abortControllers.current.delete(fileItem.id);
          },
          (err) => {
            updateFile(fileItem.id, { status: STATUS.FAILED, error: err.message });
            addToast(`${fileItem.file.name}: ${err.message}`, 'error');
            abortControllers.current.delete(fileItem.id);
          },
          controller.signal,
          customOptions || {}
        );
      }
    } catch (err) {
      updateFile(fileItem.id, { status: STATUS.FAILED, error: err.message });
      addToast(`${fileItem.file.name}: ${err.message}`, 'error');
    }
  }, [updateFile, addToast, exportQuality]);

  const handleFilesAdded = useCallback((newFiles) => {
    const items = newFiles.map((file) => ({
      id: generateId(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: STATUS.QUEUED,
      progress: 0,
      isVideo: isVideo(file),
      blob: null,
      resultUrl: null,
      originalUrl: null,
      confidence: null,
      error: null,
    }));

    setFiles((prev) => [...prev, ...items]);

    // Auto-process via concurrency manager
    items.forEach((item) => {
      queueManager.enqueue(() => processFile(item));
    });
  }, [processFile]);

  const handleRemoveFile = useCallback((id) => {
    const controller = abortControllers.current.get(id);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(id);
    }
    removeSessionFile(id);
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.resultUrl) URL.revokeObjectURL(file.resultUrl);
      if (file?.originalUrl) URL.revokeObjectURL(file.originalUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleRetry = useCallback((id) => {
    const file = files.find((f) => f.id === id);
    if (file) {
      updateFile(id, { status: STATUS.QUEUED, progress: 0, error: null });
      queueManager.enqueue(() => processFile(file));
    }
  }, [files, updateFile, processFile]);

  const handleProcessAll = useCallback(() => {
    const queued = files.filter((f) => f.status === STATUS.QUEUED || f.status === STATUS.FAILED);
    queued.forEach((item) => {
      updateFile(item.id, { status: STATUS.QUEUED });
      queueManager.enqueue(() => processFile(item));
    });
  }, [files, updateFile, processFile]);

  const handleDownloadAll = useCallback(async () => {
    const done = files.filter((f) => (f.status === STATUS.DONE || f.status === STATUS.REVIEW) && f.blob);
    if (done.length === 0) return;

    if (done.length === 1) {
      const rawExt = (done[0].blob.type || '').split('/')[1] || 'png';
      const ext = rawExt.split(';')[0] || (done[0].isVideo ? 'webm' : 'png');
      downloadBlob(done[0].blob, done[0].name.replace(/\.[^.]+$/, '_clean') + '.' + ext);
      addToast('Downloaded clean file!', 'success');
      return;
    }

    setIsExporting(true);
    try {
      const zipBlob = await createZipFromFiles(
        done.map((f) => ({ name: f.name, blob: f.blob })),
        null
      );
      downloadBlob(zipBlob, `clearmark-${new Date().toISOString().slice(0, 10)}.zip`);
      addToast(`Downloaded ${done.length} clean assets as ZIP archive`, 'success');
    } catch (err) {
      addToast(`Export failed: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [files, addToast]);

  const handleClearAll = useCallback(() => {
    abortControllers.current.forEach((c) => c.abort());
    abortControllers.current.clear();
    queueManager.clear();
    clearSessionDB();
    files.forEach((f) => {
      if (f.resultUrl) URL.revokeObjectURL(f.resultUrl);
      if (f.originalUrl) URL.revokeObjectURL(f.originalUrl);
    });
    setFiles([]);
    addToast('Queue cleared', 'info');
  }, [files, addToast]);

  const handleDownloadSingle = useCallback((id) => {
    const file = files.find((f) => f.id === id);
    if (file?.blob) {
      const rawExt = (file.blob.type || '').split('/')[1] || 'png';
      const ext = rawExt.split(';')[0] || (file.isVideo ? 'webm' : 'png');
      downloadBlob(file.blob, file.name.replace(/\.[^.]+$/, '_clean') + '.' + ext);
    }
  }, [files]);

  const handleOpenAdjust = useCallback((file) => {
    setPreviewFile(file);
    setModalTab('adjust');
  }, []);

  const handleApplyCustomRegion = useCallback((options) => {
    if (!previewFile) return;
    addToast(`Re-processing with custom ${options.mode === 'inpaint' ? 'inpaint' : 'exact blend'} region…`, 'info');
    processFile(previewFile, options);
    setModalTab('slider');
  }, [previewFile, processFile, addToast]);

  // Stats
  const totalFiles = files.length;
  const doneCount = files.filter((f) => f.status === STATUS.DONE).length;
  const reviewCount = files.filter((f) => f.status === STATUS.REVIEW).length;
  const failedCount = files.filter((f) => f.status === STATUS.FAILED).length;
  const processingCount = files.filter((f) => f.status === STATUS.PROCESSING).length;
  const hasFiles = totalFiles > 0;
  const hasResults = doneCount + reviewCount > 0;

  return (
    <>
      <Header
        onSelectMode={(newMode) => {
          setMode(newMode);
          if (hasFiles) {
            addToast(`Switched mode to ${newMode}`, 'info');
          }
        }}
      />

      <main>
        {!hasFiles ? (
          <section className="hero">
            <div className="container">
              <h1 className="hero-title">Hide Gemini Watermark</h1>
              <p className="hero-subtitle">
                Free online Gemini watermark cleaner for images, logos, and star overlays.<br />
                No upload, no sign-up — 100% local, private processing.
              </p>

              {/* Mode switch tabs */}
              <div className="mode-segmented-control" role="tablist">
                <button
                  type="button"
                  className={`mode-tab ${mode === 'images' ? 'active' : ''}`}
                  onClick={() => setMode('images')}
                  role="tab"
                  aria-selected={mode === 'images'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>Images</span>
                </button>

                <button
                  type="button"
                  className={`mode-tab ${mode === 'videos' ? 'active' : ''}`}
                  onClick={() => setMode('videos')}
                  role="tab"
                  aria-selected={mode === 'videos'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  <span>Videos</span>
                  <span className="mode-beta-badge">BETA</span>
                </button>
              </div>

              {/* Hero showcase with tilted cards and central drop zone */}
              <div className="hero-showcase">
                <div className="hero-tilted-card hero-tilted-left" aria-hidden="true">
                  <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/samples/hero-left.jpg`} alt="" loading="eager" />
                </div>

                <div className="hero-tilted-card hero-tilted-right" aria-hidden="true">
                  <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/samples/hero-right.jpg`} alt="" loading="eager" />
                </div>

                <div className="hero-dropzone-wrapper">
                  <DropZone onFilesAdded={handleFilesAdded} hasFiles={false} mode={mode} />
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="active-workspace">
            <div className="container">
              <div className="active-workspace-header">
                <div>
                  <h2 className="workspace-title">Processing Queue ({totalFiles} files)</h2>
                  <p className="workspace-sub">100% client-side reverse alpha restoration</p>
                </div>
                <div className="workspace-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-add-more"
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add More Files
                  </button>
                </div>
              </div>

              <div style={{ display: 'none' }}>
                <DropZone onFilesAdded={handleFilesAdded} hasFiles={true} mode={mode} />
              </div>

              <FileQueue
                files={files}
                onRemove={handleRemoveFile}
                onRetry={handleRetry}
                onPreview={(f) => {
                  setPreviewFile(f);
                  setModalTab('slider');
                }}
                onAdjust={handleOpenAdjust}
                onDownload={handleDownloadSingle}
                exportQuality={exportQuality}
                onQualityChange={setExportQuality}
              />
            </div>
          </section>
        )}
      </main>

      {hasFiles && (
        <BatchBar
          total={totalFiles}
          done={doneCount}
          review={reviewCount}
          failed={failedCount}
          processing={processingCount}
          onProcessAll={handleProcessAll}
          onDownloadAll={handleDownloadAll}
          onClearAll={handleClearAll}
          hasResults={hasResults}
          isExporting={isExporting}
        />
      )}

      {previewFile && (
        <Modal onClose={() => setPreviewFile(null)} title={previewFile.name}>
          <div className="modal-tabs-wrapper">
            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab ${modalTab === 'slider' ? 'active' : ''}`}
                onClick={() => setModalTab('slider')}
              >
                {previewFile.isVideo ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21"/>
                    </svg>
                    Video Player
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="18" rx="2" />
                      <line x1="12" y1="3" x2="12" y2="21" />
                    </svg>
                    Comparison Slider
                  </>
                )}
              </button>
              <button
                type="button"
                className={`modal-tab ${modalTab === 'adjust' ? 'active' : ''}`}
                onClick={() => setModalTab('adjust')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2v4M18 2v4M2 6h4M2 18h4M22 6h-4M22 18h-4M6 22v-4M18 22v-4"/>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                {previewFile.isVideo ? 'Adjust Dual-Star Region' : 'Adjust Watermark Region'}
              </button>
            </div>

            {previewFile.confidence !== null && previewFile.confidence !== undefined && (
              <div className="modal-tabs-meta">
                <span className={`badge ${previewFile.confidence >= 0.45 ? 'badge-success' : 'badge-warning'}`}>
                  ★ Confidence: {Math.round(previewFile.confidence * 100)}%
                </span>
              </div>
            )}
          </div>

          {modalTab === 'adjust' ? (
            <ManualRegion
              file={previewFile}
              onApply={handleApplyCustomRegion}
              onCancel={() => setModalTab('slider')}
            />
          ) : previewFile.isVideo ? (
            <VideoPreview
              originalUrl={previewFile.originalUrl}
              resultUrl={previewFile.resultUrl}
            />
          ) : (
            <BeforeAfter
              beforeUrl={previewFile.originalUrl}
              afterUrl={previewFile.resultUrl}
            />
          )}

          {modalTab === 'slider' && (
            <div className="modal-footer">
              <div className="modal-footer-meta">
                {previewFile.width && previewFile.height && (
                  <span>{previewFile.width}×{previewFile.height}px</span>
                )}
                {previewFile.width && (previewFile.outputSize || previewFile.size) && <span className="meta-sep">·</span>}
                {(previewFile.outputSize || previewFile.size) && (
                  <span>{formatFileSize(previewFile.outputSize || previewFile.size)}</span>
                )}
              </div>
              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModalTab('adjust')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="14 2 18 6 7 17 3 17 3 13 14 2" />
                  </svg>
                  Adjust Region
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (previewFile.blob) {
                      const rawExt = (previewFile.blob.type || '').split('/')[1] || 'png';
                      const ext = rawExt.split(';')[0] || (previewFile.isVideo ? 'webm' : 'png');
                      downloadBlob(previewFile.blob, previewFile.name.replace(/\.[^.]+$/, '_clean') + '.' + ext);
                      addToast('Downloaded clean file', 'success');
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download Clean File
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {privacyOpen && (
        <Modal onClose={() => setPrivacyOpen(false)} title="Privacy Policy">
          <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: 'var(--space-6)' }}>
            <PrivacyContent isModal={true} />
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Link href="/privacy" className="btn btn-ghost btn-sm" target="_blank">
              Open as standalone page ↗
            </Link>
            <button className="btn btn-secondary btn-sm" onClick={() => setPrivacyOpen(false)}>
              Close
            </button>
          </div>
        </Modal>
      )}

      <ToastContainer toasts={toasts} />
      <Footer onOpenPrivacy={() => setPrivacyOpen(true)} />
    </>
  );
}
