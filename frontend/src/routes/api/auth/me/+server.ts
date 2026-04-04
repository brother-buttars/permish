import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    user: {
      id: locals.user.id,
      email: locals.user.email,
      name: locals.user.name,
      role: locals.user.role,
      phone: locals.user.phone || undefined,
      address: locals.user.address || undefined,
      city: locals.user.city || undefined,
      state_province: locals.user.state_province || undefined,
      guardian_signature: locals.user.guardian_signature || undefined,
      guardian_signature_type: locals.user.guardian_signature_type || undefined,
    }
  }), { headers: { 'Content-Type': 'application/json' } });
};
