# ShiftCup

Scheduling for single-location cafés and small restaurants. Employees send their availability, ShiftCup drafts the week by your rules, you fix the gaps and publish, and everyone gets reminded.

Built with Expo SDK 55, React Native, expo-router, NativeWind and Supabase.

## What it does

**Manager**
- **Today** — a four-step loop (Ask → Draft → Fix gaps → Publish) with attention cards, hours and wage totals.
- **Schedule** — week picker, gap and clash alerts with one-tap fixes, colour-coded slot cards, an assign sheet that explains why someone can't take a slot, plus fill / copy last week / share / clear.
- **Team** — request status, an AI reader that turns a text message into availability, ratings, role chips, a 7-day availability strip and invite codes.
- **Settings** — routine times, opening hours, coverage blocks, billing, legal and account deletion.

**Employee**
- **My shifts** — the published week with "I can't make it" cover requests.
- **Availability** — a weekly form with a due date.
- **Profile** — contact details and sign out.

## Scheduling rules

The draft engine is deterministic and enforces:

- A **solo** block needs one person qualified for all three roles who can work alone.
- A **two-person** block needs two different people, one barista and one scooper.
- Eligibility checks reply status, availability, role qualification, already-in-this-block, open cover requests, weekly hour limit, single continuous shift per day and longest shift.
- Highest rating wins; ties go to the candidate with fewer hours already assigned that week.
- Filling never overwrites a manual pick.

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in your Supabase project
pnpm start
```

## Environment

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe to expose) |

These are public client values. Server secrets live in Supabase Edge Function secrets, never in the app bundle:

| Secret | Used by |
| --- | --- |
| `OPENAI_API_KEY` | `parse-availability` |
| `STRIPE_SECRET_KEY` | `stripe-checkout`, `stripe-portal` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` |
| `RESEND_API_KEY` | `send-reminders` |

## Backend

```bash
supabase link --project-ref <your-ref>
supabase db push          # migrations in supabase/migrations
supabase functions deploy parse-availability
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
supabase functions deploy join-cafe
supabase functions deploy delete-account
supabase functions deploy send-reminders
```

`00003_shiftcup_reminder_cron.sql` schedules a `pg_cron` job that calls `send-reminders` every minute. It reads `project_url` and `publishable_key` from `vault.decrypted_secrets`, so set those first:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<anon-key>', 'publishable_key');
```

Point the Stripe webhook at `https://<ref>.supabase.co/functions/v1/stripe-webhook`.

## Try it

Tap **Explore a sample café** on the welcome screen and create an account. You land on *Dumont Creamery & Cafe* with seven people and a week of availability already loaded. Build the draft and you get exactly one gap — Friday 5–8 PM, scooper needed. Paste `Friday after 5, until 8. Saturday anytime.` into the Team tab's reader, save it, and fill again to close it.

## Project structure

```
src/
  app/
    (auth)/          sign-in, sign-up, join
    (app)/
      (manager)/     today, schedule, team, settings
      (employee)/    shifts, availability, profile
      home.tsx       role dispatcher
      setup.tsx      café onboarding
      billing.tsx    Stripe subscription
      admin.tsx      owner console
    legal.tsx
  components/        shared UI kit
  lib/
    scheduling.ts    draft engine and gap detection
    useWeek.ts       week data hook
    api.ts           Supabase data access
    sample.ts        sample café seed
    reminders.ts     reminder queue
supabase/
  migrations/        schema, RLS, cron
  functions/         Edge Functions
```

## Roles and privacy

Employees never see wage rates, ratings, peer contact details, unpublished drafts or billing controls. Those reads go through the `my_employee_profile` and `my_cafe_info` security-definer views, and every table has RLS enabled with full policy coverage.

## Billing

$29/month flat, 14-day trial. Subscription status is driven by Stripe webhooks. When the plan ends the manager can still see the schedule and pay; employees keep the last published week.
