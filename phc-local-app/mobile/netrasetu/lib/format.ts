export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${formatTime(iso)}`;
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Age in whole years from DD/MM/YYYY, or null. */
export function ageFromDob(dob: string): number | null {
  const [d, m, y] = dob.split('/').map(Number);
  if (!y || y < 1900) return null;
  const birth = new Date(y, (m || 1) - 1, d || 1);
  const years = Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return years > 0 && years < 120 ? years : null;
}

/** 0.873 -> "87%", null -> "N/A" (never a made-up number, design doc §4.1). */
export function pct(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : `${Math.round(v * 100)}%`;
}

/** Short display form of a local ID: the middle (timestamp) segment. */
export function shortId(id: string): string {
  const parts = id.split('-');
  return parts.length === 3 ? parts[1].toUpperCase() : id;
}
