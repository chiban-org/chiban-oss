---
title: Refunds and corrections
description: How to refund a payment, record a returned check or a chargeback, and move money to another permit, and what each does to the balance of an application or a fine.
sidebar_position: 2
---

# Refunds and corrections

Chiban never edits or deletes a payment. When money has to go back or move, you add a new entry that reverses part of the old one, and the balance follows. Administrators and finance staff can do all of this, on the application or the enforcement case rather than on **Payments**.

## Where the controls are

Open the application and go to **Fees and payments**. Under **Payments recorded**, each payment has **Refund, correct, or reverse**. Open it to see the options that fit that payment. Only payment entries have these controls.

## Refund a fine payment

A fine paid on an enforcement case is handled on the case. Open the case and go to **Fines**. Each fine lists the payments made against it, with a **Receipt** link and, for a card payment, a **Card payment** link. Under a payment, **Refund or reverse** offers the same refund, returned check and chargeback forms described below, with these differences:

- A refund comes off that fine only. If one payment covered two fines, refunding from one fine leaves the other alone. The form lists the fine and the most you can refund from it.
- A returned check reverses the whole payment, and the amount is due on the fine again.
- A chargeback takes the amount you enter back from this payment on this fine.
- A fine payment cannot be moved, so **Move to another permit** is not offered.

Only administrators and finance staff see these controls on a fine, as on an application.

## Refund a payment

1. Open **Refund, correct, or reverse** on the payment.
2. Read the lines listed under "A refund here reduces only these lines on this application." Each line shows the most you can refund.
3. Enter the **Refund amount in dollars** and a **Reason (at least 10 characters)**.
4. Choose **Refund** and confirm.

Chiban takes the amount off those fee lines, so the fee shows as due again. It issues a refund receipt and records the refund as a negative entry. The entry uses the same method as the original: a cash refund appears in the **Cash** column on the cash receipts report, a check refund in **Check**.

A card payment is refunded through the card processor. The page then says either that the refund is recorded on a receipt, or "Refund sent. The processor has not completed it yet, so it is not in the ledger." In the second case, the refund is added to the ledger when the processor confirms it. If the processor rejects the refund, Chiban shows the processor's message and records nothing.

You cannot refund more than the payment still holds.

## Record a returned check

For a check payment, **Record returned check** takes the full payment back when the bank returns the check. Enter **Returned on** and a reason. The fee shows as due again. The permit's state does not change, so the permit is not revoked for you. The daily cash receipts report marks the check as returned.

## Record a chargeback

For a card payment, **Record chargeback** takes back money when a cardholder disputes the charge. Enter the **Dispute reference** from the processor, the **Amount in dollars** and a reason.

## Move money to another permit

**Move to another permit** corrects a payment applied to the wrong application. Choose the permit under **Move to**, enter the **Amount in dollars** and a reason. The option appears when other applications exist and lists only the 25 most recent. It moves money onto a fee that is still due, so Chiban refuses if the other permit has no unpaid fee of at least that amount.

## Every reversal needs a reason

Each of these asks for a reason of at least 10 characters, which is kept with the entry. Refunds, returned checks and chargebacks cannot be undone, so each asks you to confirm.
