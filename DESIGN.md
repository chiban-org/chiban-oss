# Design

Chiban should read as a public record: paper-white surfaces, serif headlines, one pen color. The token values live in `src/features/design/tokens.ts` and are mirrored in `src/app/globals.css`; shared component styles (page rhythm, panels, tables, record lists) live in `src/app/components.css`. Components use token classes (`bg-surface`, `text-ink`, `text-muted-foreground`), never raw hex values.

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
- A page that refuses the viewer renders `NoPermission`, never a hand-made heading and alert.
- Upload buttons and the submit of any form that is not the page's next step are outline buttons.
- A note that a connection is a practice or stand-in one uses `PracticeNotice`: a dashed outline on white, never a yellow surface.
- Every top-level `<section>` inside `<main>` renders as a hairline panel; nested sections become divided subsections. Add `data-plain` to a section that should not be a panel (an action bar, for example).

## Layout pieces

- `PageHeader` (`src/components/layout/PageHeader.tsx`): kicker, serif title with status chip, lead line, a fact list, and the page's actions. Use it for every record page.
- `RecordLayout` (`src/components/layout/RecordLayout.tsx`): a record page body with a sticky right rail. The rail holds the next step (the one filled action), the key facts as a stacked `FactList`, and an "On this page" index once there are four or more panels. In windows 1840px and wider the index becomes a left column of the record and sticks there while the page scrolls. Below 1024px the rail comes first, above the panels.
- `splitPanels` (`src/components/layout/splitPanels.ts`): the page decides which panels have nothing on file. Filled panels keep their order; empty ones collect at the end under "Nothing recorded yet" as one-line rows, with any add action as a disclosure on the right.
- On a record page, forms that add something (assign, apply, record, refer) sit behind a `<details>` disclosure named for the action. Forms that are the page's next step stay open in the rail. List pages follow "Lists and filters" instead.
- Lists of records inside a panel use `record-item` dividers, never bordered boxes inside a bordered panel. A list that would stand alone on the page goes in a panel with a heading first.
- Top-level blocks inside `<main>` sit 20px apart and the lead line sits 4px under the `h1`, both from `components.css`. Pages do not add `space-y-*` to `<main>`, margins to its direct children, or classes to the lead line.
- A page below another one (an import run under Imports, a user under Users) names its parent as a link in the kicker above the title, through `PageHeader` or `SettingsHeader`'s back link.
- Data tables sit in a `table-panel`; filter bars above them in a `toolbar`. Tables never add their own row border or cell padding classes; the base table style draws them. Status columns use `StatusChip`, in panels too, and empty cells read in muted text.
- Staff navigation lives on its own `sidebar` layer (`#e9eef2`), a step darker than the canvas. Entries are grouped by the `group` field in `src/features/staffNav/navItems.ts` and each carries an icon. The current page is a white row with a hairline edge.
- Records and reports and Parcel data fold away unless the current page is inside them. Configuration and administration pages sit behind one Settings entry, shown to anyone who can open at least one settings page.
- Parcel data shows only to those who can manage parcels or run imports. Data export (under Records and reports), Move open applications over and Scanned property files (under Parcel data) sit in the main nav for those who can open them without editing configuration; configuration editors find them in the Settings menu's Administration group instead. An entry with a `parent` (My day under Inspections) is indented beneath it when both are visible.
- The person's name, role, Account and Sign out are pinned to the bottom of the sidebar; only the entries scroll.
- A search field, "Find a permit, case or parcel", sits under the town name at the top of the sidebar and in the phone top bar (`RecordSearch` in `src/components/staff/search`). Typing an exact record number (an application or permit, an enforcement case, a cease and desist order or complaint, a Right-to-Know request, a receipt) and pressing Enter opens that record. Otherwise, after a short pause, it lists up to five matches per group: Applications (number, type, address, status chip), Enforcement cases, Parcels (ID, address, owner) and Requests, moved with the arrow keys and Enter and closed with Escape. A number search adds "See all application matches", which opens the Applications list with the search applied. The server (`search.find`, staff only) applies each target page's own access rule, so a viewer only ever sees records they can open and no counts. In the icon rail it is a search icon that expands the sidebar. It has no keyboard shortcut.
- The sidebar collapses to an icon rail with tooltips. The choice is kept in the `chiban_staff_nav` cookie so the server renders the right width. Below 768px it becomes a top bar and a drawer.
- The staff home (`/staff`) is a start page per role under a parcel search (`src/features/staffHome`): a clerk or planner sees what is waiting on them, the next deadlines and the counter; an inspector, results still owed, today's route, requests to schedule, their open cases and the next inspection days; finance, payment problems, fees, today's receipts with the cash report, and overpayments to refund; a records custodian, Right-to-Know requests by statutory day, preservation retries, disposition batches, holds and exports; admin, system health, users, unpublished settings drafts, and imports and exports. Someone with several roles sees a panel for each, most urgent first. Each row is a count linked to the full list; a panel with nothing to count says "Nothing waiting." Reviewers land on their reviews and board members on `/board`.
- `/board` puts the next meeting and its packet first, then later meetings, then earlier ones.
- The theme is light only. Tailwind's `dark:` variant is bound to a `.dark` class that nothing sets, so an operating system dark setting cannot restyle controls.

