import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@19.1.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

async function markActive(cafeId: string, patch: Record<string, unknown>) {
  await supabase
    .from('cafes')
    .update({ subscription_status: 'active', ...patch })
    .eq('id', cafeId);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret || !webhookSecret) {
    return new Response('Stripe is not configured', { status: 503 });
  }

  const stripe = new Stripe(secret);
  const signature = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
  } catch (error) {
    console.error('bad signature', error instanceof Error ? error.message : 'unknown');
    return new Response('Bad signature', { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const cafeId = String(session.metadata?.cafe_id ?? '');
      if (cafeId) {
        await markActive(cafeId, {
          paid_until: addDays(new Date(), 30).toISOString(),
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
          stripe_subscription_id:
            typeof session.subscription === 'string' ? session.subscription : null,
        });
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      if (customerId) {
        const { data: cafe } = await supabase
          .from('cafes')
          .select('id, paid_until')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();
        if (cafe) {
          const current = cafe.paid_until ? new Date(cafe.paid_until as string) : new Date();
          const base = current.getTime() > Date.now() ? current : new Date();
          await markActive(cafe.id as string, {
            paid_until: new Date(base.getTime() + THIRTY_DAYS).toISOString(),
          });
        }
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      if (customerId) {
        await supabase
          .from('cafes')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : null;
      if (customerId) {
        await supabase
          .from('cafes')
          .update({ subscription_status: 'ended', stripe_subscription_id: null })
          .eq('stripe_customer_id', customerId);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('webhook handling failed', error instanceof Error ? error.message : 'unknown');
    return new Response('Webhook handler failed', { status: 500 });
  }
});
