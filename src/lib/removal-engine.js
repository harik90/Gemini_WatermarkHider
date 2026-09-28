/**
 * Core removal engine — reverse alpha-blend + safety clamp + feathering + inpaint fallback.
 * Fixes black blotch / diamond artifacts on dark backgrounds.
 */

import { getDefaultLogoSize, getDefaultPosition } from './alpha-maps.js';
import { detectWatermark } from './detection.js';

// Safety clamp: cap max alpha to prevent negative values on dark backgrounds
export const MAX_ALPHA_CAP = 0.85;

/**
 * 4-point star alpha generator.
 */
export function fourPointStarAlpha(x, y, cx, cy, size) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const maxR = (size / 2) * 0.95;

  if (dx === 0 && dy === 0) return MAX_ALPHA_CAP;

  // Astroid curve: (x/a)^(2/3) + (y/b)^(2/3) <= 1
  const p = 0.68;
  const d = Math.pow(dx / maxR, p) + Math.pow(dy / maxR, p);

  if (d > 1.0) return 0;

  const rawAlpha = Math.pow(1.0 - d, 0.4) * 0.85;
  return Math.min(MAX_ALPHA_CAP, Math.max(0, rawAlpha));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Samples the 5x5 neighborhood average around a pixel.
 */
function sample5x5Avg(data, imgW, imgH, px, py, channel) {
  let sum = 0;
  let count = 0;

  for (let dy = -2; dy <= 2; dy++) {
    const ny = py + dy;
    if (ny < 0 || ny >= imgH) continue;
    const rowOffset = ny * imgW;

    for (let dx = -2; dx <= 2; dx++) {
      const nx = px + dx;
      if (nx < 0 || nx >= imgW) continue;

      sum += data[(rowOffset + nx) * 4 + channel];
      count++;
    }
  }

  return count > 0 ? sum / count : 128;
}

/**
 * Reconstructs boundary colors for inpainting fallback.
 */
function buildBoundaryModel(data, imgW, imgH, x0, y0, w, h) {
  const top = [];
  const bottom = [];
  const left = [];
  const right = [];

  const pad = Math.max(3, Math.floor(w * 0.08));
  const yTop = Math.max(0, y0 - pad);
  const yBtm = Math.min(imgH - 1, y0 + h + pad);

  for (let x = 0; x < w; x++) {
    const px = Math.min(imgW - 1, Math.max(0, x0 + x));
    const tIdx = (yTop * imgW + px) * 4;
    const bIdx = (yBtm * imgW + px) * 4;
    top.push([data[tIdx], data[tIdx + 1], data[tIdx + 2]]);
    bottom.push([data[bIdx], data[bIdx + 1], data[bIdx + 2]]);
  }

  const xLft = Math.max(0, x0 - pad);
  const xRgt = Math.min(imgW - 1, x0 + w + pad);

  for (let y = 0; y < h; y++) {
    const py = Math.min(imgH - 1, Math.max(0, y0 + y));
    const lIdx = (py * imgW + xLft) * 4;
    const rIdx = (py * imgW + xRgt) * 4;
    left.push([data[lIdx], data[lIdx + 1], data[lIdx + 2]]);
    right.push([data[rIdx], data[rIdx + 1], data[rIdx + 2]]);
  }

  return { top, bottom, left, right, w, h };
}

function getInpaintValue(boundary, relX, relY, channel) {
  const { top, bottom, left, right, w, h } = boundary;

  const rx = Math.min(w - 1, Math.max(0, relX));
  const ry = Math.min(h - 1, Math.max(0, relY));

  const hPct = (rx + 0.5) / w;
  const vPct = (ry + 0.5) / h;

  const tVal = top[rx] ? top[rx][channel] : 128;
  const bVal = bottom[rx] ? bottom[rx][channel] : 128;
  const lVal = left[ry] ? left[ry][channel] : 128;
  const rVal = right[ry] ? right[ry][channel] : 128;

  const vInterp = tVal * (1 - vPct) + bVal * vPct;
  const hInterp = lVal * (1 - hPct) + rVal * hPct;

  return (vInterp + hInterp) * 0.5;
}