- A rail taller than the window scrolls with the page instead of sticking, so its bottom is never cut off.
- In long lists on a record page, urgent items (the deadline due next, anything late) stay open and the rest fold to one line.

## Settings

- Settings and administration pages (`/staff/settings/*` and `/staff/admin/*`) share one shell: a settings menu about 15rem wide on the left inside the content area, and one focused page on the right. The menu model lives in `src/features/settingsMenu/settingsMenu.ts`, grouped (Town, Permits, Town rules, Boards, Money and inspections, Starters, Administration); add a page by adding an item there.
- The menu lists only the pages the viewer can open, using each page's own access rule, and marks the current page like the main sidebar's current row. Each group is a heading with an icon and a count that opens and closes; only the group holding the current page starts open, so the menu never reads as one long list. A filter box at the top narrows it and opens every group with a match. Below 768px it becomes a picker at the top of the page.
- `/staff/settings` opens the first page the viewer can use. A viewer who can open none gets the permission refusal.
- One page per setting, never a long hub. Every page starts with `SettingsHeader` (`src/components/settings/SettingsHeader.tsx`): the title, one plain line saying what the page controls, and the page's one filled action on the right (New type, Request a new export) where there is one. The versioning sentence joins that line only on kinds that open applications pin (application types, forms, fee schedules, templates, conditions, checklists).
- Kinds that hold one record (payment, inspection and board settings, regional notice contacts, review committee routes) open straight to their form and version history instead of a one-row list.
- The Town group (Town profile, Letterhead, Signers) edits one town profile. Each page publishes its part straight to a new version, with no draft step, and links to the version history on the town profile kind page. The Letterhead page shows a live preview of the header and footer next to its form.
- An empty kind shows what it does and the add action in its place, never a bare 0.
- Settings pages are not record pages: no `RecordLayout`, and `main[data-wide]` only when a table needs the width.
- Settings editors speak in the town's terms. Items are listed, titled and picked by name; keys, codes, inspection types and fee formulas as data sit under a closed "Advanced" disclosure. A new item starts from a name, and its short name is made from it (`src/features/config/newItemKey.ts`).
- The shared pieces live in `src/components/config/plainFields.tsx`: `NamePicker` and `CheckedNames` pick other configuration by name and store its key, `TextRows` edits a list one row per entry, `DollarsInput` and `PercentInput` show dollars and percent while storing cents and basis points. A choice list longer than ten folds behind "Choose from all N" under a "Chosen:" line.
- Every field has a plain label, and a one-line hint when its meaning or unit is not obvious. Field grids are one column below 640px.
- A required field carries a red asterisk after its label (`RequiredMark` in `src/components/ui/required-mark.tsx`, `aria-hidden`, so the native `required` attribute is what screen readers announce). `Field` and every wrapper built on it (`TextField`, `AreaField`, `SelectField`, `CheckField`, `DollarsInput`, `PercentInput`, `NamePicker`, `CheckedNames`, the address and parcel pickers) take `required` and draw the mark; a form that builds its own `Label` renders `RequiredMark` inside it, and `FormRenderer` marks a field exactly when it is required at that moment, including `requireIf`. Every form (`ActionForm` and the hand-made ones) opens with `RequiredNote`, a muted "* Required" line that stays hidden unless the form holds a required control. `src/requiredFieldMarks.test.ts` scans hand-made labels.
- Field grids align to the top: `Field` is `content-start`, so a neighbour with a longer hint never pushes a label or input down. Rows of fields never use `items-end`.
- A button that acts on one input (Remove, Move up, Preview) is that field's `action`: it sits right beside the input, between the label and the hint, at the input's height (`RowButton` is the default button size, `h-9`). It never floats to the far edge of the row, and beside a textarea it lines up with the textarea's top.
- A checkbox lines up with the first line of its label (`CheckLine`), however many lines the label runs to.
- Each fee shows a worked example in a sentence ("For Finished area of 1,200 ..., this fee is $420.00."), worked out by the same calculation that charges applicants.
- `PublishBar` explains Save draft and Publish once, above the buttons. Publish and Restore open a confirmation that says what changes: open applications keep their version on kinds they pin, everything else takes effect at once.

