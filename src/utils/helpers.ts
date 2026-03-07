export function fmtDuration(sec: number): string {
    if (!sec || sec <= 0) return '—';
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}h ${m}m`;
    }
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}m ${s}s`;
    }
    return `${sec}s`;
}
  
export function fmtDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
}
  
export function getInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}
  
export const COLORS = [
    '#00d9f5', // cyan
    '#ff4566', // red
    '#9b7dff', // purple
    '#00e09a', // green
    '#ffcc44', // yellow
    '#ff8c42', // orange
    '#4db8ff', // light blue
    '#ff6b9d'  // pink
];
  
export function getColor(index: number): string {
    return COLORS[index % COLORS.length];
}
