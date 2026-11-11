---
title: Card payments
description: How an online or counter card payment reaches the town, what each state means, and what to do when a payment is stuck, unknown or flagged.
sidebar_position: 3
---

# Card payments

Cash and checks are recorded by staff at the moment they are taken. Card payments go through a third party, the town's card processor, so Chiban records them only once the processor confirms them. This page covers how that works and what to do when it goes wrong.

## How an online payment reaches the town

1. An applicant or contractor chooses to pay online from their application. They go to the processor's checkout page, where the card details are entered.
2. After paying, they return to a Chiban page that says **Payment processing**, then **Payment received** with a link to their receipt, or **Payment declined** with a note that they were not charged and the fee is still due.
3. When the processor confirms the payment, Chiban adds it to the ledger, applies it to the fees and issues the receipt. The processor reports this to Chiban, and Chiban also asks the processor about open payments once an hour.

The processor account is the town's own. An administrator [connects it](../administrator/card-payments.md) under **Settings**, **Card payments**, with Stripe or Clover, and the same page sets the convenience fee. A convenience fee appears on its own line on the payment and on the cash receipts report, and it is not town fee revenue. The settings page also offers a **Simulated** processor for practice, which charges nothing and labels its payments as simulated.

Chiban records that a payment was made and applied, but it does not show payouts or bank deposits. To match deposits to your bank, use the processor's own dashboard.

A card payment taken at the counter works the same way, started from **Take a payment** on the application when the town has a card reader.

## What the states mean

Open a card payment from the top of the **Payments** page. It is titled **Card payment attempt** with a status:

- **Waiting for the processor**: started, no answer yet.
- **Authorized, not yet captured**: the card is approved and the money has not been taken yet.
- **Captured** and **Settled**: the money has been taken. Chiban records the payment once it is captured.
- **Declined**: the card was refused. Nothing is recorded.
- **Voided**: the attempt was cancelled.

The **History** section lists each change and says whether the processor reported it, Chiban found it when checking, or staff did it.

## An unknown outcome

A payment shows **Outcome unknown** when someone started it and Chiban never got a clear answer from the processor, for example because the connection dropped. The payment page and the application both warn about it.

1. Open the payment and choose **Check with processor**. Chiban asks the processor what happened and updates the payment. It checks open payments itself every hour too.
2. If the payment never went through and you want to close it, use **Void this attempt**, give a reason of at least 10 characters and confirm. Chiban asks the processor first. It will not void a payment the processor shows as taken, and it refuses while the processor still cannot say, so check again later or use the next step. Only a payment that is still waiting or authorized can be voided.
3. If a payment is still **Waiting for the processor** after more than a day, the processor may be unreachable or you may have confirmed it by phone. The page then offers **Record outcome**. Choose **Processor confirms approved** or **Processor confirms declined**, add the **Processor reference** if asked, and write a **Note (at least 10 characters)** such as who you spoke to. Chiban takes your answer as final and cannot undo it.

If the processor later reports something different from what you recorded, the payment shows **Processor disagrees**. Chiban keeps your recorded outcome and does not touch the ledger, so review it with the processor.

Administrators and finance staff can void and record an outcome. Anyone who takes payments can use **Check with processor**.

## Anomalies

An anomaly is a payment whose history does not fit the usual order, for example captured after it was voided, or an amount that differs from the processor's. It is listed under **Anomalies** with a short reason. Use **Check with processor** to see what the processor recorded, then decide whether a refund or correction is needed. See [Refunds and corrections](./refunds-and-corrections.md).
