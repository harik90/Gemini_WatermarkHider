/**
 * Web Worker for off-main-thread image processing.
 * High-Fidelity Boundary-Propagated PDE Laplace Inpainter.
 */

self.onmessage = function (e) {
  const { id, dataBuffer, width, height, options = {} } = e.data;
  const data = new Uint8ClampedArray(dataBuffer);

  try {
    const logoSize = options.logoSize || (Math.max(width, height) >= 2048 ? 96 : Math.max(width, height) >= 1920 ? 64 : 48);
    const rx = options.x !== undefined ? Math.round(options.x) : width - logoSize - Math.max(8, Math.floor(logoSize / 6));
    const ry = options.y !== undefined ? Math.round(options.y) : height - logoSize - Math.max(8, Math.floor(logoSize / 6));

    const cx = rx + logoSize / 2;
    const cy = ry + logoSize / 2;
    const radius = (logoSize / 2) * 0.95;

    const pad = Math.max(6, Math.round(logoSize * 0.16));
    const minX = Math.max(1, Math.round(cx - radius - pad));
    const maxX = Math.min(width - 2, Math.round(cx + radius + pad));
    const minY = Math.max(1, Math.round(cy - radius - pad));
    const maxY = Math.min(height - 2, Math.round(cy + radius + pad));

    const pw = maxX - minX + 1;
    const ph = maxY - minY + 1;

    if (pw > 4 && ph > 4) {
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
                  if (nx >= 0 && nx < pw) dilMask[ny * pw + nx] = 1;
                }
              }
            }
          }
        }
      }

      const maskedPixels = [];
      const boundaryPixels = [];
      for (let y = 1; y < ph - 1; y++) {
        for (let x = 1; x < pw - 1; x++) {
          const idx = y * pw + x;
          if (dilMask[idx] === 1) {
            maskedPixels.push({ x, y, idx, imgIdx: ((minY + y) * width + (minX + x)) * 4 });
          } else if (
            dilMask[idx - 1] === 1 || dilMask[idx + 1] === 1 ||
            dilMask[idx - pw] === 1 || dilMask[idx + pw] === 1
          ) {
            boundaryPixels.push({ x, y, imgIdx: ((minY + y) * width + (minX + x)) * 4 });
          }
        }
      }

      if (maskedPixels.length > 0 && boundaryPixels.length > 0) {
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

        const numBound = boundaryPixels.length;
        const step = Math.max(1, Math.floor(numBound / 32));
        const sampledBound = [];
        for (let i = 0; i < numBound; i += step) {
          sampledBound.push(boundaryPixels[i]);
        }

        for (let i = 0; i < maskedPixels.length; i++) {
          const mp = maskedPixels[i];
          let totalW = 0, rSum = 0, gSum = 0, bSum = 0;
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

        const omega = 1.45;
        for (let it = 0; it < 35; it++) {
          for (let i = 0; i < maskedPixels.length; i++) {
            const idx = maskedPixels[i].idx;
            const up = idx - pw, dn = idx + pw, lf = idx - 1, rt = idx + 1;
            patchR[idx] += omega * (0.25 * (patchR[up] + patchR[dn] + patchR[lf] + patchR[rt]) - patchR[idx]);
            patchG[idx] += omega * (0.25 * (patchG[up] + patchG[dn] + patchG[lf] + patchG[rt]) - patchG[idx]);
            patchB[idx] += omega * (0.25 * (patchB[up] + patchB[dn] + patchB[lf] + patchB[rt]) - patchB[idx]);
          }
        }

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

        for (let i = 0; i < maskedPixels.length; i++) {
          const mp = maskedPixels[i];
          const pIdx = mp.imgIdx;
          const idx = mp.idx;
          const nR = fastRand() * grainR;
          const nG = fastRand() * grainG;
          const nB = fastRand() * grainB;

          data[pIdx] = Math.max(0, Math.min(255, Math.round(patchR[idx] + nR)));
          data[pIdx + 1] = Math.max(0, Math.min(255, Math.round(patchG[idx] + nG)));
          data[pIdx + 2] = Math.max(0, Math.min(255, Math.round(patchB[idx] + nB)));
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
