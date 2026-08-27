UPDATE app_state
SET payload = jsonb_set(payload, '{notifications}', '[]'::jsonb, true),
    updated_at = now()
WHERE NOT (payload ? 'notifications');
