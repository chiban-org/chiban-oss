# chiban

Open-source land-use software for small US towns: building and trade permits, inspections, Planning Board and ZBA applications, and code enforcement, organized around the parcel.

## Prerequisites

- Node.js 24 or newer
- pnpm 9
- Docker with Compose (Postgres with PostGIS, MinIO, and Mailpit run in containers)

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
pnpm db:seed:demo
pnpm dev
```

The app serves on http://localhost:3000. Mailpit shows outgoing mail on http://localhost:8025. If another process holds host port 1025 or 8025, set `MAILPIT_SMTP_PORT` or `MAILPIT_UI_PORT` before `docker compose up` and match `SMTP_URL` in `.env`.

## Dev sign-in

With `ENABLE_DEV_SIGN_IN=true` in `.env` and `NODE_ENV` other than `production`, http://localhost:3000/dev/sign-in lists the demo users (one per role, all at `alderpond.example`) and signs in as the one you pick.

To create a real staff account with a password and optional authenticator app:

```bash
pnpm staff:create --email you@example.test --name "Your Name" --role admin --password "a-long-password"
```

Then sign in at `/staff/sign-in` and enroll the authenticator at `/staff/account/totp`. Applicants and contractors sign in with an emailed link at `/sign-in`.

## Checks

```bash
pnpm gate
```

Runs lint, typecheck, the unit lane (also under a west-of-UTC time zone), the integration lane against a real PostGIS container, and the term gate. Set `CHIBAN_TERMS_FILE` to the path of a banned-terms file to enable the term gate; it reports file and line only.

Licensed under AGPL-3.0.
