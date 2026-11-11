---
title: Outbound mail and the mail sink
sidebar_label: Outbound mail
description: How Chiban sends email, which parts send it, what happens when the mail server refuses a message, and how a demo keeps its mail on the server.
sidebar_position: 10
---

# Outbound mail and the mail sink

Chiban sends email for sign-in links, notices to applicants and contractors, board packets, calendar invitations for inspections, scheduled reports and health alerts. It does not run a mail server. It hands every message to one SMTP account that you provide. This page is for whoever runs the server and has to make that account work.

## The two settings

| Setting | What it does | Reaches the bundled Compose services |
| --- | --- | --- |
| `SMTP_URL` | The SMTP server to send through, written as a URL such as `smtp://username:password@smtp.example.org:587`. | Yes |
| `MAIL_FROM` | The sender of every message, written as `"Town of Example <noreply@town.example.org>"`. Calendar invitations use the same address as their organizer. | Yes |

Both are in `deploy/.env.example` and in the shared environment block of `deploy/docker-compose.yml`, so the application, the worker, the migration step and the storage setup step all see them. If the user name or password contains characters that are special in a URL, such as `@` or `/`, write them percent-encoded.

The defaults, used when a setting is absent, are `smtp://localhost:1025` and `Town of Alder Pond <noreply@alderpond.example>`. On a real server, set both. Mail from a domain with no SPF or DKIM record for your SMTP provider usually lands in spam. Fix that with the provider and your DNS.

Chiban has one transport: SMTP through nodemailer. It has no setting for an API-based mail service and no second route if SMTP fails. The in-memory transport in the source tree exists for tests and cannot be selected by configuration.

## Which part of Chiban sends what

Two processes send mail, and they send different things.

The web application sends right away, while the person waits, for:

- sign-in links for applicants, contractors and board members
- staff invitations, and resent invitations
- counter claim links
- board packets and packet updates
- Right-to-Know releases emailed to the requester

The worker sends in the background:

- Notifications. Staff and applicant notices are first written to a queue in the database. The worker's notification job runs every minute, reads up to 100 queued messages, and sends them one at a time. A message that fails goes back in the queue. After 5 failed attempts it is marked failed and is not tried again. A message whose recipient no longer has access is marked dropped instead of being sent.
- Calendar invitations for inspectors whose calendar target is email. See [the Microsoft integration](./microsoft.md) for the other target.
- Scheduled reports, checked every hour.
- Health alerts, when an alert address is set. See [health, version and alerts](./health-and-alerts.md).

The worker therefore has to be running for notices to go out. If it is stopped, queued mail waits and nothing is lost. The [background jobs page](./background-jobs.md) explains how to tell.

## When a message fails

A refused or unreachable SMTP server produces one line in the log of the process that tried, in this form:

```
[mail] send failed <reason from the SMTP library>
```

Read it with `docker compose logs app` for mail sent from the web application and `docker compose logs worker` for background mail. The reason is the SMTP library's own text, such as an authentication failure or a connection refused.

What the person sees depends on the path. A staff invitation or reset that fails to send is reported on screen as "The email could not be sent. Ask whoever runs the server to check the mail settings, then send it again." The administrator can send it again from the user's page. A board packet that fails reports "The email could not be sent. Try again." The public sign-in page gives the same answer whether or not a message went out, so a visitor will not know. The log of the application has `[auth] E_MAIL_001 sign-in link email was not sent` for those. A queued notice shows nothing: it is retried every minute until the fifth attempt and then stays in the database with the status `failed`. No screen lists failed notices, so after you fix an SMTP problem those messages are not resent from the application.

To check the account end to end, ask for a sign-in link from the public sign-in page with an address you control. If an alert address is set, `pnpm health:test-alert` in a development checkout, or `node dist/health-test-alert.mjs` in the image, sends a test message through the same transport.

## The mail sink

A mail sink is an SMTP server that accepts messages and keeps them instead of delivering them, so a test or demo installation can send mail without reaching real people. Chiban ships no sink in the production Compose file. The development file, `docker-compose.dev.yml`, starts Mailpit, which listens for SMTP on port 1025 and shows what it received in a web page on port 8025. The default `SMTP_URL` points at port 1025, so a development checkout works with it unchanged.

Demo mode adds a rule. When `CHIBAN_DEMO_MODE` is on, the application and worker refuse to start unless the host in `SMTP_URL` is listed in `CHIBAN_DEMO_MAIL_SINK_HOSTS` and the URL has no query options. The list is comma separated and defaults to `mailpit`. The check compares host names only. A host you add to the list is trusted to be a sink, and nothing checks that it is one. See [demo mode](./demo-mode.md).

Outside demo mode nothing restricts where mail goes.

## What the bundled Compose file leaves out

`deploy/docker-compose.yml` passes `SMTP_URL` and `MAIL_FROM` and no other mail setting. It has no mail server, no sink and no reply-to setting.
