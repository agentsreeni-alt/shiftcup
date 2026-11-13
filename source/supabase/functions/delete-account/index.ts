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
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: auth } = await supabase.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'Sign in first.' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, cafe_id, employee_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role === 'manager' && profile.cafe_id) {
      const { data: cafe } = await supabase
        .from('cafes')
        .select('id, owner_id')
        .eq('id', profile.cafe_id)
        .maybeSingle();
      if (cafe?.owner_id === user.id) {
        await supabase.from('cafes').delete().eq('id', cafe.id);
      }
    }

    if (profile?.employee_id) {
      await supabase
        .from('employees')
        .update({ user_id: null, active: false })
        .eq('id', profile.employee_id);
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error('delete user failed', error.message);
      return json({ error: 'Could not delete the account.' }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('delete-account failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Could not delete the account.' }, 500);
  }
});
