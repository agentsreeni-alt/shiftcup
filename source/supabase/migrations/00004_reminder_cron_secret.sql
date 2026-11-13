-- Re-create the reminder schedule so it sends a shared secret that the
-- send-reminders function checks. Reads project_url and cron_secret from Vault.
select cron.unschedule('shiftcup-send-reminders');

select cron.schedule(
  'shiftcup-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);
