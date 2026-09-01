/**
 * Formats a Date object according to a format string.
 * Supports: YYYY, MM, DD, HH, mm, ss.
 */
export function formatDate(date: Date, formatStr = 'YYYY-MM-DD'): string {
  const pad = (n: number) => String(n).padStart(2, '0');

  const year = String(date.getFullYear());
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return formatStr
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}

/**
 * Returns a human-readable relative time string (e.g. "Just now", "5m ago", "2h ago", "Yesterday", "Oct 12").
 */
export function getRelativeTimeString(timestamp: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 45) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days}d ago`;
  }

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Returns today's formatted date string.
 */
export function getTodayDateString(formatStr = 'YYYY-MM-DD'): string {
  return formatDate(new Date(), formatStr);
}
