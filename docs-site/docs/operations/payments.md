---
title: Payment processors and webhooks
sidebar_label: Payment processors
description: Where the processor account is saved, what the webhook endpoint expects, how Chiban catches up when a webhook is missed, and which parts are not proven against live accounts.
sidebar_position: 20
---

# Payment processors and webhooks

This page is for whoever runs the server and sets up card payments with the town's administrator. Chiban takes card payments through a processor the town already has an account with. Staff and applicants never see card numbers: the processor takes them. Chiban records what the processor reports.

## What is supported

The processor form offers three choices.

| Choice | What it is | State |
| --- | --- | --- |
| Stripe | Online checkout and a counter card reader. | No practice notice is shown on screen. The README says no live processor key is configured anywhere in the repository and that Stripe is exercised against `stripe-mock`, a stand-in that answers with fixed responses. |
| Clover | Online checkout and a counter card reader. | The settings page says "Clover connection is not yet verified against a live merchant account." Treat it as untested with real money. |
| Simulated (practice only) | A fake processor for demonstrations. No card is ever charged. | Available only when `ENABLE_SIMULATED_PAYMENTS` is `true`. The bundled Compose file passes that setting through, blank by default. |

Cash and check payments need no processor.

## Saving the processor account

An administrator opens **Settings**, **Money and inspections**, **Card payments** and fills in the **Processor** section. The page needs the permission to edit configuration.

| Field | What goes in it |
| --- | --- |
| **Processor** | Stripe, Clover or Simulated. |
| **Mode** | Test or Live. |
| **Account number at the processor** | The Stripe account ID or the Clover merchant ID. |
| **Secret key** | Stripe's secret key, or Clover's private token. |
| **Webhook signing secret** | The secret the processor gives you for the webhook endpoint. Optional on the first save: leave it blank to get the webhook address, then save again with the secret. A blank field on a later save keeps the stored one. |
| **Advanced** | Clover API address, Clover checkout address, and the card reader device ID. |

The secret key and the signing secret are encrypted with the active key in `CHIBAN_SECRET_KEYS` and are never shown again. The form asks for the secret key every time you save, and a blank signing secret keeps the stored one. If the keys are lost, the saved credentials cannot be read and the page reports "Processor credentials cannot be read."

Saving the same processor, mode and account number again updates that account record in place, so its id and its webhook address do not change. A new processor, mode or account number adds a new record with a new id, makes it the active one and deactivates the earlier one. Either way an audit entry is written, and earlier records stay in the database.

## The webhook endpoint

The processor tells Chiban about payments by calling:

```
POST https://town.example.org/api/payments/webhooks/<account id>
```

The id at the end is the id of the saved account record. The **Card payments** page shows the full address under **Processor**, with a **Copy address** button, so nobody needs the database. The address is hidden for the simulator, which sends no webhooks. For a new account, save once with the signing secret blank to see the address, register it in the processor's dashboard, then save again with the secret the processor gives you.

Addresses issued before the address became stable keep working, each with the secret of its own account.

While no signing secret is saved, every webhook for the account is refused with `bad_signature`, and the page says the account is not receiving payment updates. Checkout still works, and the hourly reconciliation below catches the payments.

The path is skipped by the application's CSRF cookie handling, and the bundled Caddyfile sends it to the application like every other path. The processor must be able to reach it over HTTPS on the public name.

### What the endpoint answers

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `{"received":true}` | The event was accepted. A repeat of an event already processed adds `"duplicate":true`. |
| 400 | `{"error":"bad_signature"}` or `{"error":"malformed"}` | No signing secret is saved, the signature did not match it, was missing or too old, or the body could not be read. |
| 404 | `{"error":"unknown_account"}` | The last part of the address is not an id Chiban knows. |
| 500 | `{"error":"processing_failed"}` | Chiban could not look up or reconcile the payment. The processor should retry. |
| 503 | `{"error":"credentials_unreadable"}` | The account's saved secrets cannot be decrypted. Check `CHIBAN_SECRET_KEYS`. |

Stripe's signature is read from the `Stripe-Signature` header and Clover's from `Clover-Signature`. Both are rejected when their timestamp is more than 300 seconds from the server's clock, so keep the host's clock synchronized.

### What Chiban does with an event

Chiban takes neither the amount nor the outcome from the body of an event. It stores the event (once per account and event id), finds the payment attempt it refers to, asks the processor for that payment's current state, and reconciles the attempt to what the processor says. An event for another Stripe account, or one whose live or test flag does not match the saved account's mode, is stored and ignored. So is an event for a payment Chiban has no record of. The outcome is kept with the event as `reconciled`, `foreign_object`, `no_attempt` or `error`. An event that ended in `error` is answered with 500 and stays unprocessed so the processor's retry can finish it.

For Stripe, the code reads events whose type begins with `checkout.session.` or `payment_intent.`, and any other event whose object carries a `payment_intent` field, such as a charge or a refund. Other event types are stored and answered with 200 without changing a payment.

## When a webhook never arrives

Webhooks are not the only way Chiban learns of a payment. The worker's payment reconciliation job runs every hour. It looks at every attempt that is authorized or captured, and every pending attempt that is marked outcome unknown or has not changed for 10 minutes, asks the processor for its state and reconciles it. A town that cannot expose the endpoint still gets correct payments, an hour late at worst, as long as the worker runs. The job records the last check and its error on each attempt.

## Demo mode and development

When `CHIBAN_DEMO_MODE` is on, only the simulated processor may be saved. If any other processor is already in the database, the application and the worker refuse to start and log `[demo] refusing to start: CHIBAN_DEMO_MODE is on and a payment processor other than the simulator is configured`.

`STRIPE_API_BASE` points the Stripe adapter at another address, such as a local `stripe-mock`. The application refuses to start when it is set and `NODE_ENV` is `production`, which the application image sets. `stripe-mock` sends no webhooks.

## Settings in the bundled Compose file

`deploy/docker-compose.yml` passes `ENABLE_SIMULATED_PAYMENTS` and `STRIPE_API_BASE` to every service, and `deploy/.env.example` lists both with a blank value. A blank value counts as unset, so a town's real installation leaves them blank and saves a Stripe or Clover account. Set `ENABLE_SIMULATED_PAYMENTS=true` in `.env` only on a practice installation: the simulated processor records payments that took no money.

The [configuration reference](../reference/configuration.md) lists these settings in full.

## The settings page

![The Card payments settings page, showing the active processor account and the Processor form](/img/shots/operations/payments-processor.png)
