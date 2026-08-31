ALTER TABLE action_idempotency
  ADD COLUMN IF NOT EXISTS request_hash text;

DELETE FROM action_idempotency
WHERE created_at < now() - interval '365 days';

-- A legacy row has already produced its side effect, but its original request body
-- cannot be reconstructed. Keep it fail-closed until retention removes it.
UPDATE action_idempotency
SET request_hash = repeat('0', 64)
WHERE request_hash IS NULL;

ALTER TABLE action_idempotency
  ALTER COLUMN request_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'action_idempotency_request_hash_sha256'
      AND conrelid = 'action_idempotency'::regclass
  ) THEN
    ALTER TABLE action_idempotency
      ADD CONSTRAINT action_idempotency_request_hash_sha256
      CHECK (request_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;
