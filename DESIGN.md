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
- `RecordLayout` (`src/components/layout/RecordLayout.tsx`): wraps a record's sections and adds an "On this page" index on wide screens once there are four or more panels.
- Staff navigation is grouped by the `group` field on each entry in `src/features/staffNav/navItems.ts` and marks the current page.

## Type and shape

- `h1` and `h2` use `Charter, "Source Serif 4 Variable", serif` (22px and up). `h3` and `h4` use the body face in bold.
- Everything else uses Mulish Variable at `-0.02em` tracking. Fonts are self-hosted through `@fontsource-variable`.
- Scale is Major Second (1.125) from a 16px base.
- 4px spacing base, 10px radius, 24px card padding, 1200px maximum content width.

## Two densities

- Public shell (`.public-shell`): 16px minimum body text, 44px minimum tap targets, single-column forms, mobile first.
- Staff shell (`.staff-shell`): denser tables, 14px allowed in tables only.
