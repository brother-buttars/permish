/**
 * Converts plain text with URLs into HTML with clickable links.
 * Preserves newlines as <br> tags.
 */
export function linkify(text: string): string {
	if (!text) return '';
	// Escape HTML first
	const escaped = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	// Replace URLs with anchor tags
	const linked = escaped.replace(
		/https?:\/\/[^\s<>)"']+/g,
		(url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline">${url}</a>`
	);
	// Convert newlines to <br>
	return linked.replace(/\n/g, '<br>');
}
