-- One-time workspace reset requested for the production cutover. Authentication
-- details for every existing administrator are retained; all generated,
-- operational, customer, staff and cached business records are removed.

DELETE FROM action_idempotency;
DELETE FROM auth_sessions;
DELETE FROM one_time_tokens;
DELETE FROM login_limits;
DELETE FROM notification_outbox;
DELETE FROM audit_logs;
DELETE FROM daily_operations_summaries;

DELETE FROM users
WHERE role <> 'admin';

UPDATE users
SET profile = (
      COALESCE(profile, '{}'::jsonb)
      - 'password'
      - 'passwordHash'
      - 'customerId'
    ) || jsonb_build_object(
      'id', id,
      'role', 'admin',
      'name', COALESCE(NULLIF(profile ->> 'name', ''), username),
      'username', username,
      'email', COALESCE(NULLIF(email, ''), NULLIF(profile ->> 'email', ''), ''),
      'phone', COALESCE(NULLIF(phone, ''), NULLIF(profile ->> 'phone', ''), ''),
      'branchIds', '[]'::jsonb,
      'verified', verified_at IS NOT NULL,
      'active', active
    ),
    updated_at = now()
WHERE role = 'admin';

WITH admin_profiles AS (
  SELECT COALESCE(
    jsonb_agg(profile ORDER BY created_at, id),
    '[]'::jsonb
  ) AS value
  FROM users
  WHERE role = 'admin'
)
UPDATE app_state
SET payload = jsonb_build_object(
      'version', 1,
      'dataRevision', 2,
      'activeUserId', NULL,
      'activeBranchId', 'all',
      'branches', '[]'::jsonb,
      'users', admin_profiles.value,
      'customers', '[]'::jsonb,
      'services', '[]'::jsonb,
      'orders', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'pickupRequests', '[]'::jsonb,
      'inventory', '[]'::jsonb,
      'clothingItems', '[]'::jsonb,
      'clothingSales', '[]'::jsonb,
      'activities', '[]'::jsonb,
      'notifications', '[]'::jsonb
    ),
    updated_at = now()
FROM admin_profiles
WHERE singleton = true;
