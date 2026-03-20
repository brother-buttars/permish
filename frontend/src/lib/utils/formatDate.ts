export function formatDate(dateStr: string, includeTime = false): string {
	if (!dateStr) return '';
	// SQLite datetimes come as "2026-03-20 18:29:35", need T for JS Date parsing
	const normalized = dateStr.replace(' ', 'T');
	const d = new Date(normalized);
	if (isNaN(d.getTime())) return dateStr;

	const hasTime = dateStr.includes(':');
	const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

	if ((includeTime || hasTime) && dateStr.length > 10) {
		const timePart = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
		return `${datePart} at ${timePart}`;
	}

	return datePart;
}
