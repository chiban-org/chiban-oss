---
slug: /
title: What Chiban is
description: Land use software for a small town office, organized around the parcel.
---

# What Chiban is

Chiban is land use software for a small town office. It keeps building and trade permits, inspections, Planning Board and Zoning Board of Adjustment applications, and code enforcement in one place, and it files each of them under the parcel it concerns. Open a parcel and one page shows who notices go to, what is open on the lot, the permits and approvals in force, the next inspection, any open enforcement case, and the parcel's record and history.

These pages are for the people who use it: clerks at the counter, building inspectors, planning and zoning staff, board secretaries, records custodians and finance staff. The [self-hosting and operations](./operations/self-hosting.md) pages are for whoever runs the server.

## What the office does in Chiban

Residents and contractors can apply online, and staff can enter a paper application at the counter, take the fee and issue the permit in the same visit. Each application type has a fee schedule, so the fee is worked out from the answers on the form. Staff can waive or change a fee, with a recorded reason.

Inspectors take requests, book times, record results against a checklist and attach photos.

For board applications, staff draw abutter lists, send notices, schedule meetings, build board packets, record votes and file written decisions. Chiban starts the deadlines state law sets, such as the 65 days the Planning Board has to decide an accepted application, and shows which ones are coming due and which are overdue.

Enforcement cases start from a complaint. Staff record findings, issue cease and desist orders, and follow the case through answers, court and appeals.

The records custodian logs Right-to-Know requests, redacts documents, and keeps the retention schedule and legal holds. Reports on permit volume, processing time and revenue, and the daily cash receipts report, are built in.

## What residents see

The town's public site lets anyone look up a parcel and its public records, read meeting and hearing notices, apply for a permit and report a problem. Applicants and contractors sign in with a link sent by email, so they have no password to forget. Once signed in, they can follow their applications, add documents, pay fees and ask for inspections.

## The town keeps its data

The town's records can be exported at any time as one archive in open formats: plain text, CSV and an Excel workbook, with every stored document and a PDF/A copy of each PDF. The archive opens without Chiban. See [the export archive format](./reports-and-export/export-format.md) and [monthly export to storage the town controls](./reports-and-export/incremental-export.md).

## State law comes in a state pack

The deadlines, notice rules, holidays and starter permit types that depend on state law live in a state pack. Chiban ships with a New Hampshire pack. Its [starter catalog](./state-packs/new-hampshire/starters.mdx) lists the permit and board application types a town can adopt, and [deadlines and holidays](./state-packs/new-hampshire/deadlines.mdx) lists every deadline it tracks.

## Open source

Chiban is open-source software under the AGPL-3.0 license. Every example in these pages uses the fictional Town of Alder Pond, the same town the demo shows.

## Where to go next

- [Try the demo](./start-here/try-the-demo.md) to see Chiban from each seat in the office.
- [How the staff roles fit together](./start-here/staff-roles.md) explains who does what.
- [Loading owners from the assessing file](./moving-in/cama-import.md) and [loading an old permit ledger](./moving-in/spreadsheet-migration.md) cover moving your existing records in.
