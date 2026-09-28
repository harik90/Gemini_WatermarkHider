/**
 * Detection engine — scans image/frame to locate the Gemini sparkle watermark.
 * Uses 2D spatial search and normalized cross-correlation with calibrated alpha maps.
 */

import { getDefaultLogoSize, getDefaultPosition, getAlphaMap } from './alpha-maps.js';

const CONFIDENCE_THRESHOLD = 0.45;

/**
 * Detect watermark position and size in an image.
 * Scans candidate corner regions (bottom-right primary) to find the exact peak.
 */
export function detectWatermark(imageData, width, height, options = {}) {
  const preferredSize = options.logoSize || getDefaultLogoSize(width, height);
  const candidateSizes = [preferredSize];
  if (preferredSize === 48) candidateSizes.push(64, 32);
  else if (preferredSize === 64) candidateSizes.push(48, 96);
  else if (preferredSize === 96) candidateSizes.push(64, 128);

  // Search primary corner: bottom-right
  const brResult = searchCorner(imageData, width, height, 'bottom-right', candidateSizes);
  if (brResult.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      detected: true,
      confidence: Math.round(brResult.confidence * 100) / 100,
      x: brResult.x,
      y: brResult.y,
      logoSize: brResult.logoSize,
      corner: 'bottom-right',
      variant: `${width}x${height}`,
    };
  }

  // Fallback: check bottom-left and top-right if bottom-right confidence is low
  const blResult = searchCorner(imageData, width, height, 'bottom-left', [preferredSize]);
  if (blResult.confidence > brResult.confidence && blResult.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      detected: true,
      confidence: Math.round(blResult.confidence * 100) / 100,
      x: blResult.x,
      y: blResult.y,
      logoSize: blResult.logoSize,
      corner: 'bottom-left',
      variant: `${width}x${height}`,
    };
  }

  // If still not confident, return best candidate from bottom-right (or default position)
  const defaultPos = getDefaultPosition(width, height, preferredSize);
  const bestX = brResult.confidence > 0.2 ? brResult.x : defaultPos.x;
  const bestY = brResult.confidence > 0.2 ? brResult.y : defaultPos.y;
  const bestSize = brResult.confidence > 0.2 ? brResult.logoSize : preferredSize;

  return {
    detected: brResult.confidence >= CONFIDENCE_THRESHOLD,
    confidence: Math.round(brResult.confidence * 100) / 100,
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

    const searchMargin = Math.min(180, Math.floor(Math.min(imgW, imgH) * 0.35));

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

    // Coarse pass (stride = 4)
    let coarseBestScore = -Infinity;
    let coarseBestX = minX;
    let coarseBestY = minY;

    const coarseStep = 4;
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
 * Fast correlation score between expected watermark alpha and luminance.
 */
function computeCorrelation(imageData, imgW, imgH, rx, ry, size, alphaMap) {
  const data = imageData.data;
  let sumProd = 0;
  let sumAlpha = 0;
  const step = 2; // Sample every 2nd pixel for speed

  for (let y = 0; y < size; y += step) {
    const py = ry + y;
    if (py < 0 || py >= imgH) continue;
    const rowOffset = py * imgW;

    for (let x = 0; x < size; x += step) {
      const alpha = alphaMap[y * size + x];
      if (alpha < 0.1) continue;

      const px = rx + x;
      if (px < 0 || px >= imgW) continue;

      const idx = (rowOffset + px) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      sumProd += alpha * luma;
      sumAlpha += alpha;
    }
  }

  return sumAlpha > 0 ? sumProd / sumAlpha : 0;
}

/**
 * Detailed confidence verification at candidate peak.
 */
function evaluateRegionConfidence(imageData, imgW, imgH, rx, ry, size, alphaMap) {
  const data = imageData.data;
  let wmBrightness = 0;
  let wmWeight = 0;
  let brightCount = 0;
  let totalCount = 0;

  for (let y = 0; y < size; y++) {
    const py = ry + y;
    if (py < 0 || py >= imgH) continue;
    const rowOffset = py * imgW;

    for (let x = 0; x < size; x++) {
      const alpha = alphaMap[y * size + x];
      if (alpha < 0.1) continue;

      const px = rx + x;
      if (px < 0 || px >= imgW) continue;

      const idx = (rowOffset + px) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      wmBrightness += luma * alpha;
      wmWeight += alpha;
      totalCount++;

      if (luma > 175) brightCount++;
    }
  }

  // Sample surrounding border as local background baseline
  let bgBrightness = 0;
  let bgCount = 0;
  const pad = Math.max(6, Math.floor(size / 6));

  for (let dy = -pad; dy < size + pad; dy++) {
    const py = ry + dy;
    if (py < 0 || py >= imgH) continue;
    const rowOffset = py * imgW;

    for (let dx = -pad; dx < size + pad; dx++) {
      // Exclude watermark center
      if (dy >= 0 && dy < size && dx >= 0 && dx < size) continue;

      const px = rx + dx;
      if (px < 0 || px >= imgW) continue;

      const idx = (rowOffset + px) * 4;
      bgBrightness += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      bgCount++;
    }
  }

  const avgWm = wmWeight > 0 ? wmBrightness / wmWeight : 0;
  const avgBg = bgCount > 0 ? bgBrightness / bgCount : 128;
  const contrast = avgWm - avgBg;

  // Signal ratio: proportion of high-alpha pixels that are brightly lit
  const brightRatio = totalCount > 0 ? brightCount / totalCount : 0;

  // Contrast score: positive delta means white was blended in
  const contrastScore = Math.min(1, Math.max(0, contrast / 50));

  // Overall confidence combines watermark brightness, contrast against surroundings, and bright ratio
  const confidence = 0.4 * contrastScore + 0.4 * (avgWm / 255) + 0.2 * brightRatio;

  return Math.min(1, Math.max(0, confidence));
}

export function detectWatermarkFromCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  return detectWatermark(imageData, width, height);
}