/**
 * Removes the watermark using Safety Clamped Reverse Blend + Inpaint Fallback + Radial Feathering.
 */
export function removeWatermark(imageData, width, height, options = {}) {
  const {
    x: customX,
    y: customY,
    logoSize: customSize,
    mode = 'reverse-blend',
  } = options;

  const logoSize = customSize || getDefaultLogoSize(width, height);
  const pos = (customX !== undefined && customY !== undefined)
    ? { x: Math.round(customX), y: Math.round(customY) }
    : getDefaultPosition(width, height, logoSize);

  const rx = pos.x;
  const ry = pos.y;
  const cx = rx + logoSize / 2;
  const cy = ry + logoSize / 2;
  const maxRadius = logoSize / 2;

  const data = imageData.data;
  const boundary = buildBoundaryModel(data, width, height, rx, ry, logoSize, logoSize);
  const isPureInpaint = mode === 'inpaint';

  for (let y = 0; y < logoSize; y++) {
    const py = ry + y;
    if (py < 0 || py >= height) continue;
    const rowOffset = py * width;

    for (let x = 0; x < logoSize; x++) {
      const px = rx + x;
      if (px < 0 || px >= width) continue;

      const alpha = fourPointStarAlpha(px, py, cx, cy, logoSize);
      if (alpha <= 0.005) continue;

      const dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
      const normDist = dist / maxRadius;

      // Soft radial feathering at the outer edge (smoothstep falloff from edge)
      const feather = 1.0 - smoothstep(0.85, 1.02, normDist);
      if (feather <= 0.001) continue;

      const idx = (rowOffset + px) * 4;
      const oneMinusA = 1 - alpha;
      const inpaintWeight = isPureInpaint ? 1.0 : smoothstep(0.18, 0.70, alpha);

      // Pre-sample inpaint values for all 3 channels
      const inpaintVals = [
        getInpaintValue(boundary, x, y, 0),
        getInpaintValue(boundary, x, y, 1),
        getInpaintValue(boundary, x, y, 2),
      ];

      const compOriginal = [0, 0, 0];
      let needsFallback = isPureInpaint;

      if (!needsFallback) {
        for (let c = 0; c < 3; c++) {
          const watermarked = data[idx + c];
          const alpha255 = alpha * 255;
          const orig = oneMinusA > 0.04 ? (watermarked - alpha255) / oneMinusA : inpaintVals[c];
          compOriginal[c] = orig;

          if (orig < 0 || orig > 255) {
            needsFallback = true;
          } else {
            const localAvg = sample5x5Avg(data, width, height, px, py, c);
            if (Math.abs(localAvg - orig) > 36) {
              needsFallback = true;
            }
          }
        }

        // Chromatic shift protection: protect against cyan/green artifacts
        if (!needsFallback) {
          const origRG = compOriginal[0] - compOriginal[1];
          const origGB = compOriginal[1] - compOriginal[2];
          const inpRG = inpaintVals[0] - inpaintVals[1];
          const inpGB = inpaintVals[1] - inpaintVals[2];
          if (Math.abs(origRG - inpRG) > 25 || Math.abs(origGB - inpGB) > 25) {
            needsFallback = true;
          }
        }
      }

      // Synchronously apply corrected values across R, G, B
      for (let c = 0; c < 3; c++) {
        const watermarked = data[idx + c];
        const inpaintVal = inpaintVals[c];
        let corrected;
        if (needsFallback) {
          corrected = inpaintVal;
        } else {
          corrected = compOriginal[c] * (1 - inpaintWeight) + inpaintVal * inpaintWeight;
        }

        const finalVal = watermarked + (corrected - watermarked) * feather;
        data[idx + c] = clamp(finalVal);
      }
    }
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
