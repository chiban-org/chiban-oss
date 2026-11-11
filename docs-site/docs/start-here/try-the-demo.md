---
title: Try the demo
description: Look around the fictional Town of Alder Pond as a clerk, an inspector, a board member, a finance clerk, a records custodian, a reviewer, an applicant, a contractor or an administrator.
---

# Try the demo

A demo installation of Chiban runs the fictional Town of Alder Pond, with parcels, permits, inspections, board hearings and enforcement cases already in it. You can sign in, without an account, as someone who works in the town office or applies to it, and see the town from that seat.

## Signing in

Open the public demo at [demo.chiban.us/demo](https://demo.chiban.us/demo). On any other demo installation, the same page is at `/demo`. Each person on the page has a short note about what they do. Choose **Continue as** beside the one you want to be. To switch to someone else, go back to the page and choose again.

Every visitor shares these accounts, so you may see what someone else did a few minutes ago. If many people sign in from the same place in a short time, the page asks you to wait a few minutes before trying again.

## Who you can be

| Person | Seat | Start with |
| --- | --- | --- |
| Sam Clerk | Clerk at the counter | **Counter**: take a paper application, collect the fee and issue the permit. Then look at **Applications** and **Payments**. |
| Ira Inspector | Building inspector | **Inspections**, which opens on the day's scheduled inspections. Open one, record the result against its checklist and add a photo. Then look at **Enforcement**. |
| Fern Finance | Finance clerk | **Payments**: take a payment, refund or correct an entry, and run the money reports. |
| Rae Records | Town records custodian | Right-to-Know requests, redactions, holds and the retention schedule. |
| Remy Reviewer | Departmental reviewer | **Reviews**: the applications assigned to the department, where you record comments. |
| Robin Vale | Planning Board member | **Your board**: the packet for the next meeting and the applications in front of the board. |
| Drew Hale | Zoning Board member | **Your board**: the packet for the appeals and variances before the Zoning Board. |
| Alex Applicant | Applicant | **Your applications**: apply for a permit, add documents, pay a fee and follow the review. |
| Cory Contractor | Contractor | **Your contractor projects**: the projects that name Cory, and asking for an inspection. |
| Avery Admin | Administrator | **Settings**: forms, fee schedules, boards and staff. |

## What the demo holds back

Some changes would alter the demo for everyone who visits after you, so the demo refuses them and says: "The demo does not allow this, because it would change the demo for every visitor. It works in a real installation." Among them:

- changing a password, a display name or an authenticator app;
- inviting, disabling or changing the roles of staff;
- editing the town profile, the notification wording, the payment settings or the backup schedule;
- connecting a payment processor or a Microsoft account;
- starting a full data export or saving an export target.

Payments use a simulated processor. The checkout page and the counter card reader say on screen that no live processor is connected, and no money moves.

A notice on every page says that this is a demo, that mail is not delivered, and when the data resets. At that time the town goes back to its starting state, so nothing you do there lasts.

## Other roles

The demo page has no one who holds both the land use staff and inspector roles the way a building official does. A copy of Chiban set up for development has a second sign-in page, `/dev/sign-in`, that lists every Alder Pond user, among them Dana Booth, who holds both roles. The README at the top of the Chiban source code explains how to set up that copy.

To see what each role can open, read [how the staff roles fit together](./staff-roles.md).
