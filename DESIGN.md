# Design

Chiban should read as a public record: paper-white surfaces, serif headlines, one pen color. The token values live in `src/features/design/tokens.ts` and are mirrored in `src/app/globals.css`. Components use token classes (`bg-surface`, `text-ink`, `text-muted-foreground`), never raw hex values.

## Tokens

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f1f5f8` | Page background |
| `surface` | `#ffffff` | Cards, nav, inputs |
| `ink` | `#1f1f1f` | Headings and body text |
| `ink-secondary` | `#2d2f33` | Secondary text, nav, borders |
| `muted` | `#5b6470` | Helper text, metadata |
| `action` | `#2a65a3` | Primary button fill, links, focus ring |
| `highlight` | `#fff7ca` | Attention wash behind a short phrase |
| `status-passed` | `#1e6b3a` on `#e6f4ea` | Passed, approved, issued |
| `status-failed` | `#a3261f` on `#fbe9e7` | Failed, denied, violation |
| `status-overdue` | `#7a4b00` on `#fff7ca` | Past or near a statutory deadline |
| `status-neutral` | `#2d2f33` on `#e8edf1` | Waived, withdrawn, closed, draft |
| `hairline` | `#d5dce3` | Panel, divider and table row borders |
| `control-border` | `#808a95` | Input, select and outline button borders (3:1 on white and canvas) |

`src/features/design/tokens.test.ts` checks every text pair against WCAG AA (4.5:1) and that `globals.css` declares every token.

## Rules

- One filled primary action per screen. Everything else is a ghost button or text link.
- Highlighter yellow marks what needs attention, behind a short phrase, never as a full surface.
- Status is never color alone: use `StatusChip`, which always renders an icon and a text label.
- Records look like documents: serif titles, hairline-bordered white cards on the canvas, almost no shadow.
- Every top-level `<section>` inside `<main>` renders as a hairline panel; nested sections become divided subsections. Add `data-plain` to a section that should not be a panel (an action bar, for example).

## Layout pieces

- `PageHeader` (`src/components/layout/PageHeader.tsx`): kicker, serif title with status chip, lead line, a fact list, and the page's actions. Use it for every record page.
- `RecordLayout` (`src/components/layout/RecordLayout.tsx`): a record page body with a sticky right rail. The rail holds the next step (the one filled action), the key facts as a stacked `FactList`, and an "On this page" index once there are four or more panels. In windows 1840px and wider the index moves to the empty space left of the record and sticks there while the page scrolls. Below 1024px the rail comes first, above the panels.
- `splitPanels` (`src/components/layout/splitPanels.ts`): the page decides which panels have nothing on file. Filled panels keep their order; empty ones collect at the end under "Nothing recorded yet" as one-line rows, with any add action as a disclosure on the right.
- Forms that add something (assign, apply, record, refer) sit behind a `<details>` disclosure named for the action. Forms that are the page's next step stay open in the rail.
- Lists of records inside a panel use `record-item` dividers, never bordered boxes inside a bordered panel.
- Data tables sit in a `table-panel`; filter bars above them in a `toolbar`. Status columns use `StatusChip`, and empty cells read in muted text.
- Staff navigation lives on its own `sidebar` layer (`#e9eef2`), a step darker than the canvas. Entries are grouped by the `group` field in `src/features/staffNav/navItems.ts` and each carries an icon. The current page is a white row with a hairline edge.
- Records and reports and Parcel data fold away unless the current page is inside them. Configuration and administration pages sit behind one Settings entry, shown to anyone who can open at least one settings page. An entry with a `parent` (My day under Inspections) is indented beneath it when both are visible.
- The person's name, role, Account and Sign out are pinned to the bottom of the sidebar; only the entries scroll.
- The sidebar collapses to an icon rail with tooltips. The choice is kept in the `chiban_staff_nav` cookie so the server renders the right width. Below 768px it becomes a top bar and a drawer.
- The staff home (`/staff`) shows what needs attention and the next deadlines, with a parcel search. Inspectors who hold only that role land on their day list instead.
- The theme is light only. Tailwind's `dark:` variant is bound to a `.dark` class that nothing sets, so an operating system dark setting cannot restyle controls.

