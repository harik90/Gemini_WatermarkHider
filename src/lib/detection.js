/**
 * Detection engine — scans image/frame to locate the Gemini sparkle watermark.
 * Uses High-Pass Difference-of-Means filtering and Zero-mean Normalized Cross-Correlation (ZNCC)
 * with pre-calibrated astroid alpha maps to ensure bright skies, clouds, and sharp edges are never
 * mistaken for watermarks.
 */

import { getDefaultLogoSize, getDefaultPosition, getAlphaMap } from './alpha-maps.js';

const CONFIDENCE_THRESHOLD = 0.35;
const templateStatsCache = new Map();

/**
 * Pre-computes template statistics for fast normalized cross-correlation.
 */
function getTemplateStats(size, alphaMap) {
  if (templateStatsCache.has(size)) {
    return templateStatsCache.get(size);
  }

  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const r = (size / 2) * 0.95;

  const samples = [];
  let sumAlpha = 0;
  const fgPoints = [];
  const bgPoints = [];

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const a = alphaMap[y * size + x];
      samples.push({ x, y, a });
      sumAlpha += a;

      const dx = Math.abs(x - cx) / r;
      const dy = Math.abs(y - cy) / r;
      const d = Math.pow(dx, 0.67) + Math.pow(dy, 0.67);
      if (d <= 0.75) {
        fgPoints.push({ x, y, w: Math.pow(1 - d, 0.35) });
      } else if (d > 1.15 && d < 1.7) {
        bgPoints.push({ x, y });
      }
    }
  }

  const N = samples.length;
  const meanAlpha = sumAlpha / N;
  let varAlpha = 0;
  for (let i = 0; i < N; i++) {
    const diff = samples[i].a - meanAlpha;
    varAlpha += diff * diff;
  }
  const normAlpha = Math.sqrt(Math.max(1e-6, varAlpha));

  const stats = {
    size,
    cx,
    cy,
    samples,
    N,
    meanAlpha,
    normAlpha,
    fgPoints,
    bgPoints,
  };

  templateStatsCache.set(size, stats);
  return stats;
}

/**
 * Computes a local high-pass (difference of 5x5 box filter) luma buffer.
 * Eliminates background color casts, bright skies, and slow gradient step edges.
 */
function computeHighPassLuma(imageData, width, height) {
  const data = imageData.data;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const hp = new Float32Array(width * height);
  const pad = 2;
  for (let y = pad; y < height - pad; y++) {
    const row = y * width;
    for (let x = pad; x < width - pad; x++) {
      let sum = 0;
      for (let dy = -pad; dy <= pad; dy++) {
        for (let dx = -pad; dx <= pad; dx++) {
          sum += luma[(y + dy) * width + (x + dx)];
        }
      }
      hp[row + x] = luma[row + x] - sum / 25;
    }
  }
  return hp;
}

/**
 * Detect watermark position and size in an image.
 * Scans candidate regions to find the exact sparkle peak.
 */
export function detectWatermark(imageData, width, height, options = {}) {
  const preferredSize = options.logoSize || getDefaultLogoSize(width, height);
  const candidateSizes = [...new Set([preferredSize, 48, 64, 36, 96, 32, 24])].filter(
    (s) => s <= Math.min(width, height) * 0.8
  );

  const hpLuma = computeHighPassLuma(imageData, width, height);

  // Search primary corner: bottom-right
  const brResult = searchCorner(imageData, hpLuma, width, height, 'bottom-right', candidateSizes);
  if (brResult.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      detected: true,
      confidence: brResult.confidence,
      x: brResult.x,
      y: brResult.y,
      logoSize: brResult.logoSize,
      corner: 'bottom-right',
      variant: `${width}x${height}`,
    };
  }

  // Fallback: check bottom-left
  const blResult = searchCorner(imageData, hpLuma, width, height, 'bottom-left', candidateSizes);
  if (blResult.confidence > brResult.confidence && blResult.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      detected: true,
      confidence: blResult.confidence,
      x: blResult.x,
      y: blResult.y,
      logoSize: blResult.logoSize,
      corner: 'bottom-left',
      variant: `${width}x${height}`,
    };
  }

  // Fallback to highest confidence candidate if > 0.22, else standard position
  const defaultPos = getDefaultPosition(width, height, preferredSize);
  const bestResult = brResult.confidence >= blResult.confidence ? brResult : blResult;
  const bestX = bestResult.confidence >= 0.22 ? bestResult.x : defaultPos.x;
  const bestY = bestResult.confidence >= 0.22 ? bestResult.y : defaultPos.y;
  const bestSize = bestResult.confidence >= 0.22 ? bestResult.logoSize : preferredSize;

  return {
    detected: bestResult.confidence >= CONFIDENCE_THRESHOLD,
    confidence: bestResult.confidence,
    x: bestX,
    y: bestY,
    logoSize: bestSize,
    corner: 'bottom-right',
    variant: `${width}x${height}`,
  };
}

/**
 * Searches a quadrant with high-pass zero-mean correlation and coarse-to-fine refinement.
 */
