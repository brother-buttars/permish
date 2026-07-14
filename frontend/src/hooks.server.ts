import type { Handle } from '@sveltejs/kit';

// Auth is handled directly by the Permish HTTP server (Bun + Hono), which sets
// its own HttpOnly cookie; the browser talks to it directly. SvelteKit no longer
// proxies auth, so this is a plain passthrough.
export const handle: Handle = async ({ event, resolve }) => resolve(event);
