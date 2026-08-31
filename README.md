# Gatsi Comms Suite

A multi-branch textile and dry-cleaning operations platform containing:

- `apps/mobile` - Expo React Native app for iOS and Android
- `apps/web` - Vite + React responsive web portal
- `apps/api` - shared authenticated REST API
- `packages/domain` - shared order, pricing, branch, payment, retail stock and permission logic

## Platform versions

- Expo SDK 57 (`expo` 57.0.15)
- React Native 0.86.2
- React 19.2.3
- TypeScript 6.0.3 for mobile
- React Navigation 7
- Node.js 24

Expo SDK 57 uses React Native's New Architecture and Android edge-to-edge behavior. The project uses Continuous Native Generation, so Expo/EAS generates the native Android and iOS projects from `app.json`.

## Initial administrator account

The API creates one initial administrator only when the database has no administrator account. Local development defaults to username `Promise` and password `GATSI`; production requires `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` in protected deployment settings. Existing administrator usernames, profile details and password hashes are never replaced by the seed step.

No branches, staff, customers, services, orders, payments, stock, retail items or other sample business records are seeded. The administrator creates every business record from the fresh workspace.

PostgreSQL is the system of record. Web and mobile retain only a local resilience cache of authenticated, database-fetched state while mutations synchronize through the API.

## Offline operation

After one successful online sign-in, both clients keep the authenticated, role-scoped workspace available when the API or internet connection is unavailable. New customers and orders, workflow updates, payments, pickups, inventory adjustments, new branches/services, retail products and retail sales update the interface immediately, are stored in a FIFO queue and replay automatically when connectivity returns. A visible status indicator shows offline, syncing, pending and rejected states; tapping it retries synchronization.

Every queued mutation has a stable idempotency key recorded by PostgreSQL, so retrying after a lost response cannot duplicate an order, payment, stock adjustment or sale. Server validation remains authoritative: if an offline change conflicts with newer server data, the rejected change is removed, the server version is restored and the sync indicator reports the issue.

The web service worker caches the production application shell after the first online visit. Mobile assets are already packaged in the Expo build. First-time sign-in, password reset/change, verification, daily-summary generation, staff-account administration and conflict-prone record edits remain online-only. Customer passwords are derived by the API from the documented first-name/last-name convention when an offline customer creation syncs; plaintext passwords are never written to an offline queue. Legacy caches without the current database revision are rejected, so previously bundled sample data cannot reappear.

Administrators can maintain branches, services, staff, customers, their own login username and profile, and saleable clothing stock. A dedicated Store view keeps retail products separate from services and operating inventory; each sale preserves the original list price alongside its final negotiated price, reduces stock atomically and remains in sales history. Daily operations summaries are stored separately from role-scoped app state and include branch, order, payment, pickup, staffing, supply and clothing-sales metrics.

Administrators can switch between a consolidated view and branches they create. Staff access is limited to assigned branches, while customer data is scoped to the customer's own account.

## Run locally

Install dependencies, start PostgreSQL and create the local API configuration:

```bash
npm install
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
```

Start the API and web client in separate terminals:

```bash
npm run api
```

```bash
npm run web
```

The API listens on `http://localhost:4000`; Vite normally listens on `http://localhost:5173`. Web uses `VITE_API_URL` and mobile uses `EXPO_PUBLIC_API_URL`. For a physical phone, set the mobile URL to the computer's LAN address instead of `localhost`.

On first local startup, versioned PostgreSQL migrations and the single initial administrator are created. Passwords are salted and hashed with scrypt. Short-lived access tokens and rotating refresh tokens provide authenticated, role-scoped access.

Important endpoints include:

- `GET /api/health`
- `POST /api/auth/login`, `/api/auth/refresh` and `/api/auth/logout`
- `POST /api/auth/password-reset/request` and `/api/auth/password-reset/confirm`
- `POST /api/account/password`
- `POST /api/auth/verification/confirm`
- `GET /api/state`
- `POST /api/actions`
- `GET /api/audit`
- `GET /api/admin/operations-summaries`
- `POST /api/admin/operations-summaries/generate`
- `GET /api/cron/daily-operations` (secured by `CRON_SECRET`)

## Deploy web, API and PostgreSQL on Vercel

The repository is configured as one Vercel project:

- Vite assets are served from `apps/web/dist`.
- `/api/*` is handled by a Node.js Vercel Function.
- Neon PostgreSQL is attached through Vercel. Runtime traffic uses the pooled `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`.
- Migrations run during both Production and Preview builds; Preview must use its own Neon branch and connection variables.

Link and deploy from the repository root:

```bash
npx vercel link
npx vercel deploy --prod
```

Required Production and Preview variables are `TOKEN_PEPPER_CURRENT`, `CRON_SECRET`, `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `APP_ENV`, `DATABASE_SSL`, `DB_POOL_SIZE` and `CORS_ORIGINS`, in addition to the Neon variables injected by Vercel. Keep passwords, peppers and webhook secrets marked sensitive.

The Vercel build applies versioned migrations in both Preview and Production. Configure `DATABASE_URL_UNPOOLED` for migrations and keep pooled `DATABASE_URL` for runtime requests. Migration `008_fresh_admin_only_state.sql` is the authorized one-time reset: it preserves administrator account details and password hashes, removes every non-admin account and business record, and invalidates existing sessions. Take or confirm a Neon restore point before the first deployment containing it.

Vercel is the canonical scheduler for daily operations summaries. It calls `GET /api/cron/daily-operations` at 22:05 UTC (00:05 Africa/Harare) and authenticates the request with `CRON_SECRET`. Do not enable a Render cron job or another scheduler against the same database while this Vercel cron is active; use exactly one scheduler per database to avoid duplicate generation attempts.

The production site is [gatsi-platform-web.vercel.app](https://gatsi-platform-web.vercel.app).

## Run and build the mobile app

Start Expo from the repository root:

```bash
npm run mobile
```

The staging and production EAS profiles call the API on the canonical Vercel origin. Create a new installable build after changing that URL:

```bash
cd apps/mobile
npx eas-cli build --platform android --profile production
```

## Validate the workspace

```bash
npm run doctor
npm run check
npm run build:web
```

`npm run doctor` checks the mobile app against the installed Expo SDK, validates app configuration and detects duplicate or incompatible native modules. CI also runs type checks, the web build and a high-severity dependency audit.

## Production backend

Both clients use the authenticated API in `apps/api`. Passwords are salted and hashed, refresh tokens rotate, login attempts are rate limited, customer data is role/branch scoped, and security events are written to PostgreSQL audit logs. When no email/SMS provider is configured, a newly created customer stays locked until an authenticated administrator explicitly verifies the account from the customer screen. See `docs/operations.md` for migrations, backups, monitoring and secret rotation.

## Notable workflows

- Branch-aware KPIs, revenue and operational queues
- Search and status filtering
- Garment intake with automatic pricing and due time
- Order workflow from received through collected
- Timestamped customer-visible status journey
- Partial and full payments with multiple methods
- Receipt views
- Inventory additions, usage and reorder alerts
- Staff attendance and assignments
- Customer pickup booking and history
- Responsive desktop, tablet and mobile interfaces
- Offline-friendly local caches
