import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const FROM = Deno.env.get('REMINDER_FROM_EMAIL') ?? 'ShiftCup <shifts@shiftcup.app>';

type Kind = 'request' | 'published' | 'evening' | 'soon' | 'renewal' | 'notice';

type Row = {
  id: string;
  cafe_id: string;
  employee_id: string;
  kind: Kind;
  body: string;
  channel: 'email' | 'text';
  employees: { name: string; email: string | null; phone: string | null } | null;
  cafes: { name: string; is_sample: boolean } | null;
};

// 'sent': delivered. 'retry': temporary problem, try again next run.
// 'drop': can never be delivered (bad address, rejected), so stop trying.
type Outcome = 'sent' | 'retry' | 'drop';

// Addresses on reserved test domains (RFC 2606 / 6761) can never receive mail.
// Sending to them only bounces and hurts the sending domain's reputation.
function isReservedAddress(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim() ?? '';
  if (!domain) return true;
  if (['example.com', 'example.net', 'example.org'].includes(domain)) return true;
  return ['.test', '.example', '.invalid', '.localhost'].some((tld) => domain.endsWith(tld));
}

function subjectFor(kind: Kind, cafeName: string): string {
  switch (kind) {
    case 'request':
      return `${cafeName}: when can you work next week?`;
    case 'published':
      return `${cafeName}: your schedule is ready`;
    case 'evening':
      return `${cafeName}: you're working tomorrow`;
    case 'soon':
      return `${cafeName}: your shift starts soon`;
    case 'notice':
      return `${cafeName}: an update from your manager`;
    default:
      return `${cafeName}: ShiftCup`;
  }
}

// The reminder id doubles as Resend's idempotency key: if a run is retried
// after Resend already accepted the message, the employee is not emailed twice.
async function sendEmail(
  to: string,
  subject: string,
  text: string,
  reminderId: string,
): Promise<Outcome> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return 'retry';
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `reminder-${reminderId}`,
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
  } catch (err) {
    // Network failure: nothing is known about delivery, so try again next run.
    console.error('resend unreachable', err instanceof Error ? err.message : String(err));
    return 'retry';
  }
  if (res.ok) return 'sent';
  console.error('resend failed', res.status, (await res.text()).slice(0, 200));
  // Rate limits and server errors are temporary; other 4xx (bad address) are not.
  return res.status === 429 || res.status >= 500 ? 'retry' : 'drop';
}

async function sendSms(to: string, text: string): Promise<Outcome> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) return 'retry';
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
  });
  if (res.ok) return 'sent';
  console.error('twilio failed', res.status, (await res.text()).slice(0, 200));
  return res.status === 429 || res.status >= 500 ? 'retry' : 'drop';
}

async function deliver(row: Row, emailReady: boolean, smsReady: boolean): Promise<Outcome> {
  // A sample café is a demo: it never messages anyone.
  if (row.cafes?.is_sample) return 'drop';
  const employee = row.employees;
  const cafeName = row.cafes?.name ?? 'ShiftCup';
  const email = employee?.email?.trim() || null;
  const phone = employee?.phone?.trim() || null;

  let outcome: Outcome = 'drop';
  if (row.channel === 'text' && phone && smsReady) {
    outcome = await sendSms(phone, `${cafeName}: ${row.body}`);
    if (outcome === 'sent') return outcome;
  }
  if (email && emailReady && !isReservedAddress(email)) {
    const emailOutcome = await sendEmail(
      email,
      subjectFor(row.kind, cafeName),
      row.body,
      row.id,
    );
    if (emailOutcome !== 'drop' || outcome !== 'retry') outcome = emailOutcome;
  }
  return outcome;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Only the database schedule knows this secret (stored in Vault as 'cron_secret').
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const emailReady = Boolean(Deno.env.get('RESEND_API_KEY'));
  const smsReady = Boolean(
    Deno.env.get('TWILIO_ACCOUNT_SID') &&
      Deno.env.get('TWILIO_AUTH_TOKEN') &&
      Deno.env.get('TWILIO_FROM_NUMBER'),
  );
  if (!emailReady && !smsReady) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'no_delivery_provider_configured' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { data, error } = await supabase
    .from('reminders')
    .select(
      'id, cafe_id, employee_id, kind, body, channel, employees(name, email, phone), cafes(name, is_sample)',
    )
    .eq('state', 'queued')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('reminder query failed', error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  let sent = 0;
  let dropped = 0;
  let retry = 0;

  for (const row of rows) {
    const outcome = await deliver(row, emailReady, smsReady);
    if (outcome === 'retry') {
      retry += 1;
      continue;
    }
    // Undeliverable reminders are closed out so they never block newer ones.
    await supabase
      .from('reminders')
      .update(
        outcome === 'sent'
          ? { state: 'sent', sent_at: new Date().toISOString() }
          : { state: 'cancelled' },
      )
      .eq('id', row.id)
      .eq('state', 'queued');
    if (outcome === 'sent') sent += 1;
    else dropped += 1;
  }

  return new Response(JSON.stringify({ ok: true, sent, dropped, retry }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
