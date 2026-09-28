/**
 * Batch ZIP export utility.
 */

import JSZip from 'jszip';

export async function createZipFromFiles(files, onProgress) {
  const zip = new JSZip();
  let added = 0;

  for (const file of files) {
    if (!file.blob) continue;
    const ext = getExtension(file.name, file.blob.type);
    const name = cleanFileName(file.name, ext);
    zip.file(name, file.blob);
    added++;
    onProgress?.({ added, total: files.length });
  }

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      onProgress?.({ added, total: files.length, zipPercent: Math.round(meta.percent) });
    }
  );

  return blob;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getExtension(fileName, mimeType = '') {
  const ext = fileName.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'].includes(ext)) return ext;
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'png';
}

function cleanFileName(name, newExt) {
  const parts = name.split('.');
  if (parts.length > 1) parts.pop();
  return `${parts.join('.')}_clean.${newExt}`;
}
