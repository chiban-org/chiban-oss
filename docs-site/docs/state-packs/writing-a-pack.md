---
title: Writing a state pack
sidebar_label: Writing a state pack
description: How a state pack is built and chosen at run time, what each part of a pack holds, how roles tie its keys to engine features, which features a pack can switch on, and how packs are versioned.
sidebar_position: 10
---

# Writing a state pack

This page is for a developer who wants to understand or change a state pack, or write one for another state. `packs/nh` is the worked example. `packs/me`, the Maine pack, is a second complete pack, and it switches on most of the features New Hampshire leaves off. Staff read the result on the generated pages for each state: [New Hampshire deadlines](./new-hampshire/deadlines.mdx) and [starters](./new-hampshire/starters.mdx), [Maine deadlines](./maine/deadlines.mdx) and [starters](./maine/starters.mdx). Whoever installs the server picks the pack as [choosing a state pack](./choosing-a-pack.md) describes.

## How a pack is chosen

A pack is a TypeScript module that exports one `StatePack` object. The interface lives in the engine, in `src/features/packs/schema/statePack.ts`, and `packs/nh/index.ts` exports New Hampshire's as `NH_PACK`.

`src/features/packs/registry.ts` holds a fixed map from pack id to pack, which today is `{ nh: NH_PACK, me: ME_PACK }`. `activePack()` reads the `CHIBAN_PACK` setting the first time anything asks for the pack and keeps the answer. The setting is read when the server, the worker or a command-line tool runs, not when the image is built, so the same image can serve another state. A blank or missing setting means `nh`. Pages in the browser never read the setting: the server reads the pack and sends them the wording they show. An id that is not in the map stops the first request that needs the pack with a `PACK_INVALID` error. A pack still has to be compiled into the image and listed in the registry map before `CHIBAN_PACK` can name it.

Everything the engine reads from a pack goes through the registry: `loadPack()`, `packInfo()`, the holiday calendar, the starters, the license types, the exemption list, the appeal routes and the rest. Outside the pack folders, the only files that import `@packs/nh` or `@packs/me` are the registry, `src/features/packs/registryAbutters.ts`, test support and the demo seed in `src/features/demo`, whose Maine story names Maine keys. The rest of the demo seed reads the active pack like the rest of the engine. A unit test, `packCoupling.test.ts`, fails the build if any other file in `src` or `scripts` imports a pack or names a key that begins `nh.` or `me.`. The field probes in `src/features/packs/probes` are also exempt, because they exercise pack rules on purpose. A second test, `vocabularyCoupling.test.ts`, fails when an engine file writes a New Hampshire or Maine term, such as "ZBA" or "FOAA", that belongs behind a pack label. Tests load another pack with `withPackForTest(pack, run)` or `setActivePackForTest(pack)`, and `src/test/packs/xx` holds a small fictional pack for that purpose.

The abutter strategy and resolver are code that runs against the database, so they are kept out of the registry, which loads wherever pack data is needed. `registryAbutters.ts` imports every pack's abutter code for its side effect of registering the strategy and resolver keys a classification names.

## Roles

The engine needs to know which of a pack's keys plays a part it has code for: which classification is the building permit, which clock is the building permit decision deadline, which record series a complaint photo is filed under. The manifest's `roles` object says so. It has five sections.

| Section | What a role names |
| --- | --- |
| `classifications` | A classification key, such as `buildingPermit`, or a list, such as `enforcement` |
| `rules` | A rule key, such as `buildingPermitDecision` or `appealSuspension` |
| `recordSeries` | A record series key, such as `complaintLog`, or a list, such as `publicParcelFiles` |
| `ruleGroups` | A list of rule key prefixes ending in a dot, or whole keys, such as `building: ['nh.bp.']` |
| `gates` | The key of a gate the engine defines but the pack names, such as `abutterListFresh` or `varianceRecorded` |

Roles that every state's permitting needs are required: the two public records response clocks and the record series for request letters, complaint photos and enforcement papers. Every other role can be `null`. Most of them are features New Hampshire law has and another state may not, such as regional impact, the DES 500-foot notice, the ZBA exercise period, the abutter list age, the Planning Board filing lead time, the appeal suspension and the administrative appeal to the ZBA. A `null` role means the feature is absent: its gate is not registered, its panel, step or check does not appear, and no clock is looked for. The fictional pack sets every optional role to `null`.

A pack for a state that issues no statewide building permit, or that leaves the building code to each town, can null the building roles too: `buildingPermit`, `buildingPermitDecision` and `buildingCodeOrder`. With `buildingPermit` null, no classification counts as the building permit, so the checks that depend on one are skipped. With `buildingPermitDecision` null, no decision deadline is started for a building permit.

