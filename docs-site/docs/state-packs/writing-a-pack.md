---
title: Writing a state pack
sidebar_label: Writing a state pack
description: How a state pack is built and chosen at run time, what each part of the New Hampshire pack holds, how roles tie its keys to engine features, and how packs are versioned.
sidebar_position: 10
---

# Writing a state pack

This page is for a developer who wants to understand or change the New Hampshire pack, or write one for another state, with `packs/nh` as the worked example. Staff read the result on the pages about [deadlines and holidays](./new-hampshire/deadlines.mdx) and [starters](./new-hampshire/starters.mdx), which are generated from the pack.

## How a pack is chosen

A pack is a TypeScript module that exports one `StatePack` object. The interface lives in the engine, in `src/features/packs/schema/statePack.ts`, and `packs/nh/index.ts` exports New Hampshire's as `NH_PACK`.

`src/features/packs/registry.ts` holds a fixed map from pack id to pack, which today is `{ nh: NH_PACK }`. `activePack()` reads the `CHIBAN_PACK` setting the first time anything asks for the pack and keeps the answer. The setting is read when the server, the worker or a command-line tool runs, not when the image is built, so the same image can serve another state. A blank or missing setting means `nh`. Pages in the browser never read the setting: the server reads the pack and sends them the wording they show. An id that is not in the map stops the first request that needs the pack with a `PACK_INVALID` error. A pack still has to be compiled into the image and listed in the registry map before `CHIBAN_PACK` can name it.

Everything the engine reads from a pack goes through the registry: `loadPack()`, `packInfo()`, the holiday calendar, the starters, the license types, the exemption list, the appeal routes and the rest. Outside `packs/nh`, the only files that import `@packs/nh` are the registry, `src/features/packs/registryAbutters.ts` and test support. The demo seed reads the active pack like the rest of the engine. A unit test, `packCoupling.test.ts`, fails the build if any other file imports the pack or names a key that begins `nh.`, with the field probes in `src/features/packs/probes` also exempt because they exercise New Hampshire rules on purpose. Tests load another pack with `withPackForTest(pack, run)` or `setActivePackForTest(pack)`, and `src/test/packs/xx` holds a small fictional pack for that purpose.

The abutter strategy and resolver are code that runs against the database, so they are kept out of the registry, which loads wherever pack data is needed. `registryAbutters.ts` imports every pack's abutter code for its side effect of registering the strategy and resolver keys a classification names.

## Roles

The engine needs to know which of a pack's keys plays a part it has code for: which classification is the building permit, which clock is the building permit decision deadline, which record series a complaint photo is filed under. The manifest's `roles` object says so. It has five sections.

| Section | What a role names |
| --- | --- |
| `classifications` | A classification key, such as `buildingPermit`, or a list, such as `enforcement` |
| `rules` | A rule key, such as `buildingPermitDecision` or `appealSuspension` |
| `recordSeries` | A record series key, such as `complaintLog`, or a list, such as `publicParcelFiles` |
| `ruleGroups` | A list of rule key prefixes ending in a dot, or whole keys, such as `building: ['nh.bp.']` |
| `gates` | The key of a gate the engine defines but the pack names, such as `abutterListFresh` |

Roles that every state's permitting needs are required: the zoning cease and desist order rule, the two Right-to-Know response clocks and the record series for request letters, complaint photos and enforcement papers. Every other role can be `null`. Most of them are features New Hampshire law has and another state may not, such as regional impact, the DES 500-foot notice, the ZBA exercise period, the abutter list age, the Planning Board filing lead time, the appeal suspension and the administrative appeal to the ZBA. A `null` role means the feature is absent: its gate is not registered, its panel, step or check does not appear, and no clock is looked for. The fictional pack sets every optional role to `null`.

A pack for a state that issues no statewide building permit, or that leaves the building code to each town, can null the building roles too: `buildingPermit`, `buildingPermitDecision` and `buildingCodeOrder`. With `buildingPermit` null, no classification counts as the building permit, so the checks that depend on one are skipped. With `buildingPermitDecision` null, no decision deadline is started for a building permit. With `buildingCodeOrder` null, no case can take a building code finding, a cease and desist order for a building code violation cannot be drafted or issued, and the finding form and the town section list leave out the building code kind. Staff who try see that the town enforces no building code.