## Lists and filters

- One list per kind of record. Status or scope is a row of `FilterTabs` with counts above the filter bar, not a second page. Tabs pick one value, and "Clear all" leaves the chosen tab alone.
- Tabs always sit under the lead line and always use `FilterTabs`, including tabs that switch between sibling lists (the three override lists).
- A list's Add action sits at the top, never only after the last row. The page header carries it: `ListHeader` (`src/components/layout/ListHeader.tsx`) on list pages, `SettingsHeader`'s action on settings pages, and `SectionHeader` beside the heading when the list is one section of a page (the three notice contact lists). Add is the page's one filled button unless the page already has one; then it is outline.
- Add opens its form in `FormDialog` (`src/components/FormDialog.tsx`), titled for the action, with an outline submit. A form too long for a dialog sits in a disclosure directly under the header instead. A dialog closes with Escape or its close button and scrolls inside itself on a short window.
- Every row that can be corrected has an Edit action: `RowEditDialog` opens the same form filled in with what is on file and saves through an update action. The update checks the same capability as the create action, keeps the server's own validation, and writes an audit entry with the values before and after. Rows that open their own record page (a request, a case, a meeting) take no Edit in the list; whatever that record allows changing is on its page.
- When rows are unique by a key (a roster per parcel), Add refuses a key that is already listed and the message points to that row's Edit. Edit shows the key as text and does not change it.
- Row actions sit in the last column under a screen-reader-only "Actions" header: Edit first, then any destructive action with its confirmation. Edit's accessible name names the row ("Edit Avery Stone").
- A list that can grow past about 25 rows shows 25 at a time with `TablePager` under the table (requests, cases, meetings, legal holds, board members, the three override lists). Lists that stay short (notice contacts, enforcement officers, export targets) do not page.
- A table's download link reads "Download CSV" and is hidden in print.
- List pages use `<main data-wide>` so the table can use the wider list width. The lead line states the default order.
- Every meaningful column sorts from its header with `SortHeader`, one sort link per header. Paged or growing lists sort and filter in SQL with a stable tiebreak and page with `limit` and `offset`. Lists already sorted and filtered in memory (the override lists) page after sorting with `slicePage` from `src/features/dataTable/pageSlice.ts`. Narrow layouts get the same sorts through `SortBar`.
- Quick filters come from `chipGroups` in `src/features/dataTable/quickFilters.ts`: two to four groups, counts from `countFacets`. Options that exclude each other (Mine and Unassigned, Overdue and Due this week) set `single: true` and are read with `singleValue`. Groups longer than three options, and anything not every viewer needs, go behind a `FilterMenu`.
- Below 640px every filter group folds into a menu. No staff page scrolls sideways at 390px.
- Identifiers link to their record: an application number to the application, a parcel ID to the parcel, an owner to a parcel search for that owner. An identifier gets its own column instead of sitting inside a sentence.
- A field that asks for a parcel is the parcel picker (`ParcelPicker` and `ParcelMultiPicker` in `src/components/parcels/picker`), never a bare text box. It searches address, owner and every form of parcel ID after a short pause, lists up to eight matches with the display ID, site address and owner, labels retired parcels, and moves with the arrow keys, Enter and Escape. The choice shows as a chip with Change, and the form submits the parcel's record id under the field's usual name. Where a form may name a parcel that is not in the layer yet (lineage children), "No parcel matches" comes with "Use this ID anyway", which submits the typed ID.
- No custom keyboard shortcuts. Standard browser keyboard use only: Tab order, visible focus, Enter and Space on links and buttons, Escape to close dialogs and menus, arrow keys inside listboxes and selects.
- Search forms offer recent searches and a one-click example under the field.
- A list of people inside one record (association officers, park tenants) is edited as repeatable rows: one bordered group per person with its own fields, "Add another" under the last one and Remove on each when there is more than one. Never a delimited text box.
- Rows that can go out of date carry a checked date. "Confirm still correct" records today without retyping anything; past the town's re-check interval the row shows a "Due for a check" chip and the page header counts what is due. Due is a warning, never a block.
- A row that other records use says so in a "Used by" column ("Used on 2 lists"), which opens to each use with its number and status, linked. A row that keeps history opens "Earlier versions" in a dialog, newest first, each with who replaced it and when.

## Notice contacts