function searchCorner(imageData, hpLuma, imgW, imgH, corner, candidateSizes) {
  let best = { confidence: 0, x: 0, y: 0, logoSize: candidateSizes[0] };

  // For small/cropped inputs (< 450px), search across the full image to avoid clipping
  const isSmall = imgW < 450 || imgH < 450;
  const searchMarginX = isSmall ? imgW : Math.max(380, Math.floor(imgW * 0.55));
  const searchMarginY = isSmall ? imgH : Math.max(380, Math.floor(imgH * 0.55));

  for (const size of candidateSizes) {
    const alphaMap = getAlphaMap(size);
    let minX, maxX, minY, maxY;

    if (corner === 'bottom-right') {
      minX = Math.max(0, imgW - searchMarginX);
      maxX = Math.max(0, imgW - size);
      minY = Math.max(0, imgH - searchMarginY);
      maxY = Math.max(0, imgH - size);
    } else if (corner === 'bottom-left') {
      minX = 0;
      maxX = Math.min(imgW - size, searchMarginX - size);
      minY = Math.max(0, imgH - searchMarginY);
      maxY = Math.max(0, imgH - size);
    } else {
      continue;
    }

    if (maxX < minX || maxY < minY) continue;

    // Coarse pass (stride = 2 for high speed and precision)
    let coarseBestScore = -Infinity;
    let coarseBestX = minX;
    let coarseBestY = minY;

    const coarseStep = 2;
    for (let y = minY; y <= maxY; y += coarseStep) {
      for (let x = minX; x <= maxX; x += coarseStep) {
        const score = computeCorrelation(imageData, hpLuma, imgW, imgH, x, y, size, alphaMap);
        if (score > coarseBestScore) {
          coarseBestScore = score;
          coarseBestX = x;
          coarseBestY = y;
        }
      }
    }

    if (coarseBestScore === -Infinity || coarseBestScore <= 0) continue;

    // Fine pass (stride = 1) around coarse best
    const fineRadius = coarseStep;
    const fMinX = Math.max(minX, coarseBestX - fineRadius);
    const fMaxX = Math.min(maxX, coarseBestX + fineRadius);
    const fMinY = Math.max(minY, coarseBestY - fineRadius);
    const fMaxY = Math.min(maxY, coarseBestY + fineRadius);

    let fineBestScore = coarseBestScore;
    let fineBestX = coarseBestX;
    let fineBestY = coarseBestY;

    for (let y = fMinY; y <= fMaxY; y++) {
      for (let x = fMinX; x <= fMaxX; x++) {
        const score = computeCorrelation(imageData, hpLuma, imgW, imgH, x, y, size, alphaMap);
        if (score > fineBestScore) {
          fineBestScore = score;
          fineBestX = x;
          fineBestY = y;
        }
      }
    }

    // Evaluate confidence at best location
    const conf = evaluateRegionConfidence(imageData, imgW, imgH, fineBestX, fineBestY, size, alphaMap);
    if (conf > best.confidence) {
      best = {
        confidence: conf,
        x: fineBestX,
        y: fineBestY,
        logoSize: size,
      };
    }
  }

  return best;
}

/**
 * Zero-mean Cross-Correlation of high-pass image with astroid shape.
 */
function computeCorrelation(imageData, hpLuma, imgW, imgH, rx, ry, size, alphaMap) {
  const stats = getTemplateStats(size, alphaMap);
  const { samples, N, meanAlpha } = stats;

  if (rx < 0 || rx + size > imgW || ry < 0 || ry + size > imgH) {
    return -Infinity;
  }

  let dot = 0;
  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const hpVal = hpLuma[(ry + s.y) * imgW + (rx + s.x)];
    dot += hpVal * (s.a - meanAlpha);
  }

  return dot;
}

/**
 * Detailed confidence verification at candidate peak combining astroid shape and internal contrast.
 */
function evaluateRegionConfidence(imageData, imgW, imgH, rx, ry, size, alphaMap) {
  const data = imageData.data;
  const stats = getTemplateStats(size, alphaMap);
  const { fgPoints, bgPoints, samples, N, meanAlpha, normAlpha } = stats;

  if (rx < 0 || rx + size > imgW || ry < 0 || ry + size > imgH) {
    return 0;
  }

  let sumL = 0;
  let sumL2 = 0;
  let sumProd = 0;

  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const idx = ((ry + s.y) * imgW + (rx + s.x)) * 4;
    const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

    sumL += luma;
    sumL2 += luma * luma;
    sumProd += luma * s.a;
  }

  const meanL = sumL / N;
  const varL = sumL2 - N * meanL * meanL;
  if (varL < 1.0) return 0;

  const cov = sumProd - N * meanL * meanAlpha;
  if (cov <= 0) return 0;

  const zncc = cov / (Math.sqrt(varL) * normAlpha);
  if (zncc <= 0) return 0;

  let fgSum = 0;
  for (let i = 0; i < fgPoints.length; i++) {
    const pt = fgPoints[i];
    const idx = ((ry + pt.y) * imgW + (rx + pt.x)) * 4;
    fgSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  const fgAvg = fgPoints.length > 0 ? fgSum / fgPoints.length : 0;

  let bgSum = 0;
  for (let i = 0; i < bgPoints.length; i++) {
    const pt = bgPoints[i];
    const idx = ((ry + pt.y) * imgW + (rx + pt.x)) * 4;
    bgSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  const bgAvg = bgPoints.length > 0 ? bgSum / bgPoints.length : 0;
  const contrast = fgAvg - bgAvg;

  if (contrast < 0.15) return 0;

  const contrastScore = Math.min(1.0, Math.max(0, contrast / 25.0));
  const confidence = zncc * 0.70 + contrastScore * 0.30;

  return Math.min(1.0, Math.max(0, Math.round(confidence * 100) / 100));
}

export function detectWatermarkFromCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  return detectWatermark(imageData, width, height);
}
