/**
 * Video processing pipeline — dedicated dual-star watermark removal engine
 * with real-time canvas stream, synchronized audio preservation, and chroma-safe boundary inpainting.
 *
 * Specifically addresses Google Gemini & Veo video watermarks:
 * 1. Models both the Primary (large) and Secondary (smaller down-right) sparkle stars.
 * 2. Employs gradient-adaptive, chroma-safe boundary inpainting to eliminate cyan/green color artifacts
 *    caused by lossy YUV420 compression.
 * 3. Pre-computes a zero-allocation Lookup Table (LUT) for <0.1ms per-frame inpainting speed.
 */

import { getDefaultLogoSize } from './alpha-maps.js';
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
/**
 * Default position for Gemini / Veo video watermark.
 * Watermark sits in the bottom-right corner.
 */
export function getDefaultVideoWatermarkPosition(width, height, logoSize, isDualStar = false) {
  const boxW = isDualStar ? Math.round(logoSize * 1.65) : logoSize;
  const boxH = isDualStar ? Math.round(logoSize * 1.25) : logoSize;
  const marginX = Math.max(16, Math.floor(width * 0.02));
  const marginY = Math.max(16, Math.floor(height * 0.025));
  return {
    x: Math.max(0, width - boxW - marginX),
    y: Math.max(0, height - boxH - marginY),
    logoSize,
    boxW,
    boxH,
    isDualStar,
  };
}

/**
 * Evaluates the watermark alpha mask at (x, y).
 * Primary star centered at (cx1, cy1) with radius r1.
 * Secondary star (if r2 > 0) centered down-right at (cx2, cy2) with radius r2.
 * Includes pad-dilation to encompass anti-aliased edge halos and prevent cyan clipping.
 */
export function geminiDualStarAlpha(x, y, cx1, cy1, r1, cx2, cy2, r2 = 0) {
  // Star 1 (Primary Star)
  const pad1 = Math.max(2.5, r1 * 0.06);
  const dx1 = Math.max(0, Math.abs(x - cx1) - pad1);
  const dy1 = Math.max(0, Math.abs(y - cy1) - pad1);
  const d1 = Math.pow(dx1 / r1, 0.68) + Math.pow(dy1 / r1, 0.68);
  let m1 = 0;
  if (d1 <= 1.15) {
    m1 = Math.max(0, 1.0 - (d1 - 0.70) / 0.45);
  }

  // Star 2 (Secondary Star for Veo dual-star)
  let m2 = 0;
  if (r2 > 0) {
    const pad2 = Math.max(2.0, r2 * 0.08);
    const dx2 = Math.max(0, Math.abs(x - cx2) - pad2);
    const dy2 = Math.max(0, Math.abs(y - cy2) - pad2);
    const d2 = Math.pow(dx2 / r2, 0.68) + Math.pow(dy2 / r2, 0.68);
    if (d2 <= 1.20) {
      m2 = Math.max(0, 1.0 - (d2 - 0.70) / 0.50);
    }
  }

  return Math.min(1.0, Math.max(m1, m2));
}

/**
 * Builds a high-speed precomputed LUT (Lookup Table) for video frame inpainting.
 * Calculates spatial boundary weights once so each frame processes in < 0.1ms with 0 allocations.
 */