A state that has the role gets the same result on new cases when a town publishes a building program with no code (see [Building codes and the town building program](#building-codes-and-the-town-building-program)). A case opened before that version keeps building code findings, drafting and issuing, so work already under way can finish. A case opened after it gets the refusals above. If the town publishes no code several times in a row, for example to change its number of residents, the first of those versions is the one that counts.

When a pack has no regional impact rules at all, meaning `regionalImpactGate`, `regionalImpactComment`, `regionalImpactDetermination` and `regionalImpactTransmittal` are all null, a board application goes to its hearing without a regional impact determination. The notice checklist adds no regional recipients.

The manifest schema checks that every rule role names a rule in the pack, every classification role a classification, every record series role a series, and every rule group entry at least one rule. A unit test, `roleConsumers.test.ts`, fails if a role is declared in `src/features/packs/schema/roles.ts` and no engine code outside `packs` and the tests reads it.

Roles do not rename anything. The stored keys stay as they are, because clocks, gate overrides and enforcement orders record them in the database.

Some engine vocabulary still carries New Hampshire names because it is stored: the notice recipient role `nh_des`, the clock consequence `selectmen_certification`, the conditions `des_within_500ft` and `regional_impact_yes`, and the proximity layer `water`. The stored names stay. Where one of them would show a New Hampshire name on screen, the words come from the pack instead: `StatePack.labels` names the state's environmental agency, which is what the `nh_des` recipient and the DES notice show, and the label for a state license number.

## Layout of a pack

| Part | File in `packs/nh` | In the manifest |
| --- | --- | --- |
| Manifest | `manifest.ts` | It is the manifest |
| Rules | `rules/*.ts`, one file per area | Yes, `rules` |
| Proceeding classifications | `classifications.ts` | Yes, `classifications` |
| Building code editions | `codeEditions.ts` | Yes, `codeEditions` |
| Record series | `recordSeries.ts` | Yes, `recordSeries` and `recordSeriesDefaults` |
| Abutter parameters | `abutters/params.ts` | Yes, `abutterParams` |
| Roles | `roles.ts` | Yes, `roles` |
| Holidays | `holidays.ts`, `countingCitations.ts` | No |
| Right-to-Know exemptions | `rtkExemptions.ts` | No |
| Starters | `starters/` | No |
| Board kind names | `boardSchema.ts` | No |
| Parcel ID formats | `parcelIdFormats.ts` | No |
| Transitions | `transitions.ts` | No |
| Order wording | `starters/enforcementTemplates.ts` | No |
| Rule areas for the docs | `ruleAreas.ts` | No |
| The pack object | `index.ts` | No, it holds the manifest |

Parts marked No are not checked by the manifest schema. They have their own tests. All of them reach the engine through the `StatePack` object.

## The manifest and how it loads

```
export const NH_PACK_MANIFEST: PackManifest = {
  id: 'nh',
  version: '0.7.0',
  rules: [...],
  classifications: NH_CLASSIFICATIONS,
  codeEditions: NH_CODE_EDITIONS,
  recordSeries: NH_RECORD_SERIES,
  recordSeriesDefaults: RECORD_SERIES_DEFAULTS,
  abutterParams: [NH_ABUTTER_PARAMS],
  roles: NH_ROLES,
}
```

The `rules` list is the spread of the arrays exported by the files under `rules/`. `loadPack()` parses the active pack's manifest with `PackManifestSchema` the first time anything asks for it, and keeps the result. A failure throws a `PACK_INVALID` error that lists every issue, so a bad pack stops the process instead of producing wrong deadlines. Besides the shape, the schema checks that no rule appears twice with the same key and version, that every rule key a classification names exists, and that every role names something the pack has.

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

## Building codes and the town building program

`StatePack.buildingCodes` lists the codes a town in the state may enforce.

```
buildingCodes: {
  choices: [
    { key: 'xx.code.a', label: 'Vellmora Code A' },
    { key: 'xx.code.b', label: 'Vellmora Code B' },
  ],
  defaultChoice: 'xx.code.a',
  requiredAbove: { residents: 4000, choice: 'xx.code.b' },
}
```

`choices` is the list a town picks from. `defaultChoice` is what a town has before it sets anything, and may be `null` for a state where no code applies until the town picks one. `requiredAbove` is for a state whose law requires a given code once a town passes a population. Leave it `null` if there is no such rule. In the example, a town that sets its residents above 4000 must choose `xx.code.b`, and the editor will not publish anything else. The registry refuses a pack whose `defaultChoice` or `requiredAbove.choice` is not one of its `choices`.

Each town sets its side under **Settings**, in the building program: whether the town issues building permits at all, which code it enforces, and its number of residents. Turning permits off closes intake for the building permit classification only. Other application types stay open. Choosing no code stops building code findings and orders on enforcement cases opened from then on, as described under [Roles](#roles).

An application records the code choice that was in force when it was submitted, and the town's later changes do not reach it. Turning permits off does not change what is recorded, so an application type bound to the code edition gate still needs a code edition record before it is issued. An application submitted before applications recorded a code choice counts as submitted under the pack's `defaultChoice`.

## Classifications and boards

A classification ties an application type to the law that governs it. Each one has a key, a label, the rule keys that are mandatory for it, the `boardKind` that hears it or null, the `abutters` specification, the notice requirement keys, any required sub-steps, whether direct issue is allowed, and a text on appeal rights. An application type picks its classification with the `classification` field, and the board kind follows from it.

The abutter specification names a strategy key and a resolver key, the recipient roles every notice goes to, and roles added only when a fact is true, such as a project of regional impact. The strategy and resolver are code in `packs/nh/abutters`, not data. `abutters/params.ts` holds the numbers that code uses, such as the 50-foot capture radius that RSA 672:3 sets. Its `tolerancesLabel` says that the other tolerances are Chiban's engineering choices.

Abutter parameters may also carry `townBuffer`, for a state where a town may widen the notice area by a distance:

```
townBuffer: { defaultFt: 100, maxFt: 300 }
```

`maxFt` is the most the law lets a town set. `defaultFt` is what applies when the board has not set a distance, and may be `null` for no extra distance. A board then sets `abutters.bufferFt` in its board settings, and the settings are refused above `maxFt`. A pack that leaves `townBuffer` out counts abutters by adjacency alone, and a board setting for the distance is refused.

One rule applies to every pack. A clock whose `overridePolicy.policy` is `delegated_choice` must take its length from a town setting with `length.fromSetting`. The manifest check names any such clock that uses a fixed length and stops the pack from loading.

Board kinds are a fixed list in the engine: Planning Board, Zoning Board of Adjustment and seven others. What each kind does, whether it decides applications, holds hearings, has a filing lead time, and whether a town may have only one, is engine behaviour in `src/features/boards/boardKindBehaviour.ts`. The pack's `boardSchema.ts` gives each kind its `label`, `defaultShortName`, `shortLabel`, `abbreviation` and `description`. The board application starters in `starters/boards` are the permit types each deciding board hears.

## Holidays and counting

`holidays.ts` exports `nhLegalHolidays(year)`, which returns each holiday's date, name and citation. The list is the legal holidays of RSA 288:1, a holiday on a Sunday observed on the Monday after it under RSA 288:2, and biennial election day in even years. An optional map overrides Thanksgiving for a given year. `src/features/packs/holidays.ts` turns the function into the calendar that deadline arithmetic uses. `countingCitations.ts` names the statute for the way days are counted. The counting itself is in `src/features/clocks`, not in the pack.

## Record series

A record series is a class of record with a retention rule. Each has a key, a version, a label, a citation with a URL, a `retention`, and a `preservation` of `pdfa` or `original`. Retention is `permanent`, a `duration` in years, or an `event` list with years added, where the events come from a fixed list such as `application_withdrawn` or `building_removed`. A series can point to others for the outcomes withdrawn, denied or expired.

`recordSeriesDefaults` maps a classification key, or an application type prefix, to the series its records are filed under.

## Right-to-Know exemptions

`rtkExemptions.ts` lists the statutory exemptions a custodian may cite when withholding a record: a key of the form `nh.rtk.91a5.<paragraph>`, the paragraph, a label and a citation. A further key, `other_law`, covers an exemption found in another statute. The records screens and the response letter read this list. The deadlines for answering a request are ordinary clock rules in `rules/rightToKnow.ts`.

## Starters

A starter is a complete application type in one object: the application type, its form, fee schedule, condition library, inspection checklists and letter templates. `starters/index.ts` lists them in `NH_STARTERS`, and each has an `id` and an integer `version`. A town adopts a starter from **Settings**, **Starter templates**, which copies each member into the town's own configuration. Nothing is shared afterward, so changing a starter reaches a town only when its administrator accepts the update. `starters/starters.test.ts` checks every starter against the schemas for each of its parts, and against the pack's rules.

## Labels, spatial reference and docs folder

`StatePack.labels` holds the words and citations the engine shows on screen so that no state's names are written into engine code. Besides the environmental agency names and the license number label, it has `recordsLaw`, the short name of the public records law, `recordsRequest`, what a request under it is called, and `governingBody`, the town's elected body. A pack for a state with a different records law would write `recordsLaw: 'Open Records'`, `recordsRequest: 'open records request'` and `governingBody: 'town council'`. Its `citations` object has `exerciseFloorAuthority`, the statute for the minimum period a board approval stays valid, and `abutterListIssued`, a label and a URL, or `null` for the URL, for the authority behind the abutter list.

`StatePack.spatial` names the projected coordinate system the state's parcel work uses: `projectedSrid`, the EPSG number, and a `label`. Abutter distances, in feet, are measured in this system, so it must be one whose unit is the US survey foot, such as `{ projectedSrid: 3437, label: 'NAD83 / New Hampshire (ftUS)' }`.

`StatePack.docsSlug` is the folder name the generated state pages are written to. The generator puts them in `docs-site/docs/state-packs/<docsSlug>/_generated`, so a pack with `docsSlug: 'vellmora'` produces its pages next to the New Hampshire ones and does not overwrite them.

## Parcel ID formats

`parcelIdFormats.ts` lists two formats, `cama15`, the 15-digit CAMA number, and `gis12`, the 12-digit map-lot ID that is shown on screen. A format has a key, a label, a kind, a width, whether it is the display one and an example. The list is used by the demo seed and by tests. When migrations finish, the migration command installs the active pack's formats if none of them is in the database yet, which is the case on a fresh install or after a switch to another pack. It also removes the two New Hampshire defaults, `cama15` and `gis12`, when the active pack does not list them and nothing uses them. Once any of the pack's formats is in the database, the command adds nothing, so a format a town deleted stays deleted. A town edits its formats under **Settings**, **Parcel ID formats**. A format added to the TypeScript list later does not reach a town that already has the pack's formats. The town adds it there.

## Versioning

Versions exist at four levels. Adding fields to the manifest or the `StatePack` object raises the contract version, which each pack's manifest carries as its `version`. The contract is at 0.7.0.

- The pack: the manifest's `version` in the manifest is a string. Each clock and each enforcement answer records the pack version it was made under. It appears in the archive of a town's export, in `/api/version`, and on the **State law** page as "Jurisdiction pack nh version 0.7.0, fingerprint" followed by the first 12 characters of a SHA-256 hash of the whole manifest.
- A rule: when a rule's content must change, add a new `version` of the same key and keep the old one. `ruleByKey` returns the highest version unless a caller asks for one. A clock records the rule key and version it started under.
- A transition: to act on clocks already running, declare a transition in `transitions.ts`, with a rule key, the from and to versions, a policy of `keep_old` or `switch`, and a reason. An operator previews and applies it with the `rules-migrate` command. See [upgrading](../operations/upgrading.md).
- Starters, record series and abutter parameters: each carries its own integer `version`.

## Steps for a new pack

1. Copy the folder, rename its prefixes so the keys carry the new state's prefix, and rename `NH_PACK`.
2. Replace the classification key list in `boardSchema.ts` and the board kind names.
3. Write the rules, one area at a time, with a URL for each citation, and run the pack's tests after each.
4. Write the classifications and abutter parameters.
5. Fill in `roles`. Name a key for each required role, and set an optional role to `null` where the state has no such rule. Fill in `buildingCodes`, `spatial`, `labels` and `docsSlug` on the pack object.
6. Write the holidays and the counting citation.
7. Write the record series and their defaults.
8. Write the exemption list for the state's public records law.
9. Write the starters and run the starter test.
10. Add the pack to the map in `src/features/packs/registry.ts`, and its abutter code to `registryAbutters.ts`, then set `CHIBAN_PACK` to its id. The compose file in `deploy` passes `CHIBAN_PACK` through to the containers, so setting it in the environment or the `.env` next to the compose file is enough.
11. Run `pnpm docs:generate` to see the deadlines and starter pages the active pack produces.

The pack contract covers what New Hampshire needs. A state whose law needs a rule kind the schema does not have, a clock that starts on an event the engine does not record, a recipient role or condition the engine does not know, or a feature with no role, still needs engine work before its pack can express it. The generated docs are written to the folder named by `docsSlug`, and the abutter strategy and resolver are code a pack has to provide.
