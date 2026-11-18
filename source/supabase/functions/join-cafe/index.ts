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
    const code = String(body.invite_code ?? '')
      .trim()
      .toUpperCase();

    // Someone who already has a ShiftCup account joins with it (signed in, so the
    // request carries their token). Only an account that is not part of any café yet.
    if (body.link_existing) {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: auth } = await supabase.auth.getUser(token);
      const user = auth?.user;
      if (!user) return json({ message: 'Sign in again, then use the invite code.' }, 401);

      const { data: employee } = await supabase
        .from('employees')
        .select('id, cafe_id, active, user_id')
        .eq('invite_code', code)
        .maybeSingle();
      if (!employee) return json({ message: 'That invite code does not match a café.' }, 404);
      if (!employee.active)
        return json({ message: 'This invite is no longer active. Ask your manager.' }, 403);
      if (employee.user_id && employee.user_id !== user.id) {
        return json({ message: 'This invite has already been used. Sign in instead.' }, 409);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, cafe_id, employee_id')
        .eq('id', user.id)
        .maybeSingle();
      const { count: ownsCafes } = await supabase
        .from('cafes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id);
      if (profile?.role === 'owner' || (ownsCafes ?? 0) > 0) {
        return json({ message: 'This account runs a café. Join with a different email.' }, 409);
      }
      if (profile?.employee_id && profile.employee_id !== employee.id) {
        return json(
          { message: 'This account is already on another team. Use a different email.' },
          409,
        );
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          role: 'employee',
          cafe_id: employee.cafe_id,
          employee_id: employee.id,
          email: user.email,
        })
        .eq('id', user.id);
      if (profileError) {
        console.error('profile link failed', profileError.message);
        return json({ message: 'Could not finish setting up your account.' }, 500);
      }
      const { error: linkError } = await supabase
        .from('employees')
        .update({ user_id: user.id, email: user.email })
        .eq('id', employee.id);
      if (linkError) {
        console.error('employee link failed', linkError.message);
        return json({ message: 'Could not link you to the team.' }, 500);
      }
      return json({ ok: true, cafe_id: employee.cafe_id });
    }
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body.password ?? '');

    if (!code || !name || !email || password.length < 6) {
      return json(
        { message: 'Fill in the invite code, your name, email and a password of 6+ characters.' },
        400,
      );
    }

    const { data: employee } = await supabase
      .from('employees')
      .select('id, cafe_id, name, active, user_id')
      .eq('invite_code', code)
      .maybeSingle();

    if (!employee) return json({ message: 'That invite code does not match a café.' }, 404);
    if (!employee.active)
      return json({ message: 'This invite is no longer active. Ask your manager.' }, 403);
    if (employee.user_id)
      return json({ message: 'This invite has already been used. Sign in instead.' }, 409);

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
