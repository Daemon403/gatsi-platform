# Gatsi Comms Suite

A multi-branch textile and dry-cleaning operations platform containing:

- `apps/mobile` - Expo React Native app for iOS and Android
- `apps/web` - Vite + React responsive web portal
- `apps/api` - shared authenticated REST API
- `packages/domain` - shared order, pricing, branch, payment and permission logic

## Platform versions

- Expo SDK 57 (`expo` 57.0.15)
- React Native 0.86.2
- React 19.2.3
- TypeScript 6.0.3 for mobile
- React Navigation 7
- Node.js 24

Expo SDK 57 uses React Native's New Architecture and Android edge-to-edge behavior. The project uses Continuous Native Generation, so Expo/EAS generates the native Android and iOS projects from `app.json`.

## Local development seed accounts

| Role | Username | Initial password | Included capabilities |
| --- | --- | --- | --- |
| Admin | `Promise` | `GATSI` | All branches and administration |
| Staff | `RudoStaff` | `NYATHI` | Assigned branch operations |
| Customer | `Rudo` | `CHIKOWORE` | Own orders, pickups and receipts |

These credentials are for local development. Production credentials live in protected deployment settings and are not committed to Git.

PostgreSQL is the system of record. Web and mobile retain a local resilience cache while authenticated mutations synchronize through the API.

## Included branches

- Harare CBD Branch
- Avondale Branch
- Murewa Branch

Administrators can switch between a consolidated view and individual branches. Staff access is limited to assigned branches, while customer data is scoped to the customer's own account.

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

On first local startup, versioned PostgreSQL migrations and development accounts are created. Passwords are salted and hashed with scrypt. Short-lived access tokens and rotating refresh tokens provide authenticated, role-scoped access.

Important endpoints include:

- `GET /api/health`
- `POST /api/auth/login`, `/api/auth/refresh` and `/api/auth/logout`
- `POST /api/auth/password-reset/request` and `/api/auth/password-reset/confirm`
- `POST /api/auth/verification/confirm`
- `GET /api/state`
- `POST /api/actions`
- `GET /api/audit`

## Deploy web, API and PostgreSQL on Vercel

The repository is configured as one Vercel project:

- Vite assets are served from `apps/web/dist`.
- `/api/*` is handled by a Node.js Vercel Function.
- Neon PostgreSQL is attached through Vercel. Runtime traffic uses the pooled `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`.
- Production migrations run during the Vercel build. Preview builds skip production migrations.

Link and deploy from the repository root:

```bash
npx vercel link
npx vercel deploy --prod
```

Required Production and Preview variables are `TOKEN_PEPPER_CURRENT`, `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `APP_ENV`, `DATABASE_SSL`, `DB_POOL_SIZE` and `CORS_ORIGINS`, in addition to the Neon variables injected by Vercel. Keep passwords, peppers and webhook secrets marked sensitive.

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
