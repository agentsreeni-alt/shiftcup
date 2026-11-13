import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const FROM = Deno.env.get('REMINDER_FROM_EMAIL') ?? 'ShiftCup <shifts@shiftcup.app>';

type Row = {
  id: string;
  cafe_id: string;
  employee_id: string;
  body: string;
  channel: 'email' | 'text';
  employees: { name: string; email: string | null; phone: string | null } | null;
  cafes: { name: string } | null;
};

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.error('resend failed', res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}

async function sendSms(to: string, text: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) return false;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
  });
  if (!res.ok) {
    console.error('twilio failed', res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

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
      'id, cafe_id, employee_id, body, channel, employees(name, email, phone), cafes(name)',
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
  let skipped = 0;

  for (const row of rows) {
    const employee = row.employees;
    const cafeName = row.cafes?.name ?? 'ShiftCup';
    const subject = `${cafeName} — your schedule`;
    let delivered = false;

    if (row.channel === 'text' && employee?.phone && smsReady) {
      delivered = await sendSms(employee.phone, `${cafeName}: ${row.body}`);
    }
    if (!delivered && employee?.email && emailReady) {
      delivered = await sendEmail(employee.email, subject, row.body);
    }

    if (delivered) {
      await supabase
        .from('reminders')
        .update({ state: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('state', 'queued');
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
