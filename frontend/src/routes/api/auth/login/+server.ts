import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const { email, password } = await request.json();

  try {
    const authData = await locals.pb.collection('users').authWithPassword(email, password);

    // Set HttpOnly cookie with PB auth state
    cookies.set('pb_auth', JSON.stringify({
      token: locals.pb.authStore.token,
      record: authData.record,
    }), {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: request.url.startsWith('https'),
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({
      user: {
        id: authData.record.id,
        email: authData.record.email,
        name: authData.record.name,
        role: authData.record.role,
        phone: authData.record.phone || undefined,
        address: authData.record.address || undefined,
        city: authData.record.city || undefined,
        state_province: authData.record.state_province || undefined,
        guardian_signature: authData.record.guardian_signature || undefined,
        guardian_signature_type: authData.record.guardian_signature_type || undefined,
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: 'Invalid email or password'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
};
