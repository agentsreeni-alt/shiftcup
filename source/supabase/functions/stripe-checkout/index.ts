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

const PRICE_CENTS = 2900;

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
    if (!cafeId) return json({ error: 'Missing the café.' }, 400);

    const { data: cafe } = await supabase
      .from('cafes')
      .select('id, name, owner_id, is_sample, stripe_customer_id')
      .eq('id', cafeId)
      .maybeSingle();
    if (!cafe) return json({ error: 'Café not found.' }, 404);
    if (cafe.owner_id !== user.id) return json({ error: 'Only the manager can pay.' }, 403);
    if (cafe.is_sample) return json({ error: 'Sample cafés are never billed.' }, 400);

    const secret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secret) return json({ error: 'Billing is not connected yet. Add the Stripe key first.' }, 503);

    const stripe = new Stripe(secret);

    let customerId = cafe.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: cafe.name as string,
        metadata: { cafe_id: cafe.id as string },
      });
      customerId = customer.id;
      await supabase.from('cafes').update({ stripe_customer_id: customerId }).eq('id', cafe.id);
    }

    const origin = req.headers.get('origin') ?? 'https://shiftcup.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: PRICE_CENTS,
            recurring: { interval: 'month' },
            product_data: { name: 'ShiftCup — one café, unlimited team' },
          },
        },
      ],
      subscription_data: { metadata: { cafe_id: cafe.id as string } },
      metadata: { cafe_id: cafe.id as string },
      success_url: `${origin}/billing?checkout=done`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    return json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('stripe-checkout failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Could not start checkout. Check the Stripe key.' }, 500);
  }
});
