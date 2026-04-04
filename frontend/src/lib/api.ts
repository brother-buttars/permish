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
	changePassword: (data: { currentPassword: string; newPassword: string }) =>
		apiFetch('/api/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
	forgotPassword: (email: string) =>
		apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
	resetPassword: (token: string, newPassword: string) =>
		apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
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

	// Admin
	adminGetStats: () => apiFetch('/api/admin/stats'),
	adminListUsers: () => apiFetch('/api/admin/users'),
	adminGetUser: (id: string) => apiFetch(`/api/admin/users/${id}`),
	adminCreateUser: (data: any) => apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
	adminUpdateRole: (id: string, role: string) => apiFetch(`/api/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
	adminResetPassword: (id: string, newPassword: string) => apiFetch(`/api/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) }),
	adminDeleteUser: (id: string) => apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' }),

	// Attachments
	getAttachments: (eventId: string) => apiFetch(`/api/events/${eventId}/attachments`),
	uploadAttachment: async (eventId: string, file: File) => {
		const formData = new FormData();
		formData.append('file', file);
		const res = await fetch(`${API_URL}/api/events/${eventId}/attachments`, {
			method: 'POST',
			credentials: 'include',
			body: formData,
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: res.statusText }));
			throw new Error(body.error || res.statusText);
		}
		return res.json();
	},
	deleteAttachment: (eventId: string, attachmentId: string) =>
		apiFetch(`/api/events/${eventId}/attachments/${attachmentId}`, { method: 'DELETE' }),
	getAttachmentUrl: (eventId: string, attachmentId: string) =>
		`${API_URL}/api/events/${eventId}/attachments/${attachmentId}`,
};
