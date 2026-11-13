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
      "You read a short message from a café employee about when they can work this week.",
      "Fill in every day of the week from what the message says.",
      "",
      "status for each day:",
      '- "all_day": available any time ("all day", "anytime", "whenever", "free").',
      '- "between": available only between two times. Give "from" and "to" as 24-hour "HH:MM".',
      '- "off": not available, or the day is not mentioned.',
      "",
      "Time rules (cafés open roughly 7:00 to 23:00):",
      '- A bare hour from 1 to 6 means PM ("after 2" = 14:00, "until 5" = 17:00).',
      '- A bare hour from 7 to 11 means AM when it is a start ("from 9" = 09:00) and PM when it is an end ("until 8" = 20:00, "till 10" = 22:00).',
      '- "after X" with no end means from X until close: "to" = "24:00".',
      '- "until X" / "before X" with no start means from open: "from" = "06:00".',
      '- "morning" = 06:00-12:00, "afternoon" = 12:00-17:00, "evening" = 17:00-24:00.',
      "",
      "Day rules:",
      "- Days the message does not mention are off.",
      '- "weekends" = saturday and sunday. "weekdays" = monday to friday.',
      '- If something is vague ("maybe Friday"), make that day off and explain in "unclear".',
      "",
      `Team members: ${team.map((e) => e.name).join(', ')}.`,
      'Set "employee_name" ONLY if one of those names is written in the message. Otherwise use "". Never guess.',
      '"unclear" is a short note for the manager about anything ambiguous, or "".',
    ].join('\n');

    const timeField = { type: 'string', description: '24-hour HH:MM, or "" when not "between"' };
    const daySchema = {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'from', 'to'],
      properties: {
        status: { type: 'string', enum: ['all_day', 'between', 'off'] },
        from: timeField,
        to: timeField,
      },
    };
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['employee_name', 'unclear', ...dayKeys],
      properties: {
        employee_name: { type: 'string' },
        unclear: { type: 'string' },
        ...Object.fromEntries(dayKeys.map((k) => [k, daySchema])),
      },
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'weekly_availability', strict: true, schema },
        },
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
    type DayOut = { status?: string; from?: string; to?: string };
    let parsed: Record<string, DayOut> & { employee_name?: string; unclear?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'The reader returned something unreadable. Try again.' }, 502);
    }

    // Only accept a name the model found AND that really appears in the message.
    const said = text.toLowerCase();
    const name = String(parsed.employee_name ?? '').trim().toLowerCase();
    const match = name
      ? team.find((e) => e.name.toLowerCase() === name && said.includes(name))
      : undefined;

    const toMin = (hhmm: string | undefined): number | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
      return h * 60 + min;
    };

    const days = dayKeys.map((key, weekday) => {
      const d = (parsed[key] ?? {}) as DayOut;
      if (d.status === 'all_day') return { weekday, kind: 'any', start_min: 0, end_min: 0 };
      if (d.status === 'between') {
        const start = toMin(d.from);
        const end = toMin(d.to);
        if (start !== null && end !== null && end > start) {
          return { weekday, kind: 'window', start_min: start, end_min: end };
        }
      }
      return { weekday, kind: 'none', start_min: 0, end_min: 0 };
    });

    return json({
      employee_id: match?.id ?? null,
      employee_name: match?.name ?? '',
      days,
      unclear: String(parsed.unclear ?? '').trim(),
    });
  } catch (error) {
    console.error('parse-availability failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Could not read that message.' }, 500);
  }
});
