---
title: Writing a state pack
sidebar_label: Writing a state pack
description: How the New Hampshire pack is built and loaded, what each part of it holds, how packs are versioned, and what stands in the way of adding another state.
sidebar_position: 10
---

# Writing a state pack

This page is for a developer who wants to understand the New Hampshire pack, change it, or write a pack for another state. It uses `packs/nh` as the worked example. The people who use Chiban read the result on the pages about [deadlines and holidays](./new-hampshire/deadlines.mdx) and [starters](./new-hampshire/starters.mdx), which are generated from the pack.

## One pack, compiled in

Chiban ships one pack, `nh`, and loads it at build time. There is no setting that chooses a pack and no folder it scans. `loadPack()` imports `NH_PACK_MANIFEST` by name, and so do `packInfo()` and the holiday calendar. Outside the tests, 161 source files import from `@packs/nh/...`, and `@packs/*` is a path alias for the `packs` folder.

The schema also holds New Hampshire's vocabulary. The classification keys are a fixed list that begins `nh.`, a notice recipient can be `nh_des`, a proximity rule can only name the layer `water`, and a clock's consequence can be `selectmen_certification`. So a second state is not a second folder dropped beside `nh`. Today it is a fork or a change to the schema and the imports. Nothing in the repository has been run with a second pack, so the steps below describe what the code requires, not a path someone has walked.

## Layout of a pack

| Part | File in `packs/nh` | In the manifest |
| --- | --- | --- |
| Manifest | `manifest.ts` | It is the manifest |
| Rules | `rules/*.ts`, one file per area | Yes, `rules` |
| Proceeding classifications | `classifications.ts` | Yes, `classifications` |
| Building code editions | `codeEditions.ts` | Yes, `codeEditions` |
| Record series | `recordSeries.ts` | Yes, `recordSeries` and `recordSeriesDefaults` |
| Abutter parameters | `abutters/params.ts` | Yes, `abutterParams` |
| Holidays | `holidays.ts`, `countingCitations.ts` | No |
| Right-to-Know exemptions | `rtkExemptions.ts` | No |
| Starters | `starters/` | No |
| Board kinds | `boardKinds.ts`, `boardSchema.ts` | No |
| Parcel ID formats | `parcelIdFormats.ts` | No |
| Transitions | `transitions.ts` | No |

Parts marked No are not checked by the manifest schema. They have their own tests.

## The manifest and how it loads

```
export const NH_PACK_MANIFEST: PackManifest = {
  id: 'nh',
  version: '0.5.0',
  rules: [...],
  classifications: NH_CLASSIFICATIONS,
  codeEditions: NH_CODE_EDITIONS,
  recordSeries: NH_RECORD_SERIES,
  recordSeriesDefaults: RECORD_SERIES_DEFAULTS,
  abutterParams: [NH_ABUTTER_PARAMS],
}
```

The `rules` list is the spread of the arrays exported by the files under `rules/`. `loadPack()` parses the manifest with `PackManifestSchema` the first time anything asks for it, and keeps the result. A failure throws a `PACK_INVALID` error that lists every issue, so a bad pack stops the process instead of producing wrong deadlines. Besides the shape, the schema checks that no rule appears twice with the same key and version, and that every rule key a classification names exists.

`packs/nh/pack.test.ts` runs the same checks as a unit test, plus a rule that every non-town rule cites a URL.

## Rules

Each rule has a `key`, an integer `version`, a `label` and a `citation` with a label and a URL. A key that begins `town.` is a rule the town sets, and it cites "Town rule" with no URL. Every other rule must have a URL.

There are ten kinds of rule: `clock`, `gate`, `list_age`, `proximity`, `required_record`, `effect`, `town_setting`, `notice_requirement`, `cease_and_desist` and `civil_penalty`. A clock is the one that does the most work. This one is the building permit decision deadline:

```
{
  kind: 'clock',
  key: 'nh.bp.decision',
  version: 1,
  label: 'Building permit decision deadline',
  citation: { label: 'RSA 155-A:4 IX', url: RSA_155A_4 },
  clockType: 'action_due',
  whose: 'official',
  startEvent: 'application_completed',
  length: {
    unit: 'days',
    cases: [
      { when: { fact: 'classification', in: ['nonresidential'] }, value: 60 },
      { when: { fact: 'dwellingUnits', gt: 10 }, value: 60 },
    ],
    otherwise: 30,
  },
  direction: 'after',
  consequence: {
    kind: 'none_stated',
    text: 'RSA 155-A:4 IX states no consequence for a missed deadline. The application shows as overdue.',
  },
  extension: { allowed: false, note: 'RSA 155-A:4 IX provides no extension.' },
  waivable: false,
  overridePolicy: { policy: 'fixed' },
}
```

A clock names the event that starts it (`startEvent`, one of a fixed list), how long it runs (days, months or business days, a stated date, a length that depends on facts about the application, or a length read from a town setting), whether it counts `after` or `before` the event, what happens if it is missed, whether it can be extended or waived, and `overridePolicy`, which says what a town may change:

| Policy | Meaning |
| --- | --- |
| `fixed` | The town cannot change it. |
| `minimum` | The town may only go above the `floor`. |
| `maximum` | The town may only go below the `ceiling`. |
| `delegated_choice` | The law leaves the value to the town, with a `default` and an optional `range`. |
| `locally_prohibited` | The town cannot use it. |

A value that differs from the pack's needs an adopting authority and an adoption date recorded with it. A direction of `before` is allowed only for `notice_lead` and `filing_window` clocks.

