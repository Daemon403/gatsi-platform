# Operations runbook

## Environments

Vercel hosts the web client and API together. Production uses the canonical Vercel domain; Preview is the staging target. Use a dedicated Neon branch and separate token secrets for Preview before exposing it to testers. Never use Preview for destructive production-data testing.

## Database migrations

The Vercel production build applies pending versioned SQL migrations transactionally through `DATABASE_URL_UNPOOLED`. Preview builds do not migrate the production database. Local API startup also applies migrations, and they can be run explicitly with `npm run migrate --workspace @gatsi/api`. Never edit a migration after it has reached staging; create the next numbered migration.

Migration `008_fresh_admin_only_state.sql` is a deliberate one-time clean-slate migration. It retains administrator accounts and their password hashes, clears branch assignments from their profiles, deletes every non-admin account and operational record, and invalidates all sessions. Test it against a Neon branch and confirm a restore point before promoting the deployment; each Vercel Preview environment must point to an isolated preview database branch.

Migration `009_transaction_receipts.sql` adds the receipt collection and advances the client data revision. API startup backfills one immutable receipt for each valid legacy service payment and clothing sale, while all new transactions create their receipt atomically with the payment or sale.

Store purchases retain one transaction ID across multiple flat clothing-sale lines. Every line must reference a distinct active product from the same open branch. The API validates all quantities and negotiated prices before reducing any stock, then creates one customer-linked receipt containing every product line. Legacy single-product sales remain readable and retain their original receipts.

## Live operations reporting

`GET /api/admin/operations-summaries/current` calculates today's Africa/Harare order, service-payment and store-transaction totals directly from the latest `app_state` row. It is read-only and does not replace or create a permanent daily snapshot. Web and mobile refresh it once per minute while the reporting view is open and retain an immediate calculation from the authenticated local cache for offline visibility. The scheduled completed-day workflow remains the authoritative historical record.

## Synchronization scheduling

The administrator-owned `settings.synchronizationMode` value is stored in PostgreSQL but is a mobile-only scheduling policy. The web app ignores this setting: it sends online mutations immediately and automatically replays queued work whenever connectivity returns. On mobile, `reconnect` replays queued changes whenever connectivity returns, while `daily` synchronizes on the first successful online use of each Africa/Harare day and then keeps later queueable operational changes on that device until the next day or a user chooses **Synchronize now**. Each mobile device stores only its per-user last-success timestamp locally; the business setting and synchronized records remain database-backed. Account, security, and other online-only administration actions continue to require the API immediately.

## Backups and restoration

GitHub Actions creates a nightly custom-format `pg_dump` retained for 30 days once `PRODUCTION_DATABASE_URL` is configured in the protected GitHub production environment. Keep Neon restore protection enabled for the production branch. Test restoration quarterly in an isolated database:

```bash
createdb gatsi_restore_test
pg_restore --clean --if-exists --no-owner --dbname=gatsi_restore_test gatsi-production.dump
```

## Secret rotation

Generate secrets with a cryptographically secure generator. To rotate the token pepper without immediately invalidating sessions:

1. Copy `TOKEN_PEPPER_CURRENT` to `TOKEN_PEPPER_PREVIOUS`.
2. Set a new random `TOKEN_PEPPER_CURRENT` and deploy.
3. Wait longer than both `REFRESH_TOKEN_DAYS` and `IDEMPOTENCY_RETENTION_DAYS`; queued-action request hashes also use the overlap so retries remain safe across rotation.
4. Remove `TOKEN_PEPPER_PREVIOUS` and deploy again.

Rotate `NOTIFICATION_WEBHOOK_SECRET_CURRENT` with the same current/previous overlap supported by the notification receiver. Rotate database credentials through the hosting provider and update deployment secrets immediately. Never place secret values in Git, build logs or mobile/web environment variables.

## Monitoring and incident response

Vercel captures the API's structured serverless logs. Set `ERROR_WEBHOOK_URL` when an external error collector is available; only unexpected server failures are forwarded, while expected 4xx responses remain warnings. Configure alerts for health-check failures, HTTP 5xx spikes, repeated login throttling, database saturation and notification delivery failures. Audit records are available to administrators at `GET /api/audit`.

## Account verification delivery

Set `NOTIFICATION_WEBHOOK_URL` to deliver email/SMS verification tokens for newly created customer accounts. Until a provider is configured, the creating administrator must explicitly verify the account from the customer screen. The fallback requires an authenticated administrator, consumes outstanding verification tokens and writes an audit record; accounts are never activated silently.

## Required GitHub configuration

Create protected `staging` and `production` GitHub environments. Add `PRODUCTION_DATABASE_URL` only to the production environment. Require the CI workflow and an approving reviewer before merging to `main` or deploying production.
