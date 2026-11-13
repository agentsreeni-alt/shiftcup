import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const code = String(body.invite_code ?? '').trim().toUpperCase();
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!code || !name || !email || password.length < 6) {
      return json({ message: 'Fill in the invite code, your name, email and a password of 6+ characters.' }, 400);
    }

    const { data: employee } = await supabase
      .from('employees')
      .select('id, cafe_id, name, active, user_id')
      .eq('invite_code', code)
      .maybeSingle();

    if (!employee) return json({ message: 'That invite code does not match a café.' }, 404);
    if (!employee.active) return json({ message: 'This invite is no longer active. Ask your manager.' }, 403);
    if (employee.user_id) return json({ message: 'This invite has already been used. Sign in instead.' }, 409);

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'employee', name },
    });

    if (createError || !created?.user) {
      const message = createError?.message ?? '';
      if (message.toLowerCase().includes('already')) {
        return json({ message: 'That email already has an account. Sign in instead.' }, 409);
      }
      console.error('create user failed', message);
      return json({ message: 'Could not create your account. Try again.' }, 500);
    }

    const userId = created.user.id;

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role: 'employee',
        cafe_id: employee.cafe_id,
        employee_id: employee.id,
        email,
      })
      .eq('id', userId);
    if (profileError) {
      console.error('profile update failed', profileError.message);
      await supabase.auth.admin.deleteUser(userId);
      return json({ message: 'Could not finish setting up your account.' }, 500);
    }

    const { error: linkError } = await supabase
      .from('employees')
      .update({ user_id: userId, email })
      .eq('id', employee.id);
    if (linkError) {
      console.error('employee link failed', linkError.message);
      return json({ message: 'Could not link you to the team.' }, 500);
    }

    return json({ ok: true, cafe_id: employee.cafe_id });
  } catch (error) {
    console.error('join-cafe failed', error instanceof Error ? error.message : 'unknown');
    return json({ message: 'Could not join. Try again.' }, 500);
  }
});