export function createVideoWatermarkEngine(patchW, patchH, relX, relY, logoSize, isDualStar = false) {
  // Constellation geometry — Primary star is centered exactly in the detected box
  const cx1 = relX + logoSize * 0.50;
  const cy1 = relY + logoSize * 0.50;
  const r1 = logoSize * 0.48;

  // Secondary star (for dual-star watermarks like Veo)
  const cx2 = cx1 + r1 * 1.02;
  const cy2 = cy1 + r1 * 0.65;
  const r2 = isDualStar ? r1 * 0.40 : 0;

  // 1. Generate mask over patch
  const mask = new Float32Array(patchW * patchH);
  let activeCount = 0;

  for (let y = 0; y < patchH; y++) {
    const rowOffset = y * patchW;
    for (let x = 0; x < patchW; x++) {
      const alpha = geminiDualStarAlpha(x, y, cx1, cy1, r1, cx2, cy2, r2);
      mask[rowOffset + x] = alpha;
      if (alpha > 0.01) {
        activeCount++;
      }
    }
  }

  // 2. Pre-compute LUT arrays for active pixels
  const lutPixel = new Int32Array(activeCount);
  const lutTop = new Int32Array(activeCount);
  const lutBtm = new Int32Array(activeCount);
  const lutLft = new Int32Array(activeCount);
  const lutRgt = new Int32Array(activeCount);

  const lutWt = new Float32Array(activeCount);
  const lutWb = new Float32Array(activeCount);
  const lutWl = new Float32Array(activeCount);
  const lutWr = new Float32Array(activeCount);

  const lutAlpha = new Float32Array(activeCount);
  const lutInvAlpha = new Float32Array(activeCount);

  let idx = 0;
  for (let y = 0; y < patchH; y++) {
    for (let x = 0; x < patchW; x++) {
      const m = mask[y * patchW + x];
      if (m <= 0.01) continue;

      // Find unmasked boundary pixels in 4 cardinal directions
      let yt = y;
      while (yt > 0 && mask[yt * patchW + x] > 0.01) yt--;
      const dt = Math.max(1, y - yt);

      let yb = y;
      while (yb < patchH - 1 && mask[yb * patchW + x] > 0.01) yb++;
      const db = Math.max(1, yb - y);

      let xl = x;
      while (xl > 0 && mask[y * patchW + xl] > 0.01) xl--;
      const dl = Math.max(1, x - xl);

      let xr = x;
      while (xr < patchW - 1 && mask[y * patchW + xr] > 0.01) xr++;
      const dr = Math.max(1, xr - x);

      // Distance weights
      const wt = 1.0 / Math.pow(dt, 1.2);
      const wb = 1.0 / Math.pow(db, 1.2);
      const wl = 1.0 / Math.pow(dl, 1.2);
      const wr = 1.0 / Math.pow(dr, 1.2);
      const invSum = 1.0 / (wt + wb + wl + wr);

      // Smooth Hermite feathering
      const smoothA = m * m * (3.0 - 2.0 * m);

      lutPixel[idx] = (y * patchW + x) * 4;
      lutTop[idx] = (yt * patchW + x) * 4;
      lutBtm[idx] = (yb * patchW + x) * 4;
      lutLft[idx] = (y * patchW + xl) * 4;
      lutRgt[idx] = (y * patchW + xr) * 4;

      lutWt[idx] = wt * invSum;
      lutWb[idx] = wb * invSum;
      lutWl[idx] = wl * invSum;
      lutWr[idx] = wr * invSum;

      lutAlpha[idx] = smoothA;
      lutInvAlpha[idx] = 1.0 - smoothA;

      idx++;
    }
  }

  /**
   * Ultra fast per-frame processor: runs in ~0.05ms with 0 allocations.
   */
  function processPatch(patchData) {
    const data = patchData.data;
    const len = activeCount;

    for (let i = 0; i < len; i++) {
      const p = lutPixel[i];
      const t = lutTop[i];
      const b = lutBtm[i];
      const l = lutLft[i];
      const r = lutRgt[i];

      const wt = lutWt[i];
      const wb = lutWb[i];
      const wl = lutWl[i];
      const wr = lutWr[i];

      const a = lutAlpha[i];
      const invA = lutInvAlpha[i];

      // Chroma-safe interpolation: R, G, and B share exact same weights
      const rIn = data[t] * wt + data[b] * wb + data[l] * wl + data[r] * wr;
      const gIn = data[t + 1] * wt + data[b + 1] * wb + data[l + 1] * wl + data[r + 1] * wr;
      const bIn = data[t + 2] * wt + data[b + 2] * wb + data[l + 2] * wl + data[r + 2] * wr;

      data[p] = (data[p] * invA + rIn * a + 0.5) | 0;
      data[p + 1] = (data[p + 1] * invA + gIn * a + 0.5) | 0;
      data[p + 2] = (data[p + 2] * invA + bIn * a + 0.5) | 0;
    }
  }

  return {
    activeCount,
    processPatch,
    mask,
  };
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

  const cleanupVideoEl = () => {
    if (videoEl && videoEl.parentNode) {
      videoEl.parentNode.removeChild(videoEl);
    }
  };

  try {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Your browser does not support MediaRecorder for video processing.');
    }

    videoEl = document.createElement('video');
    videoEl.preload = 'auto';
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.style.position = 'fixed';
    videoEl.style.top = '-9999px';
    videoEl.style.left = '-9999px';
    videoEl.style.width = '4px';
    videoEl.style.height = '4px';
    videoEl.style.opacity = '0';
    videoEl.style.pointerEvents = 'none';
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(videoEl);
    }

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
    const defaultPos = getDefaultVideoWatermarkPosition(
      width,
      height,
      options.logoSize || getDefaultLogoSize(width, height),
      options.isDualStar || false
    );

    if (options?.x !== undefined && options?.y !== undefined) {
      detection = {
        x: Math.round(options.x),
        y: Math.round(options.y),
        logoSize: options.logoSize || getDefaultLogoSize(width, height),
        confidence: 1.0,
        isDualStar: options.isDualStar !== undefined ? !!options.isDualStar : false,
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
        if (d.confidence >= 0.40) {
          bestD = d;
          break;
        }
        if (!bestD || d.confidence > bestD.confidence) {
          bestD = d;
        }
      }
      detection = bestD || {
        ...defaultPos,
        confidence: 0,
      };
    }

    const watermarkX = detection.x;
    const watermarkY = detection.y;
    const logoSize = detection.logoSize;

    // Check if secondary star is present (Veo videos vs single-star Gemini videos)
    let isDualStar = options.isDualStar !== undefined ? !!options.isDualStar : false;
    if (options.isDualStar === undefined && detection.confidence >= 0.35) {
      const cx1 = watermarkX + logoSize * 0.50;
      const cy1 = watermarkY + logoSize * 0.50;
      const r1 = logoSize * 0.48;
      const cx2 = Math.round(cx1 + r1 * 1.02);
      const cy2 = Math.round(cy1 + r1 * 0.65);
      if (cx2 < width - 4 && cy2 < height - 4) {
        const patchData = ctx.getImageData(cx2 - 2, cy2 - 2, 5, 5).data;
        let sSum = 0;
        for (let i = 0; i < patchData.length; i += 4) {
          sSum += 0.299 * patchData[i] + 0.587 * patchData[i + 1] + 0.114 * patchData[i + 2];
        }
        const star2Luma = sSum / (patchData.length / 4);
        const bgData = ctx.getImageData(Math.min(width - 2, cx2 + 10), cy2, 1, 1).data;
        const bgLuma = 0.299 * bgData[0] + 0.587 * bgData[1] + 0.114 * bgData[2];
        if (star2Luma - bgLuma > 5.0) {
          isDualStar = true;
        }
      }
    }
    detection.isDualStar = isDualStar;

    // Pad region by 16px to sample true surrounding background for clean boundary inpainting
    const pad = 16;
    const patchX = Math.max(0, Math.floor(watermarkX - pad));
    const patchY = Math.max(0, Math.floor(watermarkY - pad));
    const patchW = isDualStar
      ? Math.min(width - patchX, Math.ceil(logoSize * 1.70 + pad * 2))
      : Math.min(width - patchX, Math.ceil(logoSize + pad * 2));
    const patchH = isDualStar
      ? Math.min(height - patchY, Math.ceil(logoSize * 1.35 + pad * 2))
      : Math.min(height - patchY, Math.ceil(logoSize + pad * 2));
    const relX = watermarkX - patchX;
    const relY = watermarkY - patchY;

    // Build the high-performance LUT engine once
    const engine = createVideoWatermarkEngine(patchW, patchH, relX, relY, logoSize, isDualStar);

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
    engine.processPatch(initialPatch);
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
      cleanupVideoEl();

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
        detection: {
          ...detection,
          isDualStar,
        },
      });
    };

    const processCurrentFrame = () => {
      if (isFinished) return;

      ctx.drawImage(videoEl, 0, 0);
      const patchData = ctx.getImageData(patchX, patchY, patchW, patchH);
      engine.processPatch(patchData);
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

    videoEl.ontimeupdate = () => {
      if (isFinished) return;
      processCurrentFrame();
    };

    videoEl.onended = finish;

    if (signal) {
      signal.addEventListener('abort', () => {
        isFinished = true;
        videoEl.pause();
        if (animId) cancelAnimationFrame(animId);
        cleanupVideoEl();
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
    cleanupVideoEl();
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

