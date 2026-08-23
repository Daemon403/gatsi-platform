# Operations runbook

## Environments

Use `develop` for staging and `main` for production. Each environment has its own API, PostgreSQL database, CORS allowlist, notification endpoint, monitoring endpoint and token secrets. Never share databases or secrets between environments.

## Database migrations

The API applies pending versioned SQL migrations transactionally during startup. They can also be run explicitly with `npm run migrate --workspace @gatsi/api`. Never edit a migration after it has reached staging; create the next numbered migration.

## Backups and restoration

GitHub Actions creates a nightly custom-format `pg_dump` retained for 30 days. Render's managed PostgreSQL backups should also be enabled. Test restoration quarterly in an isolated database:

```bash
createdb gatsi_restore_test
pg_restore --clean --if-exists --no-owner --dbname=gatsi_restore_test gatsi-production.dump
```

## Secret rotation

Generate secrets with a cryptographically secure generator. To rotate the token pepper without immediately invalidating sessions:

1. Copy `TOKEN_PEPPER_CURRENT` to `TOKEN_PEPPER_PREVIOUS`.
2. Set a new random `TOKEN_PEPPER_CURRENT` and deploy.
3. Wait longer than `REFRESH_TOKEN_DAYS`.
4. Remove `TOKEN_PEPPER_PREVIOUS` and deploy again.

Rotate `NOTIFICATION_WEBHOOK_SECRET_CURRENT` with the same current/previous overlap supported by the notification receiver. Rotate database credentials through the hosting provider and update deployment secrets immediately. Never place secret values in Git, build logs or mobile/web environment variables.

## Monitoring and incident response

Set `ERROR_WEBHOOK_URL` to the production error collector. The API emits structured JSON logs and sends uncaught/request errors to this endpoint. Configure alerts for health-check failures, HTTP 5xx spikes, repeated login throttling, database saturation and notification delivery failures. Audit records are available to administrators at `GET /api/audit`.

## Required GitHub configuration

Create protected `staging` and `production` GitHub environments. Add `PRODUCTION_DATABASE_URL` only to the production environment. Require the CI workflow and an approving reviewer before merging to `main` or deploying production.
