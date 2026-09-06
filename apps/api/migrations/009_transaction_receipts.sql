UPDATE app_state
SET payload = jsonb_set(
  jsonb_set(payload, '{receipts}', COALESCE(payload->'receipts', '[]'::jsonb), true),
  '{dataRevision}', '3'::jsonb,
  true
),
updated_at = now()
WHERE singleton = true;
