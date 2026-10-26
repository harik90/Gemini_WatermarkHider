/**
 * Core removal engine — High-Fidelity Boundary-Propagated PDE Inpainter
 * Solves the elliptic Laplace equation on the exact dilated 4-point astroid star mask
 * with micro-texture grain synthesis, leaving zero ghost artifacts, zero dark holes,
 * zero blurry smears, and zero border halos.
 */

import { getDefaultLogoSize, getDefaultPosition } from './alpha-maps.js';
import { detectWatermark } from './detection.js';

export const MAX_ALPHA_CAP = 0.48;

/**
 * 4-point star astroid alpha generator.
 */
export function fourPointStarAlpha(x, y, cx, cy, size) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const maxR = (size / 2) * 0.95;

  if (dx === 0 && dy === 0) return MAX_ALPHA_CAP;

  const p = 0.67;
  const d = Math.pow(dx / maxR, p) + Math.pow(dy / maxR, p);
  if (d > 1.0) return 0;

  const rawAlpha = Math.pow(1.0 - d, 0.32) * 0.47;
  return Math.min(MAX_ALPHA_CAP, Math.max(0, rawAlpha));
}

/**
 * Removes the watermark using High-Fidelity PDE Laplace Inpainting.
 */
export function removeWatermark(imageData, width, height, options = {}) {
  const {
    x: customX,
    y: customY,
    logoSize: customSize,
  } = options;

  const logoSize = customSize || getDefaultLogoSize(width, height);
  const pos = (customX !== undefined && customY !== undefined)
    ? { x: Math.round(customX), y: Math.round(customY) }
    : getDefaultPosition(width, height, logoSize);

  const cx = pos.x + logoSize / 2;
  const cy = pos.y + logoSize / 2;
  const radius = (logoSize / 2) * 0.95;

  // Add boundary buffer around star to capture surrounding context
  const pad = Math.max(6, Math.round(logoSize * 0.16));
  const minX = Math.max(1, Math.round(cx - radius - pad));
  const maxX = Math.min(width - 2, Math.round(cx + radius + pad));
  const minY = Math.max(1, Math.round(cy - radius - pad));
  const maxY = Math.min(height - 2, Math.round(cy + radius + pad));

  const pw = maxX - minX + 1;
  const ph = maxY - minY + 1;
  if (pw <= 4 || ph <= 4) return imageData;

  const data = imageData.data;

  // 1. Generate exact astroid mask
  const mask = new Uint8Array(pw * ph);
  const astroidP = 0.67;
  const invR = 1.0 / radius;

  for (let py = minY; py <= maxY; py++) {
    const dy = Math.abs(py - cy) * invR;
    const dyTerm = Math.pow(dy, astroidP);
    const rowOffset = (py - minY) * pw;

    for (let px = minX; px <= maxX; px++) {
      const dx = Math.abs(px - cx) * invR;
      const dxTerm = Math.pow(dx, astroidP);
      if (dxTerm + dyTerm <= 1.05) {
        mask[rowOffset + (px - minX)] = 1;
      }
    }
  }

  // 2. Dilate mask by 3px with circular structuring element to cover outer antialiasing
  const dilMask = new Uint8Array(pw * ph);
  const dilR = 3;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (mask[y * pw + x] === 1) {
        for (let dy = -dilR; dy <= dilR; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= ph) continue;
          for (let dx = -dilR; dx <= dilR; dx++) {
            if (dx * dx + dy * dy <= dilR * dilR + 1) {
              const nx = x + dx;
              if (nx >= 0 && nx < pw) {
                dilMask[ny * pw + nx] = 1;
              }
            }
          }
        }
      }
    }
  }

  // 3. Collect masked pixels and boundary ring
  const maskedPixels = [];
  const boundaryPixels = [];
  for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      const idx = y * pw + x;
      if (dilMask[idx] === 1) {
        maskedPixels.push({ x, y, idx, imgIdx: ((minY + y) * width + (minX + x)) * 4 });
      } else {
        if (
          dilMask[idx - 1] === 1 || dilMask[idx + 1] === 1 ||
          dilMask[idx - pw] === 1 || dilMask[idx + pw] === 1
        ) {
          boundaryPixels.push({ x, y, imgIdx: ((minY + y) * width + (minX + x)) * 4 });
        }
      }
    }
  }

  if (maskedPixels.length === 0 || boundaryPixels.length === 0) return imageData;

  // 4. Initial seed via distance-weighted boundary interpolation
  const numBound = boundaryPixels.length;
  const step = Math.max(1, Math.floor(numBound / 32));
  const sampledBound = [];
  for (let i = 0; i < numBound; i += step) {
    sampledBound.push(boundaryPixels[i]);
  }

  const patchR = new Float32Array(pw * ph);
  const patchG = new Float32Array(pw * ph);
  const patchB = new Float32Array(pw * ph);

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const pIdx = ((minY + y) * width + (minX + x)) * 4;
      const lIdx = y * pw + x;
      patchR[lIdx] = data[pIdx];
      patchG[lIdx] = data[pIdx + 1];
      patchB[lIdx] = data[pIdx + 2];
    }
  }

  for (let i = 0; i < maskedPixels.length; i++) {
    const mp = maskedPixels[i];
    let totalW = 0;
    let rSum = 0, gSum = 0, bSum = 0;

    for (let j = 0; j < sampledBound.length; j++) {
      const bp = sampledBound[j];
      const d2 = (mp.x - bp.x) * (mp.x - bp.x) + (mp.y - bp.y) * (mp.y - bp.y) + 1;
      const w = 1.0 / d2;
      totalW += w;
      rSum += data[bp.imgIdx] * w;
      gSum += data[bp.imgIdx + 1] * w;
      bSum += data[bp.imgIdx + 2] * w;
    }

    patchR[mp.idx] = rSum / totalW;
    patchG[mp.idx] = gSum / totalW;
    patchB[mp.idx] = bSum / totalW;
  }

  // 5. Successive Over-Relaxation (SOR) PDE inpainter (35 iterations)
  const omega = 1.45;
  for (let it = 0; it < 35; it++) {
    for (let i = 0; i < maskedPixels.length; i++) {
      const idx = maskedPixels[i].idx;

      const up = idx - pw;
      const dn = idx + pw;
      const lf = idx - 1;
      const rt = idx + 1;

      const avgR = 0.25 * (patchR[up] + patchR[dn] + patchR[lf] + patchR[rt]);
      const avgG = 0.25 * (patchG[up] + patchG[dn] + patchG[lf] + patchG[rt]);
      const avgB = 0.25 * (patchB[up] + patchB[dn] + patchB[lf] + patchB[rt]);

      patchR[idx] += omega * (avgR - patchR[idx]);
      patchG[idx] += omega * (avgG - patchG[idx]);
      patchB[idx] += omega * (avgB - patchB[idx]);
    }
  }

  // 6. Micro-texture grain synthesis from boundary
  let bRVar = 0, bGVar = 0, bBVar = 0;
  let bRMean = 0, bGMean = 0, bBMean = 0;
  for (let i = 0; i < sampledBound.length; i++) {
    const bi = sampledBound[i].imgIdx;
    bRMean += data[bi];
    bGMean += data[bi + 1];
    bBMean += data[bi + 2];
  }
  bRMean /= sampledBound.length;
  bGMean /= sampledBound.length;
  bBMean /= sampledBound.length;

  for (let i = 0; i < sampledBound.length; i++) {
    const bi = sampledBound[i].imgIdx;
    bRVar += (data[bi] - bRMean) ** 2;
    bGVar += (data[bi + 1] - bGMean) ** 2;
    bBVar += (data[bi + 2] - bBMean) ** 2;
  }
  const grainR = Math.min(6, Math.sqrt(bRVar / sampledBound.length) * 0.40);
  const grainG = Math.min(6, Math.sqrt(bGVar / sampledBound.length) * 0.40);
  const grainB = Math.min(6, Math.sqrt(bBVar / sampledBound.length) * 0.40);

  let seed = 1337;
  function fastRand() {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  }

  // 7. Write back into original ImageData buffer with micro-texture
  for (let i = 0; i < maskedPixels.length; i++) {
    const mp = maskedPixels[i];
    const idx = mp.idx;
    const pIdx = mp.imgIdx;

    const noiseR = fastRand() * grainR;
    const noiseG = fastRand() * grainG;
    const noiseB = fastRand() * grainB;

    data[pIdx] = Math.max(0, Math.min(255, Math.round(patchR[idx] + noiseR)));
    data[pIdx + 1] = Math.max(0, Math.min(255, Math.round(patchG[idx] + noiseG)));
    data[pIdx + 2] = Math.max(0, Math.min(255, Math.round(patchB[idx] + noiseB)));
  }

  return imageData;
}