A town setting and the clock that reads it work as a pair. `town.bp.validity` is a `town_setting` in months with a `delegated_choice` default of 12. `town.bp.expiration` is a clock whose length is `{ unit: 'months', fromSetting: 'town.bp.validity' }`. The town changes the first under **Settings**, **Town rule settings**, and the whole set of rules appears under **Settings**, **State law**.

## Classifications and boards

A classification ties an application type to the law that governs it. Each one has a key, a label, the rule keys that are mandatory for it, the `boardKind` that hears it or null, the `abutters` specification, the notice requirement keys, any required sub-steps, whether direct issue is allowed, and a text on appeal rights. An application type picks its classification with the `classification` field, and the board kind follows from it.

The abutter specification names a strategy key and a resolver key, the recipient roles every notice goes to, and roles added only when a fact is true, such as a project of regional impact. The strategy and resolver are code in `packs/nh/abutters`, not data. `abutters/params.ts` holds the numbers that code uses, such as the 50-foot capture radius that RSA 672:3 sets. Its `tolerancesLabel` says that the other tolerances are Chiban's engineering choices.

Board kinds are a fixed list in `boardKinds.ts`: Planning Board, Zoning Board of Adjustment and seven others. `boardSchema.ts` gives each kind its traits: whether it decides applications, holds hearings, has a filing lead time, and whether a town may have only one. The board application starters in `starters/boards` are the permit types each deciding board hears.

## Holidays and counting

`holidays.ts` exports `nhLegalHolidays(year)`, which returns each holiday's date, name and citation. The list is the legal holidays of RSA 288:1, a holiday on a Sunday observed on the Monday after it under RSA 288:2, and biennial election day in even years. An optional map overrides Thanksgiving for a given year. `src/features/packs/holidays.ts` turns the function into the calendar that deadline arithmetic uses. `countingCitations.ts` names the statute for the way days are counted. The counting itself is in `src/features/clocks`, not in the pack.

## Record series

A record series is a class of record with a retention rule. Each has a key, a version, a label, a citation with a URL, a `retention`, and a `preservation` of `pdfa` or `original`. Retention is `permanent`, a `duration` in years, or an `event` list with years added, where the events come from a fixed list such as `application_withdrawn` or `building_removed`. A series can point to others for the outcomes withdrawn, denied or expired.

`recordSeriesDefaults` maps a classification key, or an application type prefix, to the series its records are filed under.

## Right-to-Know exemptions

`rtkExemptions.ts` lists the statutory exemptions a custodian may cite when withholding a record: a key of the form `nh.rtk.91a5.<paragraph>`, the paragraph, a label and a citation. A further key, `other_law`, covers an exemption found in another statute. The records screens and the response letter read this list. The deadlines for answering a request are ordinary clock rules in `rules/rightToKnow.ts`.

## Starters

A starter is a complete application type in one object: the application type, its form, fee schedule, condition library, inspection checklists and letter templates. `starters/index.ts` lists them in `NH_STARTERS`, and each has an `id` and an integer `version`. A town adopts a starter from **Settings**, **Starter templates**, which copies each member into the town's own configuration. Nothing is shared afterward, so changing a starter reaches a town only when its administrator accepts the update. `starters/starters.test.ts` checks every starter against the schemas for each of its parts, and against the pack's rules.

## Parcel ID formats

`parcelIdFormats.ts` lists two formats, `cama15`, the 15-digit CAMA number, and `gis12`, the 12-digit map-lot ID that is shown on screen. A format has a key, a label, a kind, a width, whether it is the display one and an example. The list is used by the demo seed and by tests. A live database gets its formats from migration `0105_nh_parcel_id_formats.sql`, and a town edits them under **Settings**, **Parcel ID formats**. Changing the TypeScript list does not change an existing installation.

## Versioning

Versions exist at four levels.

- The pack: `version` in the manifest is a string. Each clock and each enforcement answer records the pack version it was made under. It appears in the archive of a town's export, in `/api/version`, and on the **State law** page as "Jurisdiction pack nh version 0.5.0, fingerprint" followed by the first 12 characters of a SHA-256 hash of the whole manifest.
- A rule: When a rule's content must change, add a new `version` of the same key and keep the old one. `ruleByKey` returns the highest version unless a caller asks for one. A clock records the rule key and version it started under.
- A transition: To act on clocks already running, declare a transition in `transitions.ts`, with a rule key, the from and to versions, a policy of `keep_old` or `switch`, and a reason. An operator previews and applies it with the `rules-migrate` command. See [upgrading](../operations/upgrading.md).
- Starters, record series and abutter parameters: Each carries its own integer `version`.

## Steps for a new pack

1. Copy the folder and rename its prefixes, so the keys carry the new state's prefix.
2. Replace the classification key list in `boardSchema.ts` and anything in the schema that is specific to New Hampshire.
3. Write the rules, one area at a time, with a URL for each citation, and run `packs/nh/pack.test.ts` after each.
4. Write the classifications and abutter parameters.
5. Write the holidays and the counting citation.
6. Write the record series and their defaults.
7. Write the exemption list for the state's public records law.
8. Write the starters and run the starter test.
9. Point `loadPack`, `packInfo`, the holiday calendar and the other 160 or so imports at the new pack.
10. Run `pnpm docs:generate` to see the deadlines and starter pages the new pack produces. The generators in `scripts/docsSite` are named for New Hampshire and read it directly.

Step 9 is the one that has no support in the code today.
