export function formatDate(dateStr: string): string {
	if (!dateStr) return '';
	const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
	if (isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