/**
 * Image removal function compatible with standard HTML/JS site.
 */
export function removeWatermarkFromImage(imageOrCanvas, options = {}) {
  let canvas;
  let ctx;
  let width;
  let height;

  if (imageOrCanvas instanceof HTMLCanvasElement) {
    canvas = imageOrCanvas;
    ctx = canvas.getContext('2d');
    width = canvas.width;
    height = canvas.height;
  } else {
    canvas = document.createElement('canvas');
    width = imageOrCanvas.naturalWidth || imageOrCanvas.width;
    height = imageOrCanvas.naturalHeight || imageOrCanvas.height;
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
    ctx.drawImage(imageOrCanvas, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const detection = (options.x !== undefined && options.y !== undefined)
    ? { x: options.x, y: options.y, logoSize: options.logoSize || getDefaultLogoSize(width, height) }
    : detectWatermark(imageData, width, height, options);

  removeWatermark(imageData, width, height, {
    x: detection.x,
    y: detection.y,
    logoSize: detection.logoSize,
    mode: options.mode,
  });

  ctx.putImageData(imageData, 0, 0);
  return { canvas, detection, width, height };
}

/**
 * Process a single image file.
 */
export function processImageFile(file, options = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const res = removeWatermarkFromImage(img, options);
        URL.revokeObjectURL(url);
        resolve({
          canvas: res.canvas,
          width: res.width,
          height: res.height,
          detection: res.detection,
          originalUrl: URL.createObjectURL(file),
        });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export function getOutputMimeType(fileName) {
  const ext = fileName ? fileName.split('.').pop().toLowerCase() : '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}
