import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  locals.pb.authStore.clear();
  cookies.delete('pb_auth', { path: '/' });
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
