---
title: Demo mode
sidebar_label: Demo mode
description: What turning on demo mode changes, the settings it requires, how a demo is reset, and why the bundled Compose file cannot run one unchanged.
sidebar_position: 90
---

# Demo mode

This page is for whoever runs a demonstration installation, such as the public demo. Never turn demo mode on for a town's real installation. [Dressing a demo as another town](./demo-overlay.mdx) covers the overlay file that renames the demo town. This page covers the mode itself.

## What it changes

Demo mode is the setting `CHIBAN_DEMO_MODE=true`. With it on:

- The **Try the demo** page at `/demo` exists. Without the mode, that address answers "not found". The page lists the demo people, such as Sam Clerk at the counter and Avery Admin, and each one has a **Continue as** button that signs the visitor in as that person with no password. All visitors share these accounts. The sign-in cookie lasts 7 days. One client address can sign in 30 times in 10 minutes, counted in the memory of the application process, and then sees "There have been many sign-ins from here".
- A notice shows at the top of the page: "This is a demo. The data resets every night at" the text of `CHIBAN_DEMO_RESET_AT`, "and mail is not delivered."
- Actions that would change the demo for every visitor are refused. The refusal reads "The demo does not allow this, because it would change the demo for every visitor. It works in a real installation." The refused actions are setting up an authenticator, changing a name or password, inviting, changing, disabling and resetting staff, saving or publishing the town profile, payment settings and notification wording, saving a payment processor, deleting a parcel ID format, archiving a board, connecting a Microsoft tenant, setting an inspector's calendar target, starting an export, adding or running export targets, anonymous intake settings and the parcel imports.
- Only the simulated payment processor is allowed. Saving a Stripe or Clover account is refused.
- Signing out works differently. In a real installation, signing out ends every session of that person. In a demo it ends only the current one, because visitors share the accounts.

Everything else works as in a real installation, so visitors can apply, review, issue and pay.

## Required settings

The application and the worker both refuse to start when any of these is missing.

| Setting | Rule |
| --- | --- |
| `CHIBAN_DEMO_RESET_AT` | Required. Free text of up to 60 characters, shown in the notice. It does not schedule anything. |
| `ENABLE_SIMULATED_PAYMENTS` | Must be `true`, so the simulated checkout works. |
| `SMTP_URL` | Must point at a host listed in `CHIBAN_DEMO_MAIL_SINK_HOSTS`, with no query options. The list defaults to `mailpit`. See [outbound mail](./outbound-mail.md). |

The application and the worker also exit at start with `[demo] refusing to start: CHIBAN_DEMO_MODE is on and a payment processor other than the simulator is configured` when the database holds a Stripe or Clover account. Remove the account, or reset the database, before starting.

`CHIBAN_DEMO_OVERLAY_FILE` is optional and is applied at every reset. See [the overlay page](./demo-overlay.mdx).

`ENABLE_DEV_SIGN_IN` is a separate setting for development. It turns on `/dev/sign-in`, which signs in as any seeded person, and it has no effect when `NODE_ENV` is `production`. Demo mode does not need it.

## Resetting

The reset command is `pnpm demo:reset` in a checkout, or `node dist/demo-reset.mjs` in the application image. It runs four steps in order.

1. Reads and checks the overlay, if one is set. A bad overlay stops the reset before anything is touched.
2. Drops the `drizzle` and `public` schemas from the database, creates `public` again and applies every migration.
3. Seeds the Town of Alder Pond: people, parcels, permits, board applications, meetings, enforcement cases, records and payments.
4. Applies the overlay, if any, as part of the seed.

It refuses to run unless demo mode is on, or the development sign-in is on outside production. Because step 2 drops the `public` schema, pointing it at a database that holds real data destroys that data. Nothing else prevents it.

Chiban does not schedule the reset. Run it from cron or a scheduled job at the time you put in `CHIBAN_DEMO_RESET_AT`.

The reset writes working files under `EXPORT_WORK_DIR`, in a `demo-seed` folder.

## The bundled Compose file is not a demo

`deploy/docker-compose.yml` passes none of the demo settings. It does not pass `CHIBAN_DEMO_MODE`, `CHIBAN_DEMO_RESET_AT`, `CHIBAN_DEMO_MAIL_SINK_HOSTS`, `CHIBAN_DEMO_OVERLAY_FILE` or `ENABLE_SIMULATED_PAYMENTS`, and it has no mail sink. Setting them in `.env` does nothing, because the Compose file only forwards the variables it lists. A demo on that file needs the five settings added to its shared environment block, a mail sink service on the Compose network, and a schedule for the reset.

The settings are listed in the [configuration reference](../reference/configuration.md).
