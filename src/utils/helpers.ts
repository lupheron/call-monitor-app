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
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }).format(date);
}
  
export function getInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}
  
export const COLORS = [
    '#00d9f5',
    '#ff4566',
    '#9b7dff',
    '#00e09a',
    '#ffcc44',
    '#ff8c42',
    '#4db8ff',
    '#ff6b9d'
];
  
export function getColor(index: number): string {
    return COLORS[index % COLORS.length];
}

/** Display name with extension when duplicate names exist across users */
export function getDisplayName(user: { name: string; extensionNumber?: string; phoneNumbers?: { phoneNumber: string }[] }, allUsers: { name: string }[]): string {
  const hasDuplicates = allUsers.filter(u => u.name === user.name).length > 1;
  if (!hasDuplicates) return user.name;
  const ext = user.extensionNumber;
  const directNum = user.phoneNumbers?.find((p: any) => p.usageType === 'DirectNumber')?.phoneNumber;
  const suffix = ext ? `Ext ${ext}` : directNum ? directNum.replace(/\D/g, '').slice(-4) : null;
  return suffix ? `${user.name} (${suffix})` : user.name;
}
