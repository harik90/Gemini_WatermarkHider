/**
 * Pre-calibrated alpha maps for known Gemini-family watermarks.
 * Each variant stores the position, size, and per-pixel alpha values
 * for the sparkle watermark at specific output resolutions.
 *
 * The Gemini sparkle is a 4-point star composited at fixed positions.
 * Alpha values range 0–1 where 1 = fully opaque watermark, 0 = no watermark.
 */

// Generate a sparkle alpha map procedurally — matches the Gemini 4-point star astroid
function generateSparkleAlpha(size) {
  const map = new Float32Array(size * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = size * 0.46;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      if (dx === 0 && dy === 0) {
        map[y * size + x] = 0.84;
        continue;
      }

      // Astroid / hypocycloid curve: (x/a)^(2/3) + (y/b)^(2/3) <= 1
      const p = 0.68;
      const d = Math.pow(dx / maxR, p) + Math.pow(dy / maxR, p);

      if (d <= 1.0) {
        // Falloff from center to edge of astroid
        const falloff = Math.pow(1.0 - Math.min(1.0, d), 0.4);
        map[y * size + x] = Math.min(0.85, Math.max(0, falloff * 0.84));
      }
    }
  }
  return map;
}


// Add a gaussian blur pass for softer edges (matching real watermark anti-aliasing)
function blurAlphaMap(map, size, radius) {
  const temp = new Float32Array(map.length);
  const kernel = [];
  let sum = 0;

  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * (radius / 2) * (radius / 2)));
    kernel.push(w);
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  // Horizontal pass
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(size - 1, Math.max(0, x + k));
        val += map[y * size + sx] * kernel[k + radius];
      }
      temp[y * size + x] = val;
    }
  }

  // Vertical pass
  const result = new Float32Array(map.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(size - 1, Math.max(0, y + k));
        val += temp[sy * size + x] * kernel[k + radius];
      }
      result[y * size + x] = val;
    }
  }
  return result;
}

// Known watermark variants for Gemini output resolutions
const WATERMARK_VARIANTS = {
  // Standard Gemini image outputs
  'gemini-1024': {
    name: 'Gemini 1024×1024',
    logoSize: 48,
    positions: [
      { x: 976 - 48, y: 1024 - 48 - 8, label: 'Bottom-right' },
    ],
    outputWidth: 1024,
    outputHeight: 1024,
  },
  'gemini-1536': {
    name: 'Gemini 1536×1024',
    logoSize: 48,
    positions: [
      { x: 1536 - 48 - 8, y: 1024 - 48 - 8, label: 'Bottom-right' },
    ],
    outputWidth: 1536,
    outputHeight: 1024,
  },
  'gemini-1024x1536': {
    name: 'Gemini 1024×1536',
    logoSize: 48,
    positions: [
      { x: 1024 - 48 - 8, y: 1536 - 48 - 8, label: 'Bottom-right' },
    ],
    outputWidth: 1024,
    outputHeight: 1536,
  },
  // Veo / video outputs
  'veo-1920': {
    name: 'Veo 1920×1080',
    logoSize: 64,
    positions: [
      { x: 1920 - 64 - 12, y: 1080 - 64 - 12, label: 'Bottom-right' },
    ],
    outputWidth: 1920,
    outputHeight: 1080,
  },
  'veo-1280': {
    name: 'Veo 1280×720',
    logoSize: 48,
    positions: [
      { x: 1280 - 48 - 8, y: 720 - 48 - 8, label: 'Bottom-right' },
    ],
    outputWidth: 1280,
    outputHeight: 720,
  },
  // High-res Imagen / Nano Banana
  'imagen-2048': {
    name: 'Imagen 2048×2048',
    logoSize: 96,
    positions: [
      { x: 2048 - 96 - 16, y: 2048 - 96 - 16, label: 'Bottom-right' },
    ],
    outputWidth: 2048,
    outputHeight: 2048,
  },
};

// Cache generated alpha maps
const alphaMapCache = new Map();

export function getAlphaMap(logoSize) {
  if (alphaMapCache.has(logoSize)) return alphaMapCache.get(logoSize);

  const raw = generateSparkleAlpha(logoSize);
  const blurred = blurAlphaMap(raw, logoSize, Math.max(2, Math.floor(logoSize / 16)));
  alphaMapCache.set(logoSize, blurred);
  return blurred;
}

export function getVariants() {
  return WATERMARK_VARIANTS;
}

export function findVariantForDimensions(width, height) {
  const entries = Object.entries(WATERMARK_VARIANTS);
  for (const [key, variant] of entries) {
    if (variant.outputWidth === width && variant.outputHeight === height) {
      return { key, ...variant };
    }
  }
  // Fallback: try closest match by aspect ratio and size
  let best = null;
  let bestDiff = Infinity;
  for (const [key, variant] of entries) {
    const diff = Math.abs(variant.outputWidth - width) + Math.abs(variant.outputHeight - height);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { key, ...variant };
    }
  }
  return best;
}

export function getDefaultLogoSize(width, height) {
  const maxDim = Math.max(width, height);
  if (maxDim >= 2048) return 96;
  if (maxDim >= 1920) return 64;
  return 48;
}

export function getDefaultPosition(width, height, logoSize) {
  const margin = Math.max(8, Math.floor(logoSize / 6));
  return {
    x: width - logoSize - margin,
    y: height - logoSize - margin,
  };
}
