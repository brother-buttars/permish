import type { Handle } from '@sveltejs/kit';

const BACKEND = process.env.PUBLIC_BACKEND || 'express';

// Only activate PocketBase auth proxy when backend is pocketbase
const pbHandle: Handle = async ({ event, resolve }) => {
  const { default: PocketBase } = await import('pocketbase');
  const PB_URL = process.env.PUBLIC_PB_URL || 'http://localhost:8090';

  // Create a PocketBase instance per request
  const pb = new PocketBase(PB_URL);

  // Load auth from HttpOnly cookie
  const cookie = event.cookies.get('pb_auth');
  if (cookie) {
    try {
      const { token, record } = JSON.parse(cookie);
      pb.authStore.save(token, record);

      // Refresh token if still valid
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh();
        } catch {
          // Token expired or invalid, clear it
          pb.authStore.clear();
        }
      }
    } catch {
      // Invalid cookie data
      pb.authStore.clear();
    }
  }

  // Make available to server routes and load functions
  event.locals.pb = pb;
  event.locals.user = pb.authStore.isValid ? pb.authStore.record : null;

  const response = await resolve(event);

  // Sync auth state back to cookie after response
  if (pb.authStore.isValid) {
    event.cookies.set('pb_auth', JSON.stringify({
      token: pb.authStore.token,
      record: pb.authStore.record,
    }), {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: event.url.protocol === 'https:',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  } else if (cookie) {
    // Auth was cleared during this request (logout)
    event.cookies.delete('pb_auth', { path: '/' });
  }

  return response;
};

// No-op passthrough for Express backend
const passthroughHandle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};

export const handle: Handle = BACKEND === 'pocketbase' ? pbHandle : passthroughHandle;
