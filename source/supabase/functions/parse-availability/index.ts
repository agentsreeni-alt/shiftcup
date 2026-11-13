import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
    const text = String(body.text ?? '').trim();
    if (!cafeId || !text) return json({ error: 'Missing the café or the message.' }, 400);

    const { data: cafe } = await supabase
      .from('cafes')
      .select('id, owner_id, is_sample, subscription_status, trial_ends_at, paid_until')
      .eq('id', cafeId)
      .maybeSingle();
    if (!cafe) return json({ error: 'Café not found.' }, 404);
    if (cafe.owner_id !== user.id) return json({ error: 'Only the manager can read messages.' }, 403);

    if (!cafe.is_sample) {
      const now = Date.now();
      const trialOk =
        cafe.subscription_status === 'trial' && new Date(cafe.trial_ends_at).getTime() > now;
      const paidOk =
        (cafe.subscription_status === 'active' || cafe.subscription_status === 'past_due') &&
        Boolean(cafe.paid_until) &&
        new Date(cafe.paid_until as string).getTime() > now;
      if (!trialOk && !paidOk) {
        return json({ error: 'Your plan has ended. Subscribe to use the reader.' }, 402);
      }
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return json({ error: 'The reader is not set up yet. Add the OpenAI key first.' }, 503);
    }

    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, active')
      .eq('cafe_id', cafeId)
      .eq('active', true);
    const team = (employees ?? []) as { id: string; name: string }[];
    if (team.length === 0) return json({ error: 'Add your team first.' }, 400);

    const system = [
      'You turn a café employee message into weekly availability.',
      'Return JSON only, with this shape:',
      '{"employee_name": string, "days": [{"weekday": number, "kind": "any"|"none"|"window", "start_min": number, "end_min": number}], "unclear": string}',
      'weekday is 0 for Monday through 6 for Sunday.',
      'start_min and end_min are minutes after midnight (e.g. 5 PM = 1020). Use 0 for both when kind is not "window".',
      'Rules:',
      '- If the person lists only the days they can work, mark every other day as "none".',
      '- Never guess a time. If a day is mentioned without clear hours and is not "any time", use "none" and explain in "unclear".',
      '- Vague words like "maybe weekends" go in "unclear" and those days become "none".',
      '- "anytime", "all day", "whenever" mean kind "any".',
      '- Always return all seven days.',
      `The team is: ${team.map((e) => e.name).join(', ')}.`,
      'Pick employee_name from that list. If nobody matches, use an empty string.',
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('openai error', response.status, detail.slice(0, 300));
      return json({ error: 'The reader could not answer. Try again in a moment.' }, 502);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content ?? '{}';
    let parsed: {
      employee_name?: string;
      days?: { weekday?: number; kind?: string; start_min?: number; end_min?: number }[];
      unclear?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'The reader returned something unreadable. Try again.' }, 502);
    }

    const match = team.find(
      (e) => e.name.toLowerCase() === String(parsed.employee_name ?? '').trim().toLowerCase(),
    );
    if (!match) {
      return json({ error: 'Could not tell who sent this. Add their name to the message.' }, 422);
    }

    const byDay = new Map<number, { weekday: number; kind: string; start_min: number; end_min: number }>();
    for (const d of parsed.days ?? []) {
      const weekday = Number(d.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      const kind = d.kind === 'any' || d.kind === 'window' ? d.kind : 'none';
      const start = Math.max(0, Math.min(1439, Number(d.start_min ?? 0)));
      const end = Math.max(0, Math.min(1440, Number(d.end_min ?? 0)));
      if (kind === 'window' && end <= start) {
        byDay.set(weekday, { weekday, kind: 'none', start_min: 0, end_min: 0 });
        continue;
      }
      byDay.set(weekday, {
        weekday,
        kind,
        start_min: kind === 'window' ? start : 0,
        end_min: kind === 'window' ? end : 0,
      });
    }

    const days = DAYS.map((_, i) => byDay.get(i) ?? { weekday: i, kind: 'none', start_min: 0, end_min: 0 });

    return json({
      employee_id: match.id,
      employee_name: match.name,
      days,
      unclear: String(parsed.unclear ?? '').trim(),
    });
  } catch (error) {
    console.error('parse-availability failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Could not read that message.' }, 500);
  }
});
