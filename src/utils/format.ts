export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days}d left`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
