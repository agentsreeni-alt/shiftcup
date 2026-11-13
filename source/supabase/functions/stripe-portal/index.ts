import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@19.1.0';

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

    const body = await req.json();
    const cafeId = String(body.cafe_id ?? '');
    const { data: cafe } = await supabase
      .from('cafes')
      .select('id, owner_id, stripe_customer_id')
      .eq('id', cafeId)
      .maybeSingle();
    if (!cafe) return json({ error: 'Café not found.' }, 404);
    if (cafe.owner_id !== user.id) return json({ error: 'Only the manager can manage billing.' }, 403);
    if (!cafe.stripe_customer_id) return json({ error: 'No billing account yet. Subscribe first.' }, 400);

    const secret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secret) return json({ error: 'Billing is not connected yet.' }, 503);

    const stripe = new Stripe(secret);
    const origin = req.headers.get('origin') ?? 'https://shiftcup.app';
    const session = await stripe.billingPortal.sessions.create({
      customer: cafe.stripe_customer_id as string,
      return_url: `${origin}/billing`,
    });

    return json({ url: session.url });
  } catch (error) {
    console.error('stripe-portal failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Could not open the billing portal.' }, 500);
  }
});
