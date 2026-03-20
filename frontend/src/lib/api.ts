const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch(path: string, options: RequestInit = {}) {
	const { headers: customHeaders, ...restOptions } = options;
	const res = await fetch(`${API_URL}${path}`, {
		credentials: 'include',
		...restOptions,
		headers: { 'Content-Type': 'application/json', ...customHeaders },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(body.error || res.statusText);
	}
	return res.json();
}

export const api = {
	register: (data: any) =>
		apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
	login: (data: any) =>
		apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
	logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
	me: () => apiFetch('/api/auth/me'),
	getUserProfile: () => apiFetch('/api/auth/profile'),
	updateUserProfile: (data: any) => apiFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
	createEvent: (data: any) =>
		apiFetch('/api/events', { method: 'POST', body: JSON.stringify(data) }),
	listEvents: (opts?: { all?: boolean }) => apiFetch(`/api/events${opts?.all ? '?all=1' : ''}`),
	getEvent: (id: string) => apiFetch(`/api/events/${id}`),
	updateEvent: (id: string, data: any) =>
		apiFetch(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
	deleteEvent: (id: string) => apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
	getSubmissions: (eventId: string) => apiFetch(`/api/events/${eventId}/submissions`),
	getAllSubmissions: () => apiFetch('/api/events/all-submissions'),
	listProfiles: () => apiFetch('/api/profiles'),
	createProfile: (data: any) =>
		apiFetch('/api/profiles', { method: 'POST', body: JSON.stringify(data) }),
	updateProfile: (id: string, data: any) =>
		apiFetch(`/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
	deleteProfile: (id: string) => apiFetch(`/api/profiles/${id}`, { method: 'DELETE' }),
	getFormEvent: (id: string) => apiFetch(`/api/events/${id}/form`),
	submitForm: (eventId: string, data: any) =>
		apiFetch(`/api/events/${eventId}/submit`, { method: 'POST', body: JSON.stringify(data) }),
	getMySubmissions: () => apiFetch('/api/submissions/mine'),
	getSubmission: (id: string) => apiFetch(`/api/submissions/${id}`),
	updateSubmission: (id: string, data: any) =>
		apiFetch(`/api/submissions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
	deleteSubmission: (id: string) => apiFetch(`/api/submissions/${id}`, { method: 'DELETE' }),
	getPdfUrl: (submissionId: string) => `${API_URL}/api/submissions/${submissionId}/pdf`,
};
