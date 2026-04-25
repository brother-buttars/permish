import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const { email, password, name, role } = await request.json();

  try {
    // Create the user record
    await locals.pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name,
      role: role || 'user',
    });

    // Auto-login after registration
    const authData = await locals.pb.collection('users').authWithPassword(email, password);

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
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const message = err?.response?.data?.email?.message || err?.message || 'Registration failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