- A rail taller than the window scrolls with the page instead of sticking, so its bottom is never cut off.
- In long lists on a record page, urgent items (the deadline due next, anything late) stay open and the rest fold to one line.

## Settings

- Settings and administration pages (`/staff/settings/*` and `/staff/admin/*`) share one shell: a settings menu about 14rem wide on the left inside the content area, and one focused page on the right. The menu model lives in `src/features/settingsMenu/settingsMenu.ts`, grouped (Permits, Town rules, Boards, Money and inspections, Starters, Administration); add a page by adding an item there.
- The menu lists only the pages the viewer can open, using each page's own access rule, and marks the current page like the main sidebar's current row. A filter box at the top narrows it. Below 768px it becomes a picker at the top of the page.
- `/staff/settings` opens the first page the viewer can use. A viewer who can open none gets the permission refusal.
- One page per setting, never a long hub. Every page starts with `SettingsHeader` (`src/components/settings/SettingsHeader.tsx`): the title, one plain line saying what the page controls, and the page's one filled action on the right (New type, Request a new export) where there is one. The versioning sentence joins that line only on kinds that open applications pin (application types, forms, fee schedules, templates, conditions, checklists).
- Kinds that hold one record (payment, inspection and board settings, regional notice contacts, review committee routes) open straight to their form and version history instead of a one-row list.
- An empty kind shows what it does and the add action in its place, never a bare 0.
- Settings pages are not record pages: no `RecordLayout`, and `main[data-wide]` only when a table needs the width.

## Lists and filters

- One list per kind of record. Status or scope is a row of `FilterTabs` with counts above the filter bar, not a second page. Tabs pick one value, and "Clear all" leaves the chosen tab alone.
- List pages use `<main data-wide>` so the table can use the wider list width. The lead line states the default order.
- Every meaningful column sorts from its header with `SortHeader`, one sort link per header. Paged or growing lists sort and filter in SQL with a stable tiebreak. Narrow layouts get the same sorts through `SortBar`.
- Quick filters come from `chipGroups` in `src/features/dataTable/quickFilters.ts`: two to four groups, counts from `countFacets`. Options that exclude each other (Mine and Unassigned, Overdue and Due this week) set `single: true` and are read with `singleValue`. Groups longer than three options, and anything not every viewer needs, go behind a `FilterMenu`.
- Below 640px every filter group folds into a menu. No staff page scrolls sideways at 390px.
- Identifiers link to their record: an application number to the application, a parcel ID to the parcel, an owner to a parcel search for that owner. An identifier gets its own column instead of sitting inside a sentence.
- Keyboard-driven tables move with `j` and `k`, open the selected row with Enter, and always show focus.
- Search forms offer recent searches and a one-click example under the field.

## Actions and roles

- An action appears only when the viewer can take it and it applies in the record's current state. A finished application shows no board, review or abutter actions; money, records and legal-deadline work stays available.
- The server refuses the same action on the same grounds. Hiding a button is never the only check.
- The staff menu lists only pages the viewer can open. A viewer with no list to work from lands on a page they can use, never on a bare permission refusal.
- Reviewers and board members see read-only versions of records, without buttons they cannot use.

## Copy

- Plain words, no internal jargon, and no text repeated within one panel (a gate's label and its reason, for example).
- A count appears only when it says something: "2 more overdue", never "0 overdue".
- An empty state says what to do next.

## Type and shape

- `h1` and `h2` use `Charter, "Source Serif 4 Variable", serif` (22px and up). `h3` and `h4` use the body face in bold.
- Everything else uses Mulish Variable at `-0.02em` tracking. Fonts are self-hosted through `@fontsource-variable`.
- Scale is Major Second (1.125) from a 16px base.
- 4px spacing base, 10px radius, 24px card padding, 1200px maximum content width.

## Two densities

- Public shell (`.public-shell`): 16px minimum body text, 44px minimum tap targets, single-column forms, mobile first.
- Staff shell (`.staff-shell`): denser tables, 14px allowed in tables only.
