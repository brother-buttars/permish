function hasTime(dtStr: string): boolean {
	// A datetime string like "2026-06-15T09:00" has time; a date-only "2026-06-15" does not
	return dtStr.includes('T') && dtStr.split('T')[1] !== '';
}

function formatDtPart(dt: Date, includeTime: boolean): string {
	const datePart = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
	if (!includeTime) return datePart;
	const timePart = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
	return `${datePart} at ${timePart}`;
}

export function formatEventDates(start: string, end: string | null): string {
	if (!start) return '';
	const startDate = new Date(start);
	if (isNaN(startDate.getTime())) return start;

	const startHasTime = hasTime(start);
	const startFormatted = formatDtPart(startDate, startHasTime);

	if (!end) {
		return startFormatted;
	}

	const endDate = new Date(end);
	if (isNaN(endDate.getTime())) return startFormatted;

	const endHasTime = hasTime(end);
	const sameDay = startDate.toDateString() === endDate.toDateString();

	if (sameDay) {
		if (startHasTime && endHasTime) {
			const endTime = endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
			return `${startFormatted} – ${endTime}`;
		}
		if (startHasTime) return startFormatted;
		if (endHasTime) return formatDtPart(startDate, false) + ' until ' + endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
		return formatDtPart(startDate, false);
	}

	const endFormatted = formatDtPart(endDate, endHasTime);
	return `${startFormatted} – ${endFormatted}`;
}

export function formatDate(dateStr: string, includeTime = false): string {
	if (!dateStr) return '';
	// SQLite datetimes come as "2026-03-20 18:29:35", need T for JS Date parsing
	const normalized = dateStr.replace(' ', 'T');
	const d = new Date(normalized);
	if (isNaN(d.getTime())) return dateStr;

	const hasTime = dateStr.includes(':');
	const datePart = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

	if ((includeTime || hasTime) && dateStr.length > 10) {
		const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
		return `${datePart} at ${timePart}`;
	}

	return datePart;
}
