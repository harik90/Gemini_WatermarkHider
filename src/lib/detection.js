/**
 * Detection engine — scans image/frame to locate the Gemini sparkle watermark.
 * Uses contrast-aware shape matching and Zero-mean Normalized Cross-Correlation (ZNCC)
 * with pre-calibrated astroid alpha maps to ensure bright skies and clouds are never
 * mistaken for watermarks.
 */

import { getDefaultLogoSize, getDefaultPosition, getAlphaMap } from './alpha-maps.js';

const CONFIDENCE_THRESHOLD = 0.40;
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

  const samples = [];
  let sumAlpha = 0;
  const fgPoints = [];
  const bgPoints = [];

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const a = alphaMap[y * size + x];
      samples.push({ x, y, a });
      sumAlpha += a;

      if (a > 0.35) {
        fgPoints.push({ x, y });
      } else if (a < 0.05) {
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
 * Detect watermark position and size in an image.
 * Scans candidate corner regions (bottom-right primary) to find the exact peak.
 */
export function detectWatermark(imageData, width, height, options = {}) {
  const preferredSize = options.logoSize || getDefaultLogoSize(width, height);
  const candidateSizes = [...new Set([preferredSize, 48, 64, 36, 96, 32])].filter(
    (s) => s < Math.min(width, height) * 0.4
  );

  // Search primary corner: bottom-right
  const brResult = searchCorner(imageData, width, height, 'bottom-right', candidateSizes);
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

  // Fallback: check bottom-left and top-right if bottom-right confidence is low
  const blResult = searchCorner(imageData, width, height, 'bottom-left', candidateSizes);
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

  // If still not confident, return best candidate from bottom-right (or default position)
  const defaultPos = getDefaultPosition(width, height, preferredSize);
  const bestX = brResult.confidence > 0.35 ? brResult.x : defaultPos.x;
  const bestY = brResult.confidence > 0.35 ? brResult.y : defaultPos.y;
  const bestSize = brResult.confidence > 0.35 ? brResult.logoSize : preferredSize;

  return {
    detected: brResult.confidence >= CONFIDENCE_THRESHOLD,
    confidence: brResult.confidence,
    x: bestX,
    y: bestY,
    logoSize: bestSize,
    corner: 'bottom-right',
    variant: `${width}x${height}`,
  };
}

/**
 * Searches a corner quadrant with a 2-pass coarse-to-fine search.
 */
function searchCorner(imageData, imgW, imgH, corner, candidateSizes) {
  let best = { confidence: 0, x: 0, y: 0, logoSize: candidateSizes[0] };

  for (const size of candidateSizes) {
    const alphaMap = getAlphaMap(size);
    let minX, maxX, minY, maxY;

    const searchMargin = Math.min(320, Math.floor(Math.min(imgW, imgH) * 0.45));

    if (corner === 'bottom-right') {
      minX = Math.max(0, imgW - searchMargin);
      maxX = Math.max(0, imgW - size - 4);
      minY = Math.max(0, imgH - searchMargin);
      maxY = Math.max(0, imgH - size - 4);
    } else if (corner === 'bottom-left') {
      minX = 4;
      maxX = Math.min(imgW - size, searchMargin - size);
      minY = Math.max(0, imgH - searchMargin);
      maxY = Math.max(0, imgH - size - 4);
    } else {
      continue;
    }

    if (maxX <= minX || maxY <= minY) continue;

    // Coarse pass (stride = 3 for fine precision)
    let coarseBestScore = -Infinity;
    let coarseBestX = minX;
    let coarseBestY = minY;

    const coarseStep = 3;
    for (let y = minY; y <= maxY; y += coarseStep) {
      for (let x = minX; x <= maxX; x += coarseStep) {
        const score = computeCorrelation(imageData, imgW, imgH, x, y, size, alphaMap);
        if (score > coarseBestScore) {
          coarseBestScore = score;
          coarseBestX = x;
          coarseBestY = y;
        }
      }
    }

    if (coarseBestScore === -Infinity) continue;

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
        const score = computeCorrelation(imageData, imgW, imgH, x, y, size, alphaMap);
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
 * Shape cross-correlation and contrast evaluation.
 * Returns -Infinity if candidate is flat sky, cloud gradient, or darker than background.
 */
function computeCorrelation(imageData, imgW, imgH, rx, ry, size, alphaMap) {
  const data = imageData.data;
  const stats = getTemplateStats(size, alphaMap);
  const { cx, cy, fgPoints, bgPoints, samples, N, meanAlpha, normAlpha } = stats;

  if (rx < 0 || rx + size > imgW || ry < 0 || ry + size > imgH) {
    return -Infinity;
  }

  // Quick rejection 1: Sparkle center MUST be brighter than the 4 corners of candidate box
  const centerIdx = ((ry + cy) * imgW + (rx + cx)) * 4;
  const centerLuma = 0.299 * data[centerIdx] + 0.587 * data[centerIdx + 1] + 0.114 * data[centerIdx + 2];

  const c1Idx = (ry * imgW + rx) * 4;
  const c2Idx = (ry * imgW + (rx + size - 1)) * 4;
  const c3Idx = ((ry + size - 1) * imgW + rx) * 4;
  const c4Idx = ((ry + size - 1) * imgW + (rx + size - 1)) * 4;
  const cornerAvg = (
    (0.299 * data[c1Idx] + 0.587 * data[c1Idx + 1] + 0.114 * data[c1Idx + 2]) +
    (0.299 * data[c2Idx] + 0.587 * data[c2Idx + 1] + 0.114 * data[c2Idx + 2]) +
    (0.299 * data[c3Idx] + 0.587 * data[c3Idx + 1] + 0.114 * data[c3Idx + 2]) +
    (0.299 * data[c4Idx] + 0.587 * data[c4Idx + 1] + 0.114 * data[c4Idx + 2])
  ) * 0.25;

  if (centerLuma < cornerAvg + 0.5) {
    return -Infinity;
  }

  // Quick rejection 2: Contrast between high-alpha core and border background
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
  const bgAvg = bgPoints.length > 0 ? bgSum / bgPoints.length : cornerAvg;

  const contrast = fgAvg - bgAvg;
  if (contrast <= 0.8) {
    return -Infinity;
  }

  // Zero-mean Normalized Cross-Correlation (ZNCC) with star shape
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
  if (varL < 2.0) {
    return -Infinity;
  }

  const cov = sumProd - N * meanL * meanAlpha;
  if (cov <= 0) {
    return -Infinity;
  }

  const zncc = cov / (Math.sqrt(varL) * normAlpha);
  if (zncc <= 0.12) {
    return -Infinity;
  }

  return zncc * Math.log(1 + contrast);
}

/**
 * Detailed confidence verification at candidate peak.
 */
function evaluateRegionConfidence(imageData, imgW, imgH, rx, ry, size, alphaMap) {
  const data = imageData.data;
  const stats = getTemplateStats(size, alphaMap);
  const { cx, cy, samples, N, meanAlpha, normAlpha } = stats;

  if (rx < 0 || rx + size > imgW || ry < 0 || ry + size > imgH) {
    return 0;
  }

  // 1. Compute ZNCC
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
  if (varL < 2.0) return 0;

  const cov = sumProd - N * meanL * meanAlpha;
  if (cov <= 0) return 0;

  const zncc = cov / (Math.sqrt(varL) * normAlpha);
  if (zncc <= 0) return 0;

  // 2. Compute local background contrast outside the box
  let bgLuma = 0;
  let bgCount = 0;
  const pad = Math.max(6, Math.floor(size / 6));

  for (let dy = -pad; dy < size + pad; dy += 2) {
    const py = ry + dy;
    if (py < 0 || py >= imgH) continue;
    const rowOffset = py * imgW;

    for (let dx = -pad; dx < size + pad; dx += 2) {
      if (dy >= 0 && dy < size && dx >= 0 && dx < size) continue;
      const px = rx + dx;
      if (px < 0 || px >= imgW) continue;

      const idx = (rowOffset + px) * 4;
      bgLuma += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      bgCount++;
    }
  }

  const avgBg = bgCount > 0 ? bgLuma / bgCount : 128;

  // Center watermark brightness
  const centerIdx = ((ry + cy) * imgW + (rx + cx)) * 4;
  const centerLuma = 0.299 * data[centerIdx] + 0.587 * data[centerIdx + 1] + 0.114 * data[centerIdx + 2];
  const contrast = centerLuma - avgBg;

  if (contrast < 0.5) return 0;

  // Confidence combines shape correlation (ZNCC) and normalized contrast
  const contrastScore = Math.min(1.0, Math.max(0, contrast / 35.0));
  const confidence = zncc * 0.65 + contrastScore * 0.35;

  return Math.min(1.0, Math.max(0, Math.round(confidence * 100) / 100));
}

export function detectWatermarkFromCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  return detectWatermark(imageData, width, height);
}

