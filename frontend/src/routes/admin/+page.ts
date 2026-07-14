import { redirect } from '@sveltejs/kit';

// Admin is reserved for user management. The old "Overview" duplicated the main
// Dashboard, so /admin now lands on Users (preserving any group/activity scope).
export function load({ url }) {
	redirect(307, '/admin/users' + url.search);
}
