'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export default function EditVideoPanel({ onAddToast }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const [scenes, setScenes] = useState([]);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [masterReady, setMasterReady] = useState(false);
  const [viewMode, setViewMode] = useState('clip'); // 'clip' | 'master'

  // Job & Processing Modal states
  const [jobStatus, setJobStatus] = useState('idle'); // 'idle' | 'processing' | 'done' | 'failed'
  const [jobProgress, setJobProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState('');
  const [isProcessingModalOpen, setIsProcessingModalOpen] = useState(false);

  // Video playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef(null);
  const videoWrapperRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedTimeRef = useRef(0);
  const draggedClipIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Fullscreen change listener
  useEffect(() => {
    const handleFSChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    document.addEventListener('webkitfullscreenchange', handleFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('webkitfullscreenchange', handleFSChange);
    };
  }, []);

  // Health check polling
  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const res = await fetch('http://localhost:8000/api/health');
        if (res.ok && active) setServerOnline(true);
      } catch {
        if (active) setServerOnline(false);
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Poll job status during rendering
  useEffect(() => {
    let active = true;
    async function checkStatus() {
      try {
        const res = await fetch('http://localhost:8000/api/edit-video/status');
        if (res.ok && active) {
          const data = await res.json();
          setJobStatus(data.status);
          setJobProgress(data.progress || 0);
          setJobMessage(data.message || '');
          if (data.status === 'done') {
            setMasterReady(true);
            if (jobStatus === 'processing') {
              setViewMode('master');
            }
          } else if (data.has_master) {
            setMasterReady(true);
          }
        }
      } catch {
        // silent
      }
    }

    checkStatus();
    if (jobStatus !== 'processing') return;

    const interval = setInterval(checkStatus, 800);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobStatus]);

  // Upload and auto-sort scene clips (strictly video files only)
  const handleUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles = [];
    let rejectedCount = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
      const isVid = file.type?.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext);
      if (isVid) {
        validFiles.push(file);
      } else {
        rejectedCount++;
      }
    }

    if (rejectedCount > 0) {
      onAddToast?.(`${rejectedCount} non-video file(s) ignored. Batch Videos only accepts video files.`, 'warning');
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < validFiles.length; i++) {
      formData.append('files', validFiles[i]);
    }

    try {
      const res = await fetch('http://localhost:8000/api/upload-scenes', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }
      const data = await res.json();
      const updatedScenes = data.scenes || [];
      setScenes(updatedScenes);
      setSelectedSceneIndex(0);
      setViewMode('clip');
      onAddToast?.(`Added ${data.uploaded_count} clip${data.uploaded_count === 1 ? '' : 's'} to sequence!`, 'success');
    } catch (err) {
      onAddToast?.(err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Immediate, robust clip deletion
  const handleDeleteScene = async (e, filename) => {
    e.stopPropagation();

    // 1. Immediately pause video to release any file handle
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch {}
    }
    setIsPlaying(false);

    // 2. Optimistically remove from state instantly
    setScenes((prev) => {
      const next = prev.filter((s) => s.filename !== filename);
      setSelectedSceneIndex((curr) => Math.min(curr, Math.max(0, next.length - 1)));
      return next;
    });

    onAddToast?.(`Removed ${filename}`, 'info');

    // 3. Call server to delete file
    try {
      await fetch(`http://localhost:8000/api/scene-video/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
    } catch {
      // server file cleanup failed silently, UI state already updated
    }
  };

  // Clear all clips
  const handleClearAllScenes = async () => {
    if (scenes.length === 0) return;
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch {}
    }
    setIsPlaying(false);
    setScenes([]);
    setSelectedSceneIndex(0);
    setMasterReady(false);
    setViewMode('clip');

    try {
      await fetch('http://localhost:8000/api/clear-scenes', { method: 'POST' });
      onAddToast?.('All clips cleared', 'info');
    } catch {
      // state already cleared
    }
  };

  // Reorder scene clips (Move Up / Move Down or Drag and Drop)
  const handleMoveClip = (index, direction, e) => {
    if (e) e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= scenes.length) return;

    setScenes((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;

      return next.map((item, i) => ({
        ...item,
        order: i + 1,
      }));
    });

    setSelectedSceneIndex((curr) => {
      if (curr === index) return targetIndex;
      if (curr === targetIndex) return index;
      return curr;
    });

    onAddToast?.(`Moved clip to sequence position ${targetIndex + 1}`, 'info');
  };

  const handleDragStartClip = (e, index) => {
    draggedClipIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverClip = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDropClip = (e, targetIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    const sourceIndex = draggedClipIndexRef.current;
    if (sourceIndex === null || sourceIndex === targetIndex || targetIndex >= scenes.length) return;

    setScenes((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((item, i) => ({
        ...item,
        order: i + 1,
      }));
    });

    setSelectedSceneIndex(targetIndex);
    draggedClipIndexRef.current = null;
    onAddToast?.(`Reordered clip to sequence position ${targetIndex + 1}`, 'info');
  };

  // Start watermark removal & master render
  const handleStartRender = async () => {
    if (scenes.length === 0) {
      onAddToast?.('Please add video clips first to export', 'warning');
      fileInputRef.current?.click();
      return;
    }
    if (!serverOnline) {
      onAddToast?.('Local Python daemon is offline. Run "npm run server" on your workstation', 'error');
      return;
    }

    setJobStatus('processing');
    setJobProgress(0);
    setJobMessage('Initializing high-speed pixel unblend pipeline...');
    setIsProcessingModalOpen(true);

    try {
      const res = await fetch('http://localhost:8000/api/edit-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_dir: 'input_scenes',
          output_filename: 'MASTER_FINAL_1080p.mp4',
          resolution: '1080p',
          enable_watermark_removal: true,
          inpaint_method: 'ns',
          enable_color_grade: true,
          crf: 16,
          preset: 'fast',
          selected_scenes: scenes.map((s) => s.filename),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || 'Failed to start processing');
      }
    } catch (err) {
      setJobStatus('failed');
      setJobMessage(err.message);
      onAddToast?.(err.message, 'error');
    }
  };

  // Cancel running render
  const handleCancelProcessing = async () => {
    try {
      await fetch('http://localhost:8000/api/edit-video/cancel', { method: 'POST' });
    } catch {}
    setJobStatus('idle');
    setJobProgress(0);
    setJobMessage('');
    setIsProcessingModalOpen(false);
    onAddToast?.('Processing cancelled by user', 'info');
  };

  // Playback handlers
  const activeScene = scenes[selectedSceneIndex] || null;

  const currentVideoSrc = useMemo(() => {
    if (viewMode === 'master' && masterReady) {
      return 'http://localhost:8000/api/master-video';
    }
    if (activeScene && activeScene.filename) {
      return `http://localhost:8000/api/scene-video/${encodeURIComponent(activeScene.filename)}`;
    }
    return '';
  }, [viewMode, masterReady, activeScene]);

  const handleSwitchView = useCallback((mode) => {
    if (videoRef.current) {
      savedTimeRef.current = videoRef.current.currentTime;
    }
    setViewMode(mode);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleToggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const next = !prev;
      onAddToast?.(next ? 'Loop playback enabled (continuous repeat)' : 'Loop playback disabled', 'info');
      return next;
    });
  }, [onAddToast]);

  const handleCycleSpeed = useCallback(() => {
    setPlaybackRate((curr) => {
      const nextIdx = (PLAYBACK_SPEEDS.indexOf(curr) + 1) % PLAYBACK_SPEEDS.length;
      const nextRate = PLAYBACK_SPEEDS[nextIdx];
      if (videoRef.current) videoRef.current.playbackRate = nextRate;
      onAddToast?.(`Playback speed: ${nextRate}x`, 'info');
      return nextRate;
    });
  }, [onAddToast]);

  const handleSeek = useCallback((timeInSeconds) => {
    if (videoRef.current) {
      const clamped = Math.max(0, Math.min(timeInSeconds, duration || 0));
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, [duration]);

  const handleToggleFullscreen = useCallback(() => {
    const wrapper = videoWrapperRef.current;
    if (!wrapper) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen().catch(() => {});
      } else if (wrapper.webkitRequestFullscreen) {
        wrapper.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }, []);

  // Keyboard shortcuts: Space (Play/Pause), L (Loop), ArrowLeft/ArrowRight (-5s/+5s), M (Mute), F (Fullscreen)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleToggleLoop();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(currentTime - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek(currentTime + 5);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleToggleFullscreen, handleToggleLoop, handleSeek, currentTime]);

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      setDuration(dur);
      if (savedTimeRef.current > 0 && savedTimeRef.current <= dur) {
        videoRef.current.currentTime = savedTimeRef.current;
        setCurrentTime(savedTimeRef.current);
      }
      videoRef.current.playbackRate = playbackRate;
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const totalDuration = useMemo(() => {
    return scenes.reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0);
  }, [scenes]);

  const formatTimecode = (sec) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="pro-editor-container">
      {/* ── Top Bar: Vercel Project Toolbar ── */}
      <div className="editor-top-bar">
        <div className="editor-brand">
          <img src={`${basePath}/app-icon.png`} alt="" width={18} height={18} style={{ borderRadius: '3px', objectFit: 'contain' }} />
          <div className="brand-group">
            <h2 className="editor-title">Video Studio</h2>
            <span className="brand-slash">/</span>
            <span className="brand-mode-badge">Sequence Editor</span>
          </div>
          <span className={`status-pill ${serverOnline ? 'connected' : 'offline'}`}>
            {serverOnline ? 'Daemon Online · 120+ FPS' : 'Daemon Offline'}
          </span>
          {scenes.length > 0 && (
            <span className="timeline-meta-chip">
              {scenes.length} {scenes.length === 1 ? 'Clip' : 'Clips'} · {formatTimecode(totalDuration)}
            </span>
          )}
        </div>

        <div className="editor-actions">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
            onChange={(e) => {
              handleUploadFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className="editor-btn btn-import"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>{isUploading ? 'Importing...' : 'Add Clips'}</span>
          </button>

          {masterReady && (
            <a
              href="http://localhost:8000/api/edit-video/download"
              className="editor-btn btn-download-gold"
              download
              title="Download Master Clean Video"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>Download Master MP4</span>
            </a>
          )}

          <button
            type="button"
            className={`editor-btn btn-primary btn-render-main ${scenes.length === 0 ? 'btn-unready' : ''}`}
            onClick={handleStartRender}
            disabled={jobStatus === 'processing'}
            title={scenes.length === 0 ? "Click to import clips and begin master export" : "Remove watermark pixel-by-pixel and merge into one clean master"}
          >
            {jobStatus === 'processing' ? (
              <>
                <span className="loading-spinner-sm" />
                <span>Exporting ({Math.round(jobProgress)}%)...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>Execute Master Export →</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Workspace: 2 Pure Columns (Clips List + Video Monitor) ── */}
      <div className="editor-main-grid clean-layout">
        {/* Left Column: Media Clips Bin */}
        <div className="editor-panel media-bin">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="panel-title">Clips Sequence</span>
              <span className="clip-counter">{scenes.length}</span>
            </div>
            {scenes.length > 0 && (
              <button
                type="button"
                className="bin-clear-btn"
                onClick={handleClearAllScenes}
                title="Clear all clips"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="scenes-list">
            {scenes.length === 0 ? (
              <div
                className={`empty-bin-dropzone ${isDragActive ? 'active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragActive(false);
                  if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <p>Drop video clips here</p>
                <span>Click to browse files</span>
              </div>
            ) : (
              <>
                {scenes.map((s, idx) => {
                  const isSelected = selectedSceneIndex === idx && viewMode !== 'master';
                  const isDragOver = dragOverIndex === idx;
                  return (
                    <div
                      key={s.filename || idx}
                      className={`scene-clip-item ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStartClip(e, idx)}
                      onDragOver={(e) => handleDragOverClip(e, idx)}
                      onDrop={(e) => handleDropClip(e, idx)}
                      onDragEnd={() => setDragOverIndex(null)}
                      onClick={() => {
                        setSelectedSceneIndex(idx);
                        setViewMode('clip');
                      }}
                    >
                      <div className="clip-drag-handle" title="Drag to reorder sequence">
                        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                          <circle cx="2" cy="2" r="1.5" />
                          <circle cx="8" cy="2" r="1.5" />
                          <circle cx="2" cy="7" r="1.5" />
                          <circle cx="8" cy="7" r="1.5" />
                          <circle cx="2" cy="12" r="1.5" />
                          <circle cx="8" cy="12" r="1.5" />
                        </svg>
                      </div>

                      <div className="clip-order-badge">
                        {String(idx + 1).padStart(2, '0')}.
                      </div>

                      <div className="clip-details">
                        <div className="clip-name" title={s.filename}>{s.tag || s.filename}</div>
                        <div className="clip-specs">↳ {s.resolution} · {s.duration}s {s.has_audio ? '· audio ok' : '· muted'}</div>
                      </div>

                      <div className="clip-actions-group">
                        <button
                          type="button"
                          className="clip-action-btn clip-reorder-btn"
                          onClick={(e) => handleMoveClip(idx, 'up', e)}
                          disabled={idx === 0}
                          title="Move clip up"
                          aria-label="Move clip up in sequence"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="clip-action-btn clip-reorder-btn"
                          onClick={(e) => handleMoveClip(idx, 'down', e)}
                          disabled={idx === scenes.length - 1}
                          title="Move clip down"
                          aria-label="Move clip down in sequence"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="clip-action-btn clip-delete-btn"
                          onClick={(e) => handleDeleteScene(e, s.filename)}
                          title={`Delete ${s.filename}`}
                          aria-label={`Delete ${s.filename}`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="add-more-clips-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>Add More Clips</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Native Video Monitor */}
        <div className="editor-panel video-monitor">
          <div className="monitor-viewport">
            {currentVideoSrc ? (
              <div className="video-wrapper" ref={videoWrapperRef}>
                <video
                  ref={videoRef}
                  src={currentVideoSrc}
                  className="main-viewport-video"
                  crossOrigin="anonymous"
                  loop={isLooping}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onError={(e) => console.warn('Stream preview note:', e)}
                  onDoubleClick={handleToggleFullscreen}
                  onEnded={() => {
                    if (isLooping && videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play().catch(() => {});
                      setIsPlaying(true);
                    } else if (viewMode === 'clip' && scenes.length > 1) {
                      const nextIndex = (selectedSceneIndex + 1) % scenes.length;
                      setSelectedSceneIndex(nextIndex);
                      setIsPlaying(true);
                    } else {
                      setIsPlaying(false);
                    }
                  }}
                  muted={isMuted}
                  playsInline
                />

                {/* Viewport Top Bar */}
                <div className="viewport-overlay-bar">
                  <div className="monitor-badge-group">
                    {masterReady ? (
                      <>
                        <button
                          type="button"
                          className={`monitor-badge master-badge ${viewMode === 'master' ? 'active' : ''}`}
                          onClick={() => handleSwitchView('master')}
                          title="Watch Master Cleaned Video (Exact Timestamp Preserved)"
                        >
                          <span className="live-status-dot" aria-hidden="true" />
                          <span>Clean Master</span>
                        </button>
                        <button
                          type="button"
                          className={`monitor-badge ${viewMode === 'clip' ? 'active' : ''}`}
                          onClick={() => handleSwitchView('clip')}
                          title="Watch original source clip"
                        >
                          <span>Source Clip</span>
                        </button>
                      </>
                    ) : (
                      <span className="monitor-badge active">
                        <span>{activeScene ? `Source: ${activeScene.tag || activeScene.filename}` : 'Preview'}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleLoop}
                      className={`monitor-badge loop-indicator ${isLooping ? 'loop-active' : ''}`}
                      title={isLooping ? 'Loop Mode: Active (Click to toggle)' : 'Loop Mode: Inactive (Click to toggle)'}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="badge-icon"
                        aria-hidden="true"
                      >
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      <span>{isLooping ? 'Loop' : 'No Loop'}</span>
                    </button>
                  </div>

                  <div className="monitor-res-indicator" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>{viewMode === 'master' ? '1080p Master (Clean)' : (activeScene?.resolution || '1080p')}</span>
                    <button
                      type="button"
                      className="monitor-badge fullscreen-toggle-badge"
                      onClick={handleToggleFullscreen}
                      title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
                      aria-label="Toggle Fullscreen"
                    >
                      {isFullscreen ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="badge-icon">
                          <polyline points="4 14 10 14 10 20" />
                          <polyline points="20 10 14 10 14 4" />
                          <line x1="14" y1="10" x2="21" y2="3" />
                          <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="badge-icon">
                          <polyline points="15 3 21 3 21 9" />
                          <polyline points="9 21 3 21 3 15" />
                          <line x1="21" y1="3" x2="14" y2="10" />
                          <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                      )}
                      <span>{isFullscreen ? 'Exit' : 'Full'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-viewport-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <h3>No Video Selected</h3>
                <p>Import clips into the sequence list to play preview.</p>
              </div>
            )}
          </div>

          {/* Transport Controls */}
          <div className="monitor-transport-bar">
            <div className="transport-buttons">
              <button
                type="button"
                className="transport-btn"
                onClick={() => handleSeek(0)}
                title="Jump to Start (00:00)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="19 20 9 12 19 4 19 20"/>
                  <line x1="5" y1="19" x2="5" y2="5"/>
                </svg>
              </button>

              <button
                type="button"
                className="transport-btn"
                onClick={() => handleSeek(currentTime - 5)}
                title="Rewind 5s (←)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 19 2 12 11 5 11 19"/>
                  <polygon points="22 19 13 12 22 5 22 19"/>
                </svg>
                <span className="transport-btn-label">-5s</span>
              </button>

              <button
                type="button"
                className="transport-btn btn-play-pause"
                onClick={togglePlay}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                )}
              </button>

              <button
                type="button"
                className="transport-btn"
                onClick={() => handleSeek(currentTime + 5)}
                title="Forward 5s (→)"
              >
                <span className="transport-btn-label">+5s</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 19 22 12 13 5 13 19"/>
                  <polygon points="2 19 11 12 2 5 2 19"/>
                </svg>
              </button>

              <button
                type="button"
                className={`transport-btn ${isLooping ? 'active-loop' : ''}`}
                onClick={handleToggleLoop}
                title={isLooping ? 'Loop Mode: ON (Repeats continuously)' : 'Loop Mode: OFF (Click to enable)'}
                aria-pressed={isLooping}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9"/>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                <span className="transport-btn-label">{isLooping ? 'Loop ON' : 'Loop'}</span>
              </button>

              <button
                type="button"
                className="transport-btn speed-toggle"
                onClick={handleCycleSpeed}
                title="Cycle Playback Speed (0.25x - 2x)"
              >
                <span>{playbackRate}x</span>
              </button>

              {viewMode === 'clip' && scenes.length > 1 && (
                <button
                  type="button"
                  className="transport-btn"
                  onClick={() => {
                    if (selectedSceneIndex < scenes.length - 1) {
                      setSelectedSceneIndex((prev) => prev + 1);
                      setViewMode('clip');
                    } else {
                      setSelectedSceneIndex(0);
                    }
                  }}
                  title="Next Clip in Sequence"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 4 15 12 5 20 5 4"/>
                    <line x1="19" y1="5" x2="19" y2="19"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Timecode & Scrubber */}
            <div className="transport-scrub-row">
              <span className="timecode-readout current">{formatTimecode(currentTime)}</span>
              <input
                type="range"
                className="monitor-scrubber"
                min="0"
                max={duration || 100}
                step="0.01"
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
              />
              <span className="timecode-readout total">{formatTimecode(duration)}</span>
            </div>

            <div className="transport-audio">
              <button
                type="button"
                className="transport-btn"
                onClick={() => setIsMuted((m) => !m)}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                )}
              </button>

              <button
                type="button"
                className={`transport-btn ${isFullscreen ? 'active-fullscreen' : ''}`}
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                aria-label="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Processing Modal Dialog (Live Progress & Smooth Cancel) ── */}
      {isProcessingModalOpen && (
        <div className="watermark-modal-backdrop">
          <div className="watermark-modal-card processing-card">
            {jobStatus === 'processing' ? (
              <div className="processing-dialog-content">
                <div className="processing-spinner-wrap">
                  <div className="processing-pulse-ring" />
                  <span className="processing-pct-num">{Math.round(jobProgress)}%</span>
                </div>

                <h3 className="processing-title">Exporting Master Video</h3>
                <p className="processing-desc">
                  {jobMessage || 'Removing watermark pixel-by-pixel with calibrated unblend...'}
                </p>

                <div className="processing-bar-track">
                  <div className="processing-bar-fill" style={{ width: `${Math.max(4, jobProgress)}%` }} />
                </div>

                <div className="processing-specs-pill">
                  <span>Inverse Unblend · CFR 1080p · 120+ FPS</span>
                </div>

                <button
                  type="button"
                  className="btn-cancel-process"
                  onClick={handleCancelProcessing}
                >
                  Cancel Export
                </button>
              </div>
            ) : jobStatus === 'done' ? (
              <div className="processing-dialog-content success">
                <div className="success-icon-badge">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>

                <h3 className="processing-title">Master Render Complete</h3>
                <p className="processing-desc">
                  All clips merged in sequence and watermarks removed cleanly with zero artifacts.
                </p>

                <div className="success-dialog-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsProcessingModalOpen(false);
                      setViewMode('master');
                      if (videoRef.current) videoRef.current.play().catch(() => {});
                    }}
                  >
                    Watch in Player
                  </button>

                  <a
                    href="http://localhost:8000/api/edit-video/download"
                    className="btn btn-primary"
                    download
                    onClick={() => setIsProcessingModalOpen(false)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <span>Download Master MP4</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="processing-dialog-content error">
                <h3 className="processing-title" style={{ color: '#ef4444' }}>Export Failed</h3>
                <p className="processing-desc">{jobMessage || 'An unexpected error occurred during processing.'}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsProcessingModalOpen(false)}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
