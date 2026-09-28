/**
 * Video processing pipeline — real-time canvas stream watermark removal
 * with synchronized audio preservation and auto-detection.
 */

import { removeWatermark } from './removal-engine.js';
import { getDefaultLogoSize, getDefaultPosition } from './alpha-maps.js';
import { detectWatermark } from './detection.js';

/**
 * Returns supported MIME type for MediaRecorder.
 */
export function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/**
 * Safely seek to a target time with event listener and safety timeout.
 */
function safeSeek(videoEl, targetTime, timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (Math.abs(videoEl.currentTime - targetTime) < 0.03) {
      resolve();
      return;
    }
    let timer = null;
    const onSeeked = () => {
      clearTimeout(timer);
      videoEl.removeEventListener('seeked', onSeeked);
      resolve();
    };
    timer = setTimeout(() => {
      videoEl.removeEventListener('seeked', onSeeked);
      resolve();
    }, timeoutMs);
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = Math.max(0, targetTime);
  });
}

/**
 * Process a video file, removing watermarks frame-by-frame in real-time.
 */
export async function processVideo(file, onProgress, onComplete, onError, signal, options = {}) {
  let url = null;
  let audioCtx = null;
  let videoEl = null;

  try {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Your browser does not support MediaRecorder for video processing.');
    }

    videoEl = document.createElement('video');
    videoEl.preload = 'auto';
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    url = URL.createObjectURL(file);
    videoEl.src = url;

    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Failed to load video file metadata.'));
    });

    let duration = videoEl.duration;
    if (!isFinite(duration) || isNaN(duration) || duration <= 0) {
      videoEl.currentTime = 1e101;
      await new Promise((r) => {
        const onTime = () => {
          videoEl.removeEventListener('timeupdate', onTime);
          r();
        };
        videoEl.addEventListener('timeupdate', onTime);
        setTimeout(r, 600);
      });
      duration = isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 10;
      videoEl.currentTime = 0;
    }

    const width = videoEl.videoWidth || 1280;
    const height = videoEl.videoHeight || 720;
    const fps = 30;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Watermark detection across sample frames (handles fade-in from black)
    let detection = null;
    if (options?.x !== undefined && options?.y !== undefined) {
      detection = {
        x: Math.round(options.x),
        y: Math.round(options.y),
        logoSize: options.logoSize || getDefaultLogoSize(width, height),
        confidence: 1.0,
      };
    } else {
      const samplePoints = [
        Math.min(0.5, duration * 0.1 || 0.1),
        Math.min(1.5, duration * 0.25 || 0.5),
        Math.min(3.0, duration * 0.5 || 1.0),
      ];
      let bestD = null;
      for (const st of samplePoints) {
        await safeSeek(videoEl, st);
        ctx.drawImage(videoEl, 0, 0);
        const sData = ctx.getImageData(0, 0, width, height);
        const d = detectWatermark(sData, width, height, options);
        if (d.confidence >= 0.45) {
          bestD = d;
          break;
        }
        if (!bestD || d.confidence > bestD.confidence) {
          bestD = d;
        }
      }
      detection = bestD || {
        ...getDefaultPosition(width, height, getDefaultLogoSize(width, height)),
        logoSize: getDefaultLogoSize(width, height),
        confidence: 0,
      };
    }

    const watermarkX = detection.x;
    const watermarkY = detection.y;
    const logoSize = detection.logoSize;

    // Pad region by 16px to sample true surrounding background for clean boundary inpainting
    const pad = 16;
    const patchX = Math.max(0, Math.floor(watermarkX - pad));
    const patchY = Math.max(0, Math.floor(watermarkY - pad));
    const patchW = Math.min(width - patchX, Math.ceil(logoSize + pad * 2));
    const patchH = Math.min(height - patchY, Math.ceil(logoSize + pad * 2));
    const relX = watermarkX - patchX;
    const relY = watermarkY - patchY;

    // Seek back to start
    await safeSeek(videoEl, 0.0);

    // Audio capture via AudioContext (silent to speakers, routed directly to destination)
    let audioTrack = null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaElementSource(videoEl);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        if (tracks && tracks.length > 0) {
          audioTrack = tracks[0];
        }
      }
    } catch {
      // AudioContext route failed; fallback to captureStream if available
    }

    if (!audioTrack) {
      try {
        if (typeof videoEl.captureStream === 'function') {
          const vStream = videoEl.captureStream();
          const tracks = vStream.getAudioTracks();
          if (tracks && tracks.length > 0) {
            audioTrack = tracks[0];
          }
        }
      } catch {
        // Proceed without audio track
      }
    }

    // Process initial frame at t = 0
    ctx.drawImage(videoEl, 0, 0);
    const initialPatch = ctx.getImageData(patchX, patchY, patchW, patchH);
    removeWatermark(initialPatch, patchW, patchH, { x: relX, y: relY, logoSize });
    ctx.putImageData(initialPatch, patchX, patchY);

    const stream = canvas.captureStream(fps);
    if (audioTrack) {
      stream.addTrack(audioTrack);
    }

    const mimeType = getSupportedMimeType();
    const recorderOptions = {
      videoBitsPerSecond: Math.min(12_000_000, Math.max(2_500_000, width * height * 4)),
    };
    if (mimeType) {
      recorderOptions.mimeType = mimeType;
    }

    const mediaRecorder = new MediaRecorder(stream, recorderOptions);
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recordingDone = new Promise((resolve) => {
      mediaRecorder.onstop = resolve;
    });

    mediaRecorder.start(250);

    let isFinished = false;
    let frameCount = 0;
    const startTime = performance.now();
    let animId = null;

    const finish = async () => {
      if (isFinished) return;
      isFinished = true;
      videoEl.pause();
      if (animId) cancelAnimationFrame(animId);

      await new Promise((r) => setTimeout(r, 250));

      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      await recordingDone;

      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      if (url) URL.revokeObjectURL(url);

      const finalMime = mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: finalMime });

      onProgress?.({
        frame: frameCount,
        totalFrames: Math.ceil(duration * fps),
        percent: 100,
        eta: 0,
      });

      onComplete?.({
        blob,
        width,
        height,
        duration,
        frames: frameCount,
        url: URL.createObjectURL(blob),
        detection,
      });
    };

    const processCurrentFrame = () => {
      if (isFinished) return;

      ctx.drawImage(videoEl, 0, 0);
      const patchData = ctx.getImageData(patchX, patchY, patchW, patchH);
      removeWatermark(patchData, patchW, patchH, {
        x: relX,
        y: relY,
        logoSize,
      });
      ctx.putImageData(patchData, patchX, patchY);

      frameCount++;
      const cur = videoEl.currentTime;
      const percent = Math.min(99, Math.round((cur / duration) * 100));
      onProgress?.({
        frame: frameCount,
        totalFrames: Math.ceil(duration * fps),
        percent: isNaN(percent) ? 0 : percent,
        eta: estimateETA(cur, duration, startTime),
      });

      if (cur >= duration - 0.05) {
        finish();
      }
    };

    const loop = () => {
      if (isFinished) return;
      processCurrentFrame();
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        videoEl.requestVideoFrameCallback(loop);
      } else {
        animId = requestAnimationFrame(loop);
      }
    };

    videoEl.onended = finish;

    if (signal) {
      signal.addEventListener('abort', () => {
        isFinished = true;
        videoEl.pause();
        if (animId) cancelAnimationFrame(animId);
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
        if (url) URL.revokeObjectURL(url);
      });
    }

    try {
      videoEl.volume = 1.0;
      videoEl.muted = false;
      await videoEl.play();
    } catch {
      videoEl.muted = true;
      await videoEl.play();
    }

    if (typeof videoEl.requestVideoFrameCallback === 'function') {
      videoEl.requestVideoFrameCallback(loop);
    } else {
      animId = requestAnimationFrame(loop);
    }
  } catch (err) {
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
    if (url) URL.revokeObjectURL(url);
    onError?.(err);
  }
}

function estimateETA(currentTime, duration, startTime) {
  if (!currentTime || currentTime <= 0.2) return null;
  const elapsed = (performance.now() - startTime) / 1000;
  const rate = currentTime / elapsed;
  if (rate <= 0) return null;
  const remaining = (duration - currentTime) / rate;
  return Math.max(0, Math.round(remaining));
}

export function formatETA(seconds) {
  if (seconds == null || isNaN(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export const removeWatermarkFromVideo = processVideo;
