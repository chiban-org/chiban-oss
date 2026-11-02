# chiban

Open-source land-use software for small US towns: building and trade permits, inspections, Planning Board and ZBA applications, and code enforcement, organized around the parcel.

## Prerequisites

- Node.js 24 or newer
- pnpm 9
- Docker with Compose (Postgres with PostGIS, MinIO, and Mailpit run in containers)
- Ghostscript 10 on the PATH for PDF/A preservation (`brew install ghostscript` or `apt-get install ghostscript`)
- OCRmyPDF with the English Tesseract data on the PATH, only to migrate scanned legacy files (`brew install ocrmypdf` or `apt-get install ocrmypdf tesseract-ocr-eng`)

## Getting started

```bash
pnpm install
cp .env.example .env
```

Generate a secret key and put it in `.env` as the value for key `k1` in `CHIBAN_SECRET_KEYS`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Start the backing services, apply migrations, seed the fictional Town of Alder Pond, and run the app:

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm storage:init
pnpm db:seed:demo
pnpm dev
```

In a second terminal, start the background worker. `pnpm dev` runs only the web app; without the worker, emails stay queued, exports stay waiting to start, and scheduled jobs never run:

```bash
pnpm worker
```

The app serves on http://localhost:3000. Mailpit shows outgoing mail on http://localhost:8025. If another process holds host port 1025 or 8025, set `MAILPIT_SMTP_PORT` or `MAILPIT_UI_PORT` before `docker compose up` and match `SMTP_URL` in `.env`. To serve the app from another origin, such as a second checkout on port 3100, set `MINIO_CORS_ORIGIN=http://localhost:3100` (comma-separated for several) before `docker compose up` so browser uploads to storage are allowed.

## Dev sign-in

With `ENABLE_DEV_SIGN_IN=true` in `.env` and `NODE_ENV` other than `production`, http://localhost:3000/dev/sign-in lists the demo users (one per role, all at `alderpond.example`) and signs in as the one you pick.

To create a real staff account with a password and optional authenticator app:

```bash
pnpm staff:create --email you@example.test --name "Your Name" --role admin --password "a-long-password"
```

Then sign in at `/staff/sign-in` and enroll the authenticator at `/staff/account/totp`. Applicants and contractors sign in with an emailed link at `/sign-in`.

## Payment processors in development

No live processor key is configured anywhere in the repository. Stripe runs against `stripe-mock`, which the Compose file starts on port 12111: set `STRIPE_API_BASE=http://localhost:12111` in `.env` (it is rejected when `NODE_ENV` is `production`) and save a Stripe account with the key `sk_test_123` at `/staff/settings/payments`. `stripe-mock` is stateless and sends no webhooks, so it checks request shapes and response parsing only.

Set `ENABLE_SIMULATED_PAYMENTS=true` to use the simulated processor, which backs the in-app checkout page and the counter card reader panel. Both state on screen that no live processor is connected. The Clover adapter runs against a local fake server (`pnpm clover:fake`) and is not verified against a live merchant account.

## Checks

```bash
pnpm gate
```

Runs lint, typecheck, the unit lane (also under a west-of-UTC time zone), the integration lane against a real PostGIS container, and the term gate. Set `CHIBAN_TERMS_FILE` to the path of a banned-terms file to enable the term gate; it reports file and line only.

Licensed under AGPL-3.0.
