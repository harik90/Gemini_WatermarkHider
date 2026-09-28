/**
 * Web Worker for off-main-thread image processing.
 * Implements safety clamp, 5x5 sanity check, feathering, and inpaint fallback.
 */

const MAX_ALPHA_CAP = 0.38;

function fourPointStarAlpha(x, y, cx, cy, size) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const maxR = (size / 2) * 0.95;

  if (dx === 0 && dy === 0) return MAX_ALPHA_CAP;

  const p = 0.68;
  const d = Math.pow(dx / maxR, p) + Math.pow(dy / maxR, p);
  if (d > 1.0) return 0;

  const rawAlpha = Math.pow(1.0 - d, 0.4) * 0.82;
  return Math.min(MAX_ALPHA_CAP, Math.max(0, rawAlpha));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

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

function buildBoundaryModel(data, imgW, imgH, x0, y0, w, h) {
  const top = [];
  const bottom = [];
  const left = [];
  const right = [];

  const yTop = Math.max(0, y0 - 2);
  const yBtm = Math.min(imgH - 1, y0 + h + 1);

  for (let x = 0; x < w; x++) {
    const px = Math.min(imgW - 1, Math.max(0, x0 + x));
    const tIdx = (yTop * imgW + px) * 4;
    const bIdx = (yBtm * imgW + px) * 4;
    top.push([data[tIdx], data[tIdx + 1], data[tIdx + 2]]);
    bottom.push([data[bIdx], data[bIdx + 1], data[bIdx + 2]]);
  }

  const xLft = Math.max(0, x0 - 2);
  const xRgt = Math.min(imgW - 1, x0 + w + 1);

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

  const hPct = (relX + 1) / (w + 1);
  const vPct = (relY + 1) / (h + 1);

  const tVal = top[relX] ? top[relX][channel] : 128;
  const bVal = bottom[relX] ? bottom[relX][channel] : 128;
  const lVal = left[relY] ? left[relY][channel] : 128;
  const rVal = right[relY] ? right[relY][channel] : 128;

  const vInterp = tVal * (1 - vPct) + bVal * vPct;
  const hInterp = lVal * (1 - hPct) + rVal * hPct;

  return (vInterp + hInterp) / 2;
}

self.onmessage = function (e) {
  const { id, dataBuffer, width, height, options = {} } = e.data;
  const data = new Uint8ClampedArray(dataBuffer);

  try {
    const logoSize = options.logoSize || (Math.max(width, height) >= 2048 ? 96 : Math.max(width, height) >= 1920 ? 64 : 48);
    const rx = options.x !== undefined ? Math.round(options.x) : width - logoSize - Math.max(8, Math.floor(logoSize / 6));
    const ry = options.y !== undefined ? Math.round(options.y) : height - logoSize - Math.max(8, Math.floor(logoSize / 6));

    const cx = rx + logoSize / 2;
    const cy = ry + logoSize / 2;
    const maxRadius = logoSize / 2;

    const boundary = buildBoundaryModel(data, width, height, rx, ry, logoSize, logoSize);

    for (let dy = 0; dy < logoSize; dy++) {
      const py = ry + dy;
      if (py < 0 || py >= height) continue;
      const rowOffset = py * width;

      for (let dx = 0; dx < logoSize; dx++) {
        const px = rx + dx;
        if (px < 0 || px >= width) continue;

        const alpha = fourPointStarAlpha(px, py, cx, cy, logoSize);
        if (alpha <= 0.005) continue;

        const dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
        const normDist = dist / maxRadius;

        const feather = 1.0 - smoothstep(0.65, 1.0, normDist);
        if (feather <= 0.001) continue;

        const idx = (rowOffset + px) * 4;
        const oneMinusA = 1 - alpha;

        for (let c = 0; c < 3; c++) {
          const watermarked = data[idx + c];
          const inpaintVal = getInpaintValue(boundary, dx, dy, c);

          const alpha255 = alpha * 255;
          const computedOriginal = (watermarked - alpha255) / oneMinusA;

          const localAvg = sample5x5Avg(data, width, height, px, py, c);

          let corrected;
          if (computedOriginal < 0 || (localAvg - computedOriginal) > 40) {
            corrected = inpaintVal;
          } else {
            const blendWeight = 0.5;
            corrected = computedOriginal * (1 - blendWeight) + inpaintVal * blendWeight;
          }

          const finalVal = watermarked + (corrected - watermarked) * feather;
          data[idx + c] = clamp(finalVal);
        }
      }
    }

    self.postMessage(
      { id, success: true, width, height, dataBuffer },
      [dataBuffer]
    );
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message });
  }
};
