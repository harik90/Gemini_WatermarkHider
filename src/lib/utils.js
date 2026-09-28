export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const ALL_ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES];

export function isImage(file) {
  if (!file) return false;
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return true;
  const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
  return ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
}

export function isVideo(file) {
  if (!file) return false;
  if (ACCEPTED_VIDEO_TYPES.includes(file.type)) return true;
  const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
  return ['mp4', 'webm', 'mov'].includes(ext);
}

export function isZip(file) {
  if (!file) return false;
  if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return true;
  const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
  return ext === 'zip';
}

export function isAccepted(file) {
  return isImage(file) || isVideo(file) || isZip(file);
}

export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getAcceptString() {
  return [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES, '.mov', '.zip'].join(',');
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