Whether a case can take a building code finding depends on the pack's building codes, not on `buildingCodeOrder`. With `buildingCodes.choices` empty, no case can take one, and the finding form and the town section list leave out the building code kind. Staff who try see that the town enforces no building code. With choices present and `buildingCodeOrder` null, staff can record the finding but cannot draft an order for it (see [Enforcement without a statutory order](#enforcement-without-a-statutory-order)).

A town in a state with building code choices gets the same refusal on new cases when it publishes a building program with no code (see [Building codes and the town building program](#building-codes-and-the-town-building-program)). A case opened before that version keeps building code findings, drafting and issuing, so work already under way can finish. A case opened after it gets the refusals above. If the town publishes no code several times in a row, for example to change its number of residents, the first of those versions is the one that counts.

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
| Public records exemptions | `rtkExemptions.ts` | No |
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
  version: '0.10.0',
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

There are twelve kinds of rule: `clock`, `gate`, `list_age`, `proximity`, `required_record`, `effect`, `town_setting`, `notice_requirement`, `cease_and_desist`, `civil_penalty`, `decision_delivery` and `cure_notice`. The last two, and the newer clock consequences and start events, are covered under [Legal features a pack can switch on](#legal-features-a-pack-can-switch-on). A clock is the one that does the most work. This one is the building permit decision deadline:

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

## Legal features a pack can switch on

Contract 0.8.0 added features that New Hampshire does not use. A pack for another state turns each one on by writing the rule, field or role described here. The New Hampshire pack leaves them all off, so its behaviour is unchanged, and the Maine pack uses most of them. The examples use the fictional state of Vellmora. The features contract 0.9.0 added follow under [Features added in contract 0.9.0](#features-added-in-contract-090), and those of contract 0.10.0 under [Features added in contract 0.10.0](#features-added-in-contract-0100).

### Silence and recording consequences on a clock

A clock's `consequence.kind` has two more values. Both require `clockType: 'action_due'`, and the manifest refuses the pack otherwise.

`deemed_refused` is for a law that treats an application as refused when the board does not act by the date. The clock is met only when staff record a written decision notice for the application, with a mailing date and the notice document. A notice can be recorded only once the application is decided, issued or denied, a refusal by silence included. Before that the application page shows no form and recording is refused. The daily job refuses an application that is still undecided after the due date, and the applicant's portal says "Refused by operation of law". The refusal is dated the day after the due date, even when the job runs later. It adds a system administrative decision on that date with the outcome `denied`, so an appeal route with `when.outcome: 'denied'` applies to it. An application that was already decided or issued is not changed. It is flagged on the application page as owing a notice. A clock with this consequence no longer counts as an ordinary decision deadline for the workflow, but the portal still shows its date.

`void_unless_recorded` is for an approval that lapses unless its certificate is recorded at the registry. The clock starts when staff record the final written approval, and recording on or before the due date meets it. After the due date the daily job lapses the clock. It does not change the application's state.

```
{
  kind: 'clock',
  key: 'xx.variance.notice',
  version: 1,
  label: 'Written decision notice',
  citation: { label: 'Vellmora Code 12.4', url: VELLMORA_12_4 },
  clockType: 'action_due',
  whose: 'board',
  startEvent: 'application_completed',
  length: { unit: 'days', otherwise: 45 },
  direction: 'after',
  consequence: { kind: 'deemed_refused', text: 'An application with no written notice by the due date is refused.' },
  extension: { allowed: false, note: 'No extension.' },
  waivable: false,
  overridePolicy: { policy: 'fixed' },
}
```

### Clock fields and start events

A clock rule may set `cancelledBy`, a start event. When that event happens on an application, a running or overdue clock of this rule is superseded with the reason `cancelled_by_event`, and the rules that start on the event begin. Since contract 0.9.0, `cancelledBy` may also be `{ event, onlyWhen }`, which cancels only when the facts in `onlyWhen` hold at that event (see [Conditions on a clock](#conditions-on-a-clock)). A clock rule may also set `satisfiedByDecision: true`, which means recording the board's decision meets the clock without any other step.

Together they describe a deadline that depends on whether a hearing was held. One clock runs from the application and is cancelled by `hearing_held`. A second clock starts on `hearing_held`. The decision meets whichever of the two is live when the board decides.

Four start events are new:

| Start event | Set when |
| --- | --- |
| `hearing_held` | Staff mark a hearing held, on the day it was held. |
| `final_written_approval` | Staff record the date of the final written approval on a decision whose classification has `recordingRequired`. |
| `cure_notice_sent` | Staff send a cure notice. |
| `project_final_approval` | A decision is declared the last municipal approval the project needs. |

### Decision delivery

A `decision_delivery` rule makes the engine track who receives a board's decision, and how.

```
{
  kind: 'decision_delivery',
  key: 'xx.delivery',
  version: 1,
  label: 'Delivery of the decision',
  citation: { label: 'Vellmora Code 12.6', url: VELLMORA_12_6 },
  boardKinds: ['zba'],
  recipients: ['applicant', 'agent', 'municipal_officers'],
  methods: ['mail', 'hand'],
  dueRuleKey: 'xx.delivery.due',
  overridePolicy: { policy: 'fixed' },
}
```

`recipients` come from `applicant`, `agent`, `planning_board` and `municipal_officers`. `methods` are `mail` and `hand`. `dueRuleKey` names an `action_due` clock that starts on `board_vote`. The decision page lists each recipient with a method and a date. The clock is met when every recipient has a recorded delivery. A decision in an appeal chain gets its own group in the same list. Each decision starts its own due clock, keyed by its vote or decision date, even while an earlier decision's delivery clock is still running, and each group shows the due date of its own clock.

### Hearing optional and recording

A classification's `hearing` is `required` or `optional`, and defaults to `required`. When it is `optional`, a board may decide an application at a past meeting with no hearing, and the decision page offers "Record a decision without a hearing". Set `hearing: 'required'` explicitly on every classification in a pack that does not use the feature.

`recordingRequired: true` on a classification turns on the final written approval and the registry certificate on its decisions. It defaults to `false`.

### Notices due on receipt

A notice requirement's `stage` is `before_hearing` (the default) or `on_receipt`. A receipt notice is prepared when the application arrives, not when a hearing is scheduled. Its lead clock must count `after` from `application_received`, or the manifest refuses the pack. Staff prepare the set from a panel on the application, and the lead clock is met when every item is proved on time. The set remembers the abutter list it came from. When a different list is issued later, for example after staff change the municipalities or the water supplier, the panel says the notices are out of date and offers to prepare them again. The old set stays on the record with its proofs, the new set starts with none, and the lead clock runs again until the new set is proved.

The `onlyWhen` condition has a third value, `source_water_area`. It holds when staff record that the project is inside a source water protection area, along with the water supplier to notify. Until a determination is recorded, a before-hearing rule with this condition cannot be derived, and the checklist says so.

Three recipient roles come with it: `municipal_clerk`, `municipal_reviewing_authority` and `water_supplier`. Their addresses come from the `regional_contacts` setting. Each neighbouring municipality may carry a `clerk` and a `reviewingAuthority`, and the setting has a `waterSuppliers` list. Staff record which municipalities an application abuts or includes. A pack's abutter resolver can call `resolveMunicipalOffices` and `resolveWaterSupplier` from `src/features/abutters/municipalOffices.ts`, which return the recipients and report a missing contact or determination through the resolver's `incomplete` list.

### Variances and dependent permits

The role `gates.varianceRecorded` names a gate rule. A permit that relies on a variance whose certificate is not yet recorded, or whose recording window has lapsed, is blocked from issue by that gate. Staff link a permit to the variance it relies on from the application page, and the link is accepted only for a variance on the same parcel. Anyone who records board actions can take a wrong link off with "Remove this link" on the dependent application. The removal is audited, and the gate no longer waits on that variance. Leave the role `null` if the state has no such rule. The lot conditions then show "Approved, not valid until recorded" or "Void, not recorded in time" for the variance.

### Plumbing inspectors

`classifications.plumbingInspectorOwns` lists the classification keys that belong to a plumbing inspector. For each, only a user with the `plumbing_inspector` staff role may issue, decide, correct or inspect, and the plumbing inspector may not act on any other classification. The same holds for the steps that need the issue capability on one application: the certificate of occupancy, the code edition, a renewal, the written decision notice, a license check and conditions. An appeal on an owned classification may be recorded and resolved by the plumbing inspector or by any other role that issues permits. On every other classification, only a role other than the plumbing inspector may record or resolve one. An empty list turns the feature off, and the role is then hidden from the role pages.

### Cure notices and civil penalties

A `cure_notice` rule lets an enforcement case send a notice of violation with a time to cure it, in place of drafting an order straight away.

```
{
  kind: 'cure_notice',
  key: 'xx.cure',
  version: 1,
  label: 'Notice of violation with time to cure',
  citation: { label: 'Vellmora Code 14.2', url: VELLMORA_14_2 },
  occupant: 'if_applicable',
  method: 'certified_mail_return_receipt',
  cureRuleKey: 'xx.cure.period',
  penaltyRuleKey: 'xx.penalty.range',
  remedies: { developmentHold: true, civilAction: true },
  overridePolicy: { policy: 'fixed' },
}
```

`cureRuleKey` names an `action_due` clock that starts on `cure_notice_sent`. `penaltyRuleKey` names a `civil_penalty` rule, or is `null`. The case sends one notice per recipient, to the owner and, where there is one, the occupant, by certified mail. Staff record the date each return receipt came back. The notice names the findings it covers, and those findings can no longer be edited or withdrawn.

A `civil_penalty` rule has a `model`. The existing one is `fixed_daily`, the default. The new one is `range_daily`:

```
{
  kind: 'civil_penalty',
  model: 'range_daily',
  categories: [
    { key: 'general', label: 'General violation', minCentsPerDay: 10000, maxCentsPerDay: 250000 },
  ],
  aggravations: [
    { key: 'repeat', label: 'Repeat violation', maxCentsPerDay: 500000 },
    { key: 'gain', label: 'Economic benefit', maxMultipleOfBenefit: 2 },
  ],
}
```

The numbers are placeholders. Each aggravation sets exactly one of `maxCentsPerDay` and `maxMultipleOfBenefit`, and the manifest refuses one that sets both or neither. The engine shows the statutory range and says the court sets the amount. It computes no figure for a range rule, in the case's money section or in the counsel packet. On the cure path, accrual counts from the earliest return receipt, and until one is recorded the range shows with no start date.

### Development holds and civil actions

When a cure notice rule has `remedies.developmentHold: true`, a case whose cure period has lapsed with the violation uncorrected may place a hold on the parcel. A hold blocks new applications and submissions on that parcel, which show a message instead. Staff can suspend or revoke the parcel's issued permits under the hold, and release it once no finding is open and no fine has a balance. Release reinstates the permits that the hold suspended. With `remedies.civilAction: true`, staff may record that a civil action was filed.

A hold cannot be placed, and a civil action cannot be recorded, while an appeal stays enforcement on the case under the pack's `stay_enforcement_on_appeal` effect.

A hold and an appeal can overlap on one permit. The permit stays suspended until both are done, and each suspends only once. An appeal of a permit the hold suspends can be recorded while the hold stands, and the application page offers the form for it. After the release, an appeal dated inside the hold is refused, so record such an appeal while the hold stands. When the appeal resolves with the permit upheld while the hold stands, the permit stays suspended, and the appeal's tolling of the permit's clocks is counted once for the whole suspended span. The hold's release cannot be dated before the resolution of an appeal that was resolved while the hold suspended one of its permits.

A permit can sit on two held parcels. Each hold may suspend it: the second records its action without changing the permit's state. Releasing one hold leaves the permit suspended while the other stands, and the permit goes back into force only when no hold and no suspending appeal is left. Its clocks are tolled once, from the first suspension to the last release.

### Appeal routes and rehearing wording

`AppealRoute.when` is a structure, not text:

```
{
  from: 'zba_decision',
  when: { outcome: 'granted', finalReviewBoard: 'planning_board', label: 'Approval, reviewed by the Planning Board' },
  to: 'court_petition',
  windowRuleKey: 'xx.appeal.window',
  citation: { label: 'Vellmora Code 15.1', url: VELLMORA_15_1 },
}
```

`outcome` (`granted` or `denied`) matches the outcome of the decision, or of a rehearing outcome's parent. `linkedComponent` matches when the decision is a component of a linked application. `finalReviewBoard` matches when the project's final review board is that board kind. Contract 0.9.0 adds `significant` and `originalOutcome`, described under [Significant decisions](#significant-decisions) and [Reconsideration windows](#reconsideration-windows). `label` is the route's name in the pack. When several routes match, the most specific one, the one with the most conditions set, wins. A route with `finalReviewBoard` also needs the project to have its final approval declared.

A project is final when staff tick "This is the last municipal approval the project needs" on an approving decision. A pack without a clock rule on `project_final_approval` never shows the checkbox. The declaration records the vote date and the board kind on the project and starts the `project_final_approval` clocks of every application in it. A court petition on an approving decision whose window starts on that event is refused until the project is final. A second declaration is refused.

`StatePack.labels.rehearing` holds the state's word for a rehearing, as `{ noun: 'reconsideration', capitalised: 'Reconsideration' }`, and the engine uses it wherever a rehearing is named on screen. Node kinds such as `rehearing_motion` are stored names and do not change.

## Features added in contract 0.9.0

Contract 0.9.0 adds the features below. The Maine pack uses them, and the New Hampshire pack leaves them off, so its behaviour is unchanged. The examples are Maine's.

### Clocks met by an inspection or by completeness

`satisfiedByInspection: true` is for a permit whose work must begin within a set time. The first inspection result recorded on the application meets the clock, whatever the result, and the permit then never lapses on it. Without an inspection the clock lapses the permit as any lapse clock does. Maine's `me.plumbing.validity` is a 24-month clock of this kind.

`satisfiedByCompletion: true` is for a review the official must finish within a set time of receipt. Marking the application complete meets the clock, and the application page words the completeness step as meeting the completeness review date instead of starting a decision clock. Maine's `me.ssw.completeness` is a 14-day clock of this kind.

`onlyIfHearingScheduled: true` is for a hearing that must be held within a set time when the board chooses to hold one. The clock is created when a hearing is first scheduled, dated from the day the rule's start event was recorded, and met when the hearing is held. It is never created for an application decided without a hearing, and a rehearing never starts it. A hearing held before the application was accepted meets it as soon as it is created. A decision recorded while it is running supersedes it. Maine's `me.pb.hearing_window` uses it with a 30-day length.

The manifest refuses a clock that sets `satisfiedByInspection` without starting on `permit_issued`, `satisfiedByCompletion` without starting on `application_received`, or `onlyIfHearingScheduled` without starting on `application_accepted`.

### Conditions on a clock

`onlyWhen` takes one fact condition or a list of them, and a list holds only when every condition holds. The contract adds two facts. `{ fact: 'significantDecision', is: true }` reads the answer to the significance question on the decision. `{ fact: 'finalReviewBoard', in: ['planning_board'] }` reads the board kind recorded when the project's last approval was declared.

```
onlyWhen: [
  { fact: 'outcome', in: ['denied'] },
  { fact: 'significantDecision', is: true },
],
```

A conditional `cancelledBy` uses the same conditions. Maine's 45-day Board of Appeals court window has `cancelledBy: { event: 'rehearing_vote', onlyWhen: { fact: 'outcome', in: ['rehearing_granted'] } }`, so a vote to reconsider ends it and a refusal leaves it running.

### Town-set lengths in appeal windows and notice leads

A clock whose length is `fromSetting` was already started with the town's value. Appeal window due dates, the administrative appeals list and the dates of notice leads now read it too, through one helper, `resolvedLength` in `src/features/clocks/resolvedLength.ts`. It uses the town's published value of the setting, or the setting's default when the town has published none.

### Significant decisions

`significanceApplies: true` on a classification makes recording a decision require an answer to the question in `StatePack.labels.significantDecisionQuestion`. Maine asks "Is this a significant land use decision (large buildings, more than 3 acres, or 10 or more lots)?". The answer is stored on the decision, and the form shows `StatePack.labels.significantDecisionHelp` under the question, or nothing when that label is `null`. When `significantDecisionQuestion` is `null`, no classification is asked and no answer is stored. Other classifications are not asked.

`AppealRoute.when.significant` matches the decision's answer, or the answer on the decision a reconsideration started from, and it counts toward the route's specificity. Clock rules read the same answer through the `significantDecision` fact. Maine gives its Planning Board decisions four court routes and four windows: approval and denial, each with and without significance.

### Reconsideration windows

`AppealRoute.when.originalOutcome` matches the outcome of the decision a reconsideration started from, not of the reconsideration vote. Maine uses it so that a refused reconsideration of a Board of Appeals approval, on a project whose last approval was the Planning Board's, keeps the 30-day window the approval had.

When a court route leaves a reconsideration step and its window starts on `board_vote`, the window is dated from the vote on the original decision, not from the reconsideration. A route whose window starts on `rehearing_vote` is dated from the reconsideration vote as before.

### Enforcement without a statutory order

`roles.rules.zoningOrder` may be `null`, like `buildingCodeOrder`. When the role a case's findings need is null, drafting an order is refused with `order_not_available`. The work plan and the case queue leave out the order step, and the case page says "This state has no statutory order for these findings. Send a notice of violation instead."

`roles.rules.enforcementPenalty` names a `civil_penalty` rule shown for a case whose penalty no order or cure rule supplies. The manifest refuses a role that names any other kind of rule. The case uses the order's penalty first, then the cure rule's, then this role's.

`civil_penalty.accrual` may be `null`, on a `range_daily` rule only. Such a range shows no accrual start, unless the cure path supplies one from the earliest return receipt.

### Retention events

A record series with `kind: 'event'` can start from five more events, each written by the system when its cause happens:

| Event | Written when |
| --- | --- |
| `permit_expired` | A lapse clock started on `permit_issued` lapses |
| `occupancy_certificate_issued` | A certificate of occupancy is issued |
| `final_inspection_passed` | The final inspection passes |
| `case_closed` | An enforcement case closes |
| `request_completed` | A records request is closed or withdrawn |

Each is written once per application, case or request, and only when the active pack has a record series that starts from it, so a pack that does not use an event gets no new rows. The retention page describes each as "Starts when" followed by the event in words, such as "the permit expires".

### Records request acknowledgement

`StatePack.recordsRequests.acknowledgement: true` lets staff answer a new request with **Acknowledge receipt of the request**, with an optional question asking the requester to clarify. The acknowledgement meets the `rtkResponse` clock, and the request stays open with the status Responded, so the time estimate and the full response can still be recorded. When the field is `false`, the form does not offer it and the server refuses it.

### Town parties as notice recipients

The notice recipient roles include `planning_board` and `municipal_officers`. Their role labels come from the pack's Planning Board name and `labels.governingBody`. The recipient's name is the town's Planning Board display name, or the governing body label. Their address is the town office mailing address in the town profile. A resolver adds them with `resolveTownParties` from `src/features/abutters/townParties.ts`, which reports a missing address through the resolver's `incomplete` list. Maine's Board of Appeals classifications list both roles, for the hearing notice 30-A MRSA §4353(3) requires.

### Abutters without projection

`AbutterParams.captureRadiusFt` may be `null` for a state whose notice law has no street or stream projection. Turning projection on is then refused, in the board settings and in the crossing tools, with "This state's notice law has no street or stream projection." A parcel picked up by the town buffer carries the reason `within_buffer`, which reads "Within 150 feet of the property" for a 150-foot buffer, and the map draws the buffer outline whenever the list has a buffer, whether or not projection is on.

### Board steps that follow the pack's consequences

The certification request and the completeness vote, two board steps New Hampshire uses, depend on the consequences of the pack's clocks. The request for certification by the governing body is offered and accepted only when the Planning Board decision clock on the application has the consequence `selectmen_certification`. A completeness vote of not accepted closes the application as denied only when the `filingLead` role names a clock with the consequence `not_accepted_at_meeting`. Otherwise the application stays open, waiting for the missing material.

### License trades

The license trades include `manufacturedHousing`, which Maine's license types use for manufactured housing installers and mechanics.

## Features added in contract 0.10.0

Contract 0.10.0 adds the fields below. New Hampshire keeps its behaviour, except where a field carries New Hampshire's existing text, and the Maine pack sets each field to its own words. The examples use the fictional state of Vellmora.

### Administrative officials

`labels.administrativeOfficials` lists the titles of the town officials whose decisions can be appealed to the board that hears administrative appeals, with at least one title. The appeal wording names them: "Decisions by the permit warden or another town official that can be appealed" for Vellmora's `['permit warden']`. With two or more titles the list reads "the permit warden, land keeper or another town official". New Hampshire's list is `['building inspector', 'zoning administrator']`, the titles its wording already used, and Maine's is `['code enforcement officer']`.

### Records request number prefix

`labels.recordsRequestPrefix` is the prefix of a records request number, two to four capital letters. Vellmora's is `'VR'`. New Hampshire's is `'RK'` and Maine's is `'FOAA'`.

### Time statement date label

`labels.timeStatementDateLabel` is the label for the date in a records request time statement, the date by which the town expects to answer. Vellmora's is `'Answer expected by'`. New Hampshire's is `'Response by'`, and Maine's is `'Estimated response date (a good faith, nonbinding estimate)'`.

### Portal common jobs and the building office

`StatePack.portal` shapes the portal page where an applicant picks what to apply for. `commonJobs` lists the jobs shown first, each with a `key`, the prefix of the application type it opens, a `title` and a `description`. Vellmora lists one, `{ key: 'BP', title: 'Build something', description: 'A new Vellmora building.' }`. `officeClassifications` lists the classification keys grouped under the "Building office" heading, such as `['xx.building_permit', 'xx.trade_permit']`. Every key should be one of the pack's classifications, and every job's key should be the prefix of one of the pack's starters. New Hampshire's jobs are the six the portal already showed, and its office classifications are its building and trade permits. Maine lists building, demolition, plumbing, septic, shoreland and sign jobs, and its eight staff permit classifications.

### Application types that need no review

An application type's `workflow.reviewRequired` may be `false`, for a permit the official decides without assigning a review first. When it is left out the review step is required, as before. Every Maine staff permit starter sets it to `false`. No New Hampshire starter sets it.

### Fee lines the town sets

A fee line may carry `townSets: true`, which marks a line whose amount Chiban does not know and the town enters. Such a line charges nothing until the town sets an amount, and its label no longer needs a note saying so. A Vellmora line would read `{ code: 'application', label: 'Application fee', due: 'at_intake', expr: { op: 'flat', cents: 0 }, townSets: true }`. Maine's blank fee lines use it. New Hampshire's lines carry real amounts and do not.

### Checklist provenance

An inspection checklist may carry `provenance`, a short sentence saying where the checklist came from, shown with it so the town knows to review it. A Vellmora checklist might say `'Written by Chiban as a start. The town can change it.'`. Maine's starting checklists say "Chiban starting checklist. The town can edit it." and their labels are plain, such as "Start of work" and "Final inspection".

### Appealed decision date and significance facts on a form

A form question's `fact` may be `'appealedDecisionDate'`, which marks the answer as the date of the decision being appealed. Both packs tag the decision date question on their administrative appeal form with it, and a Vellmora appeal form would tag its own. A question may also set `significanceFact: true`, which shows its answer beside the significance question when staff record the decision. Maine sets it on the site plan questions about building footprint, floor area and disturbed acres, and on the subdivision lot count. In the form builder these read "Date of the decision being appealed" and "Shown beside the significance question".

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

The abutter specification names a strategy key and a resolver key, the recipient roles every notice goes to, and roles added only when a fact is true, such as a project of regional impact. The strategy and resolver are code in `packs/nh/abutters`, not data. `abutters/params.ts` holds the numbers that code uses, such as the 50-foot capture radius that RSA 672:3 sets. Maine's sets `captureRadiusFt: null` (see [Abutters without projection](#abutters-without-projection)). Its `tolerancesLabel` says that the other tolerances are Chiban's engineering choices.

Abutter parameters may also carry `townBuffer`, for a state where a town may widen the notice area by a distance:

```
townBuffer: { defaultFt: 100, maxFt: 300 }
```

`maxFt` is the most a town may set. When the law sets no maximum and the cap is Chiban's own, add `maxSetBy: 'chiban'`, and the refusal says Chiban sets the limit. Left out, `maxSetBy` is `'state_law'` and the refusal cites state law. `defaultFt` is what applies when the board has not set a distance, and may be `null` for no extra distance. A board then sets `abutters.bufferFt` in its board settings, and the settings are refused above `maxFt`. A pack that leaves `townBuffer` out counts abutters by adjacency alone, and a board setting for the distance is refused.

One rule applies to every pack. A clock whose `overridePolicy.policy` is `delegated_choice` must take its length from a town setting with `length.fromSetting`. The manifest check names any such clock that uses a fixed length and stops the pack from loading.

Board kinds are a fixed list in the engine: Planning Board, Zoning Board of Adjustment and seven others. What each kind does, whether it decides applications, holds hearings, has a filing lead time, and whether a town may have only one, is engine behaviour in `src/features/boards/boardKindBehaviour.ts`. The pack's `boardSchema.ts` gives each kind its `label`, `defaultShortName`, `shortLabel`, `abbreviation` and `description`. The board application starters in `starters/boards` are the permit types each deciding board hears.

## Holidays and counting

`holidays.ts` exports `nhLegalHolidays(year)`, which returns each holiday's date, name and citation. The list is the legal holidays of RSA 288:1, a holiday on a Sunday observed on the Monday after it under RSA 288:2, and biennial election day in even years. An optional map overrides Thanksgiving for a given year. Maine's `meLegalHolidays(year)` lists the holidays of 4 MRSA §1051, with the same Sunday rule, and names Thanksgiving as a Chiban assumption because the statute gives no date for it. `src/features/packs/holidays.ts` turns the function into the calendar that deadline arithmetic uses. `countingCitations.ts` names the statute for the way days are counted. The counting itself is in `src/features/clocks`, not in the pack.

## Record series

A record series is a class of record with a retention rule. Each has a key, a version, a label, a citation with a URL, a `retention`, and a `preservation` of `pdfa` or `original`. Retention is `permanent`, a `duration` in years, or an `event` list with years added, where the events come from a fixed list such as `application_withdrawn` or `building_removed`, plus the five added in [contract 0.9.0](#retention-events). A series can point to others for the outcomes withdrawn, denied or expired.

`recordSeriesDefaults` maps a classification key, or an application type prefix, to the series its records are filed under.

## Public records exemptions

`rtkExemptions.ts` lists the statutory exemptions a custodian may cite when withholding a record: a key such as `nh.rtk.91a5.<paragraph>`, the paragraph, a label and a citation. Maine's list cites each paragraph of 1 MRSA §402(3). A further key, `other_law`, covers an exemption found in another statute. The records screens and the response letter read this list. The deadlines for answering a request are ordinary clock rules in `rules/rightToKnow.ts`.

## Starters

A starter is a complete application type in one object: the application type, its form, fee schedule, condition library, inspection checklists and letter templates. `starters/index.ts` lists them in `NH_STARTERS`, and each has an `id` and an integer `version`. A town adopts a starter from **Settings**, **Starter templates**, which copies each member into the town's own configuration. Nothing is shared afterward, so changing a starter reaches a town only when its administrator accepts the update. `starters/starters.test.ts` checks every starter against the schemas for each of its parts, and against the pack's rules.

## Labels, spatial reference and docs folder

`StatePack.labels` holds the words and citations the engine shows on screen so that no state's names are written into engine code. Besides the environmental agency names and the license number label, it has `recordsLaw`, the short name of the public records law, `recordsRequest`, what a request under it is called, `governingBody`, the town's elected body, `significantDecisionQuestion`, the significance question, or `null` when the state has none, and `significantDecisionHelp`, the help text under that question, or `null`. A pack for a state with a different records law would write `recordsLaw: 'Open Records'`, `recordsRequest: 'open records request'` and `governingBody: 'town council'`. Its `citations` object has `exerciseFloorAuthority`, the statute for the minimum period a board approval stays valid, and `abutterListIssued`, a label and a URL, or `null` for the URL, for the authority behind the abutter list.

`StatePack.recordsRequests` holds `acknowledgement`, described under [Records request acknowledgement](#records-request-acknowledgement).

`StatePack.spatial` names the projected coordinate system the state's parcel work uses: `projectedSrid`, the EPSG number, and a `label`. Abutter distances, in feet, are measured in this system, so it must be one whose unit is the US survey foot, such as `{ projectedSrid: 3437, label: 'NAD83 / New Hampshire (ftUS)' }`. Maine's is `{ projectedSrid: 26847, label: 'NAD83 / Maine East (ftUS)' }`, used for parcels anywhere in the state.

`StatePack.docsSlug` is the folder name the generated state pages are written to. The generator puts them in `docs-site/docs/state-packs/<docsSlug>/_generated`, so a pack with `docsSlug: 'vellmora'` produces its pages next to the New Hampshire ones and does not overwrite them.

## Parcel ID formats

New Hampshire's `parcelIdFormats.ts` lists two formats, `cama15`, the 15-digit CAMA number, and `gis12`, the 12-digit map-lot ID that is shown on screen. A format has a key, a label, a kind, a width, whether it is the display one and an example. The kind is `digits`, with a whole-number `width`, or `free_text`, with `width: null`. Maine's one format is `{ key: 'map_lot', label: 'Map and lot', kind: 'free_text', width: null, isDisplay: true, example: 'R04-012' }`. The list is used by the demo seed and by tests. When migrations finish, the migration command installs the active pack's formats if none of them is in the database yet, which is the case on a fresh install or after a switch to another pack. It also removes the two New Hampshire defaults, `cama15` and `gis12`, when the active pack does not list them and nothing uses them. Once any of the pack's formats is in the database, the command adds nothing, so a format a town deleted stays deleted. A town edits its formats under **Settings**, **Parcel ID formats**. A format added to the TypeScript list later does not reach a town that already has the pack's formats. The town adds it there.

## Versioning

Versions exist at four levels. Adding fields to the manifest or the `StatePack` object raises the contract version, which each pack's manifest carries as its `version`. The contract is at 0.10.0.

- The pack: the manifest's `version` in the manifest is a string. Each clock and each enforcement answer records the pack version it was made under. It appears in the archive of a town's export, in `/api/version`, and on the **State law** page as "Jurisdiction pack nh version 0.10.0, fingerprint" followed by the first 12 characters of a SHA-256 hash of the whole manifest.
- A rule: when a rule's content must change, add a new `version` of the same key and keep the old one. `ruleByKey` returns the highest version unless a caller asks for one. A clock records the rule key and version it started under.
- A transition: to act on clocks already running, declare a transition in `transitions.ts`, with a rule key, the from and to versions, a policy of `keep_old` or `switch`, and a reason. An operator previews and applies it with the `rules-migrate` command. See [upgrading](../operations/upgrading.md).
- Starters, record series and abutter parameters: each carries its own integer `version`.

## Steps for a new pack

1. Copy the folder, rename its prefixes so the keys carry the new state's prefix, and rename `NH_PACK`.
2. Replace the classification key list in `boardSchema.ts` and the board kind names.
3. Write the rules, one area at a time, with a URL for each citation, and run the pack's tests after each.
4. Write the classifications and abutter parameters.
5. Fill in `roles`. Name a key for each required role, and set an optional role to `null` where the state has no such rule. Fill in `buildingCodes`, `spatial`, `labels`, `recordsRequests` and `docsSlug` on the pack object.
6. Write the holidays and the counting citation.
7. Write the record series and their defaults.
8. Write the exemption list for the state's public records law.
9. Write the starters and run the starter test.
10. Add the pack to the map in `src/features/packs/registry.ts`, and its abutter code to `registryAbutters.ts`, then set `CHIBAN_PACK` to its id. The compose file in `deploy` passes `CHIBAN_PACK` through to the containers, so setting it in the environment or the `.env` next to the compose file is enough.
11. Run `CHIBAN_PACK=<id> pnpm docs:generate` to write the deadlines and starter pages the pack produces, then run `pnpm docs:generate` to bring the pages that do not belong to a state back to the default pack. Add the pack's pages to `docs-site/sidebars.ts`, and its id to the comparison in `scripts/docsSite/generatedPages.test.ts`, which checks the committed pages against the generator.

The pack contract covers what New Hampshire and Maine need. A state whose law needs a rule kind the schema does not have, a clock that starts on an event the engine does not record, a recipient role or condition the engine does not know, or a feature with no role, still needs engine work before its pack can express it. The generated docs are written to the folder named by `docsSlug`, and the abutter strategy and resolver are code a pack has to provide.
