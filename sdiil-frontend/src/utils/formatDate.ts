/**
 * Formats an ISO date string into Indian Standard or UTC readable format
 */
export function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats a short date DD/MM/YYYY
 */
export function formatShortDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Returns human-readable relative time (e.g., '10 minutes ago', 'in 2 hours')
 */
export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const target = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = target - now;
    const isFuture = diffMs > 0;
    const absDiffSec = Math.floor(Math.abs(diffMs) / 1000);

    if (absDiffSec < 60) return isFuture ? 'in moments' : 'just now';
    const mins = Math.floor(absDiffSec / 60);
    if (mins < 60) return isFuture ? `in ${mins}m` : `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return isFuture ? `in ${hours}h` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return isFuture ? `in ${days}d` : `${days}d ago`;
  } catch {
    return isoString;
  }
}

/**
 * Returns formatted file size
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
