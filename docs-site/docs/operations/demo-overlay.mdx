# Demo overlay

A demo installation (`CHIBAN_DEMO_MODE=true`) resets itself every night to the fictional Town of Alder Pond. A demo overlay is a JSON file that dresses that reset as a particular town: its name, office contact lines, the starters it uses, its fees and where its boards post notice. Set `CHIBAN_DEMO_OVERLAY_FILE` to the file's path and the reset applies it on every run.

The overlay is ignored, with a line in the log, when demo mode is off. It never touches a real installation.

## What a reset does with it

Before the database is dropped, the reset reads the file, checks it against the overlay schema and against the starters shipped in the build. A file that fails either check stops the reset with every failing path listed, and the database is left as it was.

The rest goes through the same draft and publish functions the settings screens use, as the seeded admin user, so every value meets the same validators and lands in the configuration history and the audit log:

1. The seed writes the town name from `town.name` where it would write Alder Pond.
2. Before any demo case is created, the listed starters are adopted and their forms and fee schedules are published with the overlay's changes. Seeded cases pin those versions, so their fees match what a new application is charged.
3. After the seed, boards are renamed, and the town profile, payment settings and board notice settings are merged over what the seed published.

A value a validator refuses at this stage fails the reset with the overlay path, for example `demo overlay: townProfile.boards.housing_commission: there is no active housing_commission board`. So does a seed that cannot run with the overlay, for example when an added required field is missing from the seeded building permits or a fee change leaves a seeded payment with nothing due. Either way the reset then seeds the plain demo, so the site stays usable, and exits non-zero.

## Checking a file

```sh
pnpm demo:overlay:check path/to/overlay.json
node dist/demo-overlay-check.mjs path/to/overlay.json
```

Neither needs a database or any other setting. Both exit non-zero and print each failing path when the file is invalid, and name the starters this build does not have.

## Format

[`demo-overlay.example.json`](demo-overlay.example.json) uses every section. Every key is optional except `version`, and an unknown key at any depth is an error.

| Key | What it sets |
|---|---|
| `version` | Always `1` |
| `town.name` | The town name in the header, page titles and merge fields |
| `townProfile` | `officeName`, `addressLines`, `phone`, `email`, `website`, `officeHours`, `letterheadFooter`, and `boards.<board kind>` with `officeName`, `addressLines` and `footerText` for that board's letterhead |
| `paymentSettings` | `checksPayableTo`, `receiptFooter`, `convenienceFee` |
| `starters` | Application type keys to adopt, such as `BP` or `VAR`. A key this build does not ship is reported and skipped, so an overlay can name a starter before it is released |
| `boards.<board kind>.name`, `shortName` | Renames the one active board of that kind through the board admin, as the settings screen does |
| `boards.<board kind>.notice` | `posting`, `publication`, `newspaper`, `bulletinBoards`, `websiteUrl` for every active board of that kind |
| `boards.<board kind>.noticeFees` | `perAbutterCents` and `advertisingCents`. They set the `notice_mail` and `notice_newspaper` lines of every listed starter on that board, adding a line the starter lacks |
| `applicationTypes.<key>.formFields` | Fields appended to that type's form, in the form field format |
| `applicationTypes.<key>.fees.<code>` | `expr`, in the fee expression format, and optionally `label` and `due`. An existing line keeps its label and stage unless given. A new code needs both |

Every key under `applicationTypes` must also be listed in `starters`, so a mistyped key fails the check instead of being skipped. Amounts are in cents.

## What it cannot set

The overlay reaches configuration and board names. The seeded people, parcels and cases keep their Alder Pond values, and so does any board the overlay does not rename. A fee that depends on another application, or one that staff decide case by case, has no expression; the nearest is a zero line that staff set per application with a fee override.
