export function formatEventDates(start: string, end: string | null): string {
	if (!start) return '';
	const startDate = new Date(start);
	if (isNaN(startDate.getTime())) return start;

	const startFormatted = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const startTime = startDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

	if (!end) {
		return `${startFormatted} at ${startTime}`;
	}

	const endDate = new Date(end);
	if (isNaN(endDate.getTime())) return `${startFormatted} at ${startTime}`;

	const endTime = endDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

	// Check if same day
	const sameDay = startDate.toDateString() === endDate.toDateString();
	if (sameDay) {
		return `${startFormatted} at ${startTime} – ${endTime}`;
	}

	const endFormatted = endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	return `${startFormatted} at ${startTime} – ${endFormatted} at ${endTime}`;
}

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