- `/staff/notice-contacts` (formerly Rosters) keeps the people mailed notice instead of, or as well as, the parcel owner: condo associations, manufactured housing parks, conservation and preservation restriction holders, and a read-only view of the regional and state contacts kept in Settings. Each section opens with one plain line saying when its people are notified. Tables show full mailing addresses.
- Each row has Edit, Confirm still correct, Earlier versions and Used by. Restriction holders also have End, which asks for a date and confirms; Undo stays until a list issued after the ending has left the holder off. The land records check ("Land records checked for new restrictions on ...", with Record a check) is the only review kept for a whole section, because a list cannot be issued until it has been done once.
- The re-check interval is stored in the board settings (365 days by default) but is changed on the Notice contacts page, beside the due count, by anyone who can edit settings; saving publishes a new board settings version with only that value changed. Past it the row shows Due for a check and abutter lists print its source as out of date; they still issue.
- Multi-unit parcels with no association on file are listed under the condo section, each with Add association already filled in with the parcel. The abutter list links its missing-association reason to the same prefilled Add, and links every notice contact source back to its row.
- A parcel page shows a "Notice goes to" panel with that parcel's officers, park owner and tenants, or restriction holders, each with Edit.

## Actions and roles

- An action appears only when the viewer can take it and it applies in the record's current state. A finished application shows no board, review or abutter actions; money, records and legal-deadline work stays available.
- The server refuses the same action on the same grounds. Hiding a button is never the only check.
- The staff menu lists only pages the viewer can open. A viewer with no list to work from lands on a page they can use, never on a bare permission refusal.
- Reviewers and board members see read-only versions of records, without buttons they cannot use.
- Every destructive action asks first in one shared dialog, `ConfirmDialog` (`src/components/ConfirmDialog.tsx`). Destructive means it deletes, removes, cancels, voids, withdraws, revokes, disables, dismisses, ends, denies, closes, rejects, unpublishes, resets, restores an older version over a newer one, or records an outcome that cannot be taken back (a payment outcome by hand, a refund, a returned check, a board decision). A form opts in with `ActionForm`'s `confirm` prop; `when` limits it to the choices that destroy (closing a case, unticking Public).
- The dialog's title names the record and the action ("Cancel the November 20, 2026 Zoning Board meeting?") and its one line says what changes, in plain words. Cancel sits on the left and takes focus; the confirm button on the right names the action again and is destructive, except for publishing and recording a board vote or decision. A required reason is checked before the dialog opens, Escape and Cancel send nothing, and the server keeps its own checks. `src/components/destructiveActions.test.ts` fails when a form with a destructive label or action has no `confirm`.
- Removing a row or block inside a settings editor changes only the unsaved draft and does not ask; Publish asks.
- An issued permit, or one that closed when it was issued, is corrected in place through "Correct this permit" in the record rail, shown only to staff who hold both `application.amend_after_review` and `permit.issue`. A correction changes the contractor (picked from the project's parties or added) and license number, the form answers and the project title, and needs a reason. It keeps the permit number and reissues the permit as the next revision: a correction snapshot, a `permit.correct` audit entry with the reason, the revision and the values before and after, and a new stored permit copy. The earlier copy stays on file marked superseded; the portal lists it under the current copy as an earlier version. Print permit, Print placard and the stored copy show "Corrected, revision N, <date>" under the title.
- The correction dialog checks the fees on the corrected answers as staff type ("No fee changes") and lists who will be notified: every party with an account, and a replaced contractor. A change to an answer that decides the review, or one that would change any fee, is refused with a pointer to an amended application, and so is changing the permit type, the parcel or the board's conditions, which the dialog does not offer. Saving asks first ("Reissue permit <number> as revision N?").

## Builders

Builders let town staff shape configuration without knowing how it is stored. The form builder (`src/components/config/formBuilder`) and the letter builder (`src/components/config/letterBuilder`) follow the same rules.

- Three panes: what can be added on the left, the thing being built in the middle as its reader will see it, and the settings of the selected part on the right. In narrow windows the panes stack, and selecting a part scrolls its settings into view.
- Plain-language names everywhere: question types are Short answer, Paragraph, Whole number, Number, Money, Date, Dropdown, Checkboxes, Yes / No, Email, Phone and Section. Rules read "Show only when" and "Required only when" and are built from three dropdowns (question, test, answer). Storage details (the key, the fact, staff only) sit under a closed "Advanced" disclosure.
- Keys are made from the text a person types and stop changing once a published version uses them.
- Reorder by dragging a handle, by keyboard on the same handle (space, arrows, space), or with Move up and Move down.
- Removing something that other configuration uses opens a warning that names each use before anything changes.
- "Preview as applicant" shows the real form at desktop and phone width, fillable, with the same validation messages applicants see.

The letter builder edits templates on a letter-sized page under the town letterhead:

- The Insert pane holds blocks (Signature, Conditions list, Field table, Notice box), the parts filled in from the record for that kind of document, and merge fields grouped and named in plain words. Insert and toolbar buttons never take focus from the letter.
- Merge fields are highlighted chips with their plain name. "Preview" with a real record of the right kind swaps every chip and record part for that record's values; "Download PDF" renders exactly what would be sent.
- Wording state law requires is a locked block: a lock icon, the reason ("Required by state law"), and no way to edit or delete it.
- In settings-menu width the Insert pane and the selected part's settings share the left column; wide windows get three columns.

## Board packets

A meeting's packet is prepared, sent and tracked in one "Packet" panel on the meeting page (`/staff/boards/meetings/[meetingId]#packet`). `/staff/boards/packets` is a read-only list of upcoming meetings with each packet's state and a link to that panel. Older packets that belong to no meeting are listed under it, each on its own page where its private links can still be turned off.

- The panel opens with one state line: "Publish the agenda to start the packet", "Not sent yet", "Sent to N members on <date>", "N changes not sent yet" or "Meeting cancelled. Packet closed." (`src/features/boards/packetState.ts`). The same line is the Packet fact in the rail and the chip on the packets list. While the packet is unsent or has changes not sent, the rail's next step is a link to the panel ("Prepare the packet" or "Send the packet update").
- Four steps in order: Gather, Review, Send, Track.
- Gather lists candidates grouped by agenda item, plus anything already in the packet that is no longer on the agenda, with a checkbox each. A document that cannot go in stays in its group with the reason in plain words ("Not shared with the board", "Belongs to the ZBA", "No approved public copy"); "Not shared with the board" carries a Share with the board button for viewers who can manage documents. Each application offers "Make TRC summary" (or, once one exists, an unchecked "Make a new TRC summary") or says "No TRC review on this application". Viewing creates nothing; only Save does.
- Review shows the contents in order with a cover page preview and the title, prefilled "<Board> packet, <date>". When the agenda is republished it asks "The agenda changed. Replace it in the packet?"
- Send offers "Send to the <board> (N members)" from current membership, and "Also send to someone outside the board" behind a disclosure, which sends a private link with an expiry. Each recipient row says in words what they get ("signs in on the board page" or "private link, expires <date>") with Resend, and Turn off link for private links, which asks first.
- After sending, the packet stays editable. Additions, removals and replacements are held as changes not sent, marked beside each item in Review, until Send update emails only what changed ("Added: ...; Replaced: ...").
- Track is a table per recipient: sent, first opened, last opened, documents opened.
- Cancelling a meeting turns off its packet's private links, and the cancel form asks whether to email the packet's recipients.
- Members see a packet on `/board` only once it is sent: "New" until they open it, "Updated <date>" after an update they have not opened, and the meeting marked Cancelled instead of disappearing. The packet page starts with the cover page, marks items Added or Replaced, and keeps withdrawn or removed items in the list with the reason.

## Links

- Links inside page content are underlined, from one rule in `components.css`. Links in table cells stay plain until hovered. Navigation, tabs, sort headers, chips and buttons are never underlined.
- Pages do not add color or underline classes to links; a link that must not underline opts out with `no-underline`.

## Copy

- Plain words, no internal jargon, and no text repeated within one panel (a gate's label and its reason, for example).
- A count appears only when it says something: "2 more overdue", never "0 overdue".
- An empty state says what to do next.
- A count of days reads "today" when it is zero.
- Dates read in full ("November 4, 2026") through `formatCivilDate`. Only the two work queues (Applications and Your reviews) and the parcel page's Records table use the short month, to keep their many columns on one line.

## Type and shape

- `h1` and `h2` use `Charter, "Source Serif 4 Variable", serif` (22px and up). `h3` and `h4` use the body face in bold.
- Everything else uses Mulish Variable at `-0.02em` tracking. Fonts are self-hosted through `@fontsource-variable`.
- Scale is Major Second (1.125) from a 16px base.
- 4px spacing base, 10px radius, 24px card padding, 1200px maximum content width.
- Staff pages start at the same distance from the sidebar on every page. Content aligns left beside the sidebar and is never centered, so wider windows add space on the right only.

## Two densities

- Public shell (`.public-shell`): 16px minimum body text, 44px minimum tap targets, single-column forms, mobile first.
- Staff shell (`.staff-shell`): denser tables, 14px allowed in tables only.
