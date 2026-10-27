# Fluxeo design system

Fluxeo's interface follows Apple's Liquid Glass language (macOS and iOS 26), adapted for a data-dense web app. This document is the reference for anyone building or changing UI. The tokens live in `src/client/styles/tokens.css`; the shadcn/Base UI primitives in `src/client/components/ui/` consume them.

## Principles

1. **Glass is for chrome, not content.** Translucent material belongs to the layer that frames the work: the sidebar, toolbars, menus, popovers, the search bar. Tables, charts and body text sit on solid cards, so they stay readable over any background.
2. **Content leads, chrome recedes.** Labels use a hierarchy of gray (`label`, `label-secondary`, `label-tertiary`) rather than borders and boxes. Use a separator only where alignment alone can't show the grouping.
3. **Concentric geometry.** Nested corners stay parallel: inner radius = outer radius − padding. A 20px card with 20px padding holds 10px controls; a 22px glass panel with 10px padding holds 12px rows.
4. **One accent, used sparingly.** System blue marks the primary action, the selection and focus. The multicolor AI gradient is reserved for generative-engine (GEO) features. It tells users "this is about AI answers" and nothing else.
5. **Motion is physical and brief.** Controls compress on press (`scale(0.97)`), sheets and popovers settle on a spring curve, and nothing animates longer than 420ms. All motion collapses under `prefers-reduced-motion`.
6. **Accessible by default.** Text meets WCAG AA in both themes. Glass falls back to solid fills under `prefers-reduced-transparency` and where `backdrop-filter` is unsupported. Focus is always visible as a 4px accent halo.

## Tokens

### Color

| Token (Tailwind)                            | Light                   | Dark       | Use                                 |
| ------------------------------------------- | ----------------------- | ---------- | ----------------------------------- |
| `background`                                | `#f5f5f7`               | `#000000`  | App canvas, under the ambient light |
| `card`                                      | `#ffffff`               | `#1c1c1e`  | Solid content surfaces              |
| `popover`                                   | `#ffffff`               | `#2c2c2e`  | Dialogs and sheets                  |
| `foreground` / `label`                      | `#1d1d1f`               | `#f5f5f7`  | Primary text                        |
| `label-secondary`                           | 64% gray                | 64% gray   | Descriptions, metadata              |
| `label-tertiary`                            | 38% gray                | 34% gray   | Group labels, hints, timestamps     |
| `fill` / `fill-secondary` / `fill-tertiary` | translucent gray ladder |            | Control backgrounds, chips, tracks  |
| `separator`                                 | 14% gray                | 60% gray   | Hairlines between rows              |
| `primary`                                   | `sys-blue`              | `sys-blue` | Primary action, selection, focus    |

**System colors**, used with `text-sys-*` and `bg-sys-*` and tuned per theme like Apple's: `blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `mint`, `teal`, `cyan`, `gray`.

**Semantic colors:**

- `success` is green, `warning` is orange, `destructive` is red, `info` is cyan.
- `chart-1` to `chart-5` are blue, orange, green, purple and pink, which stay distinguishable for common color-vision deficiencies.

**Score bands** (`scoreTone()` in `features/geo-readiness/GeoScoreRing.tsx`):

| Score    | Color  | Label      |
| -------- | ------ | ---------- |
| ≥ 80     | green  | Excellent  |
| ≥ 60     | teal   | Good       |
| ≥ 40     | orange | Needs work |
| below 40 | red    | Poor       |

Reuse these bands for any 0–100 score.

### Materials

| Utility            | Recipe                                                                           | Use                                      |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| `glass`            | 56% white, 28px blur, 180% saturation, top highlight, hairline edge, soft shadow | Sidebar, toolbars, search bars           |
| `glass-thick`      | 78% white, 40px blur, e3 shadow                                                  | Menus, selects, comboboxes, tooltips     |
| `glass-thin`       | 36% white, 18px blur                                                             | Mobile top bar, overlays on busy content |
| `surface`          | Solid `card`, 0.5px edge, e1 shadow                                              | Cards and table cards                    |
| `app-canvas`       | `background` plus three low-chroma radial lights                                 | `body` only                              |
| `bg-ai`, `text-ai` | Blue → indigo → purple → pink gradient                                           | GEO / AI features only                   |

### Typography

The stack is SF Pro on Apple platforms (`-apple-system`), then Inter, then the platform UI font. Sizes follow Apple's text styles, scaled to a 14px web body:

| Utility            | Size / line height | Weight | Tracking | Use                               |
| ------------------ | ------------------ | ------ | -------- | --------------------------------- |
| `text-large-title` | 32 / 1.15          | 700    | −0.025em | Marketing or empty-state hero     |
| `text-title-1`     | 26 / 1.2           | 700    | −0.022em | Page title (`PageHeader`)         |
| `text-title-2`     | 22 / 1.25          | 600    | −0.02em  | Result headline, score label      |
| `text-title-3`     | 18 / 1.3           | 600    | −0.015em | Section heading in a long page    |
| `text-headline`    | 15 / 1.35          | 600    | −0.01em  | Card title, dialog title          |
| `text-body`        | 14 / 1.45          | 400    | −0.006em | Default copy (`text-sm`)          |
| `text-callout`     | 13 / 1.4           | 400    | —        | Section labels, fix suggestions   |
| `text-footnote`    | 12 / 1.35          | 400    | —        | Metadata, captions under values   |
| `text-caption`     | 11 / 1.3           | 400    | +0.01em  | Sidebar group labels, tiny badges |

Numbers in tables and metrics use `tabular-nums`.

### Radius

The base is `--radius: 10px`.

| Utility          | Value   | Use                                             |
| ---------------- | ------- | ----------------------------------------------- |
| `rounded-sm`     | 6px     | Checkboxes, inline chips                        |
| `rounded-md`     | 8px     | Menu items                                      |
| `rounded-lg`     | 10px    | Inputs, sidebar rows, small tiles               |
| `rounded-xl`     | 14px    | Popovers, small cards, alerts                   |
| `rounded-2xl`    | 20px    | Cards, table cards                              |
| `rounded-3xl`    | 24px    | Dialogs, alert dialogs                          |
| `rounded-[22px]` | 22px    | The floating sidebar panel and glass search bar |
| `rounded-full`   | capsule | Buttons, badges, segmented controls, stat chips |

### Elevation

| Token       | Use                                              |
| ----------- | ------------------------------------------------ |
| `shadow-e1` | Resting cards (inside `surface`)                 |
| `shadow-e2` | Hovered or raised tiles, icon wells on gradients |
| `shadow-e3` | Dialogs, menus, popovers                         |

Shadows are wide and low-opacity. Never use a hard drop shadow.

### Motion

| Token                        | Value                            | Use                                     |
| ---------------------------- | -------------------------------- | --------------------------------------- |
| `ease-(--ease-spring)`       | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets, dialogs, segmented thumb, rings |
| `ease-(--ease-snappy)`       | `cubic-bezier(0.2, 0.9, 0.3, 1)` | Press and hover feedback                |
| `duration-(--duration-fast)` | 120ms                            | Hover, press                            |
| `duration-(--duration-base)` | 220ms                            | Tabs, popovers, dialogs                 |
| `duration-(--duration-slow)` | 420ms                            | Score rings filling, page-level reveals |

`pressable` adds the press-to-shrink behavior; `Button` already includes it.

## Components

### Button

**Description:** a capsule-shaped action. Use exactly one `default` button per view for the primary action.

**Variants**

| Variant       | Use when                                                           |
| ------------- | ------------------------------------------------------------------ |
| `default`     | The primary action of a view (system blue, inner highlight)        |
| `ai`          | The primary action runs a generative-engine analysis (AI gradient) |
| `outline`     | Secondary actions next to a primary one                            |
| `secondary`   | Tertiary actions, toolbar buttons (translucent fill)               |
| `ghost`       | Icon buttons, actions inside rows and menus                        |
| `destructive` | Delete or remove (tinted red, never solid red)                     |
| `link`        | Inline navigation inside text                                      |

**Sizes:** `xs` 24px, `sm` 28px, `default` 36px, `lg` 44px, plus `icon`, `icon-xs`, `icon-sm` and `icon-lg`.

**States**

| State    | Visual                                                   | Behavior                                 |
| -------- | -------------------------------------------------------- | ---------------------------------------- |
| Default  | Capsule, variant fill                                    | —                                        |
| Hover    | Brightness +10% (filled), or a deeper fill (translucent) | —                                        |
| Active   | Scales to 0.97                                           | 120ms snappy                             |
| Focus    | 4px accent halo at 25%                                   | Keyboard only                            |
| Disabled | 40% opacity                                              | Not interactive                          |
| Pending  | Spinner before the label                                 | `pending` prop; also disables the button |

**Accessibility:** native `<button>` through Base UI. `pending` sets `aria-busy`. Icon-only buttons need an `aria-label`.

| ✅ Do                                          | ❌ Don't                        |
| ---------------------------------------------- | ------------------------------- |
| One primary (or `ai`) button per view          | Two blue buttons side by side   |
| `ai` only for actions that call a GEO analysis | Use the gradient for decoration |
| Label with a verb ("Analyze page")             | "Submit", "OK"                  |

```tsx
<Button variant="ai" size="lg" pending={query.isFetching}>
  <Sparkles />
  Analyze page
</Button>
```

### Card

**Description:** the solid content surface (`surface`, `rounded-2xl`, 20px padding).

- `size="sm"`: 14px radius and padding, for metric tiles.
- `size="lg"`: 24px padding.

**Composition:** `CardHeader`, `CardTitle` (`text-headline`), `CardDescription`, `CardAction`, `CardContent`, `CardFooter` (tinted fill, separator above).

| ✅ Do                                 | ❌ Don't                        |
| ------------------------------------- | ------------------------------- |
| Put tables, charts and lists on cards | Put body text directly on glass |
| Nest 10px controls inside 20px cards  | Nest a card inside a card       |

### Tabs (segmented control)

The default `TabsList` is Apple's segmented control: a capsule `fill-tertiary` track with a raised white thumb (`#636366` in dark) on the active segment. Use it for two to five peer views of the same data. Use `variant="line"` for page-level navigation tabs.

**Keyboard:** arrow keys move between segments; Home and End jump to the ends (Base UI).

### Inputs, Select, Combobox, Textarea

- At rest: a filled field on `fill-tertiary` with no border, 36px tall, `rounded-lg`.
- On focus: the field turns solid `card` and gains a 4px accent halo at 20%.
- When invalid: a red border and halo. Pair it with a `Field` error message, not color alone.

### Menus, Select popups, Tooltips

- Menus, select popups and comboboxes use `glass-thick`, `rounded-xl` and 6px inner padding.
- The highlighted item fills with system blue and white text, like a macOS menu.
- Tooltips are small `glass-thick` capsules with no arrow.

### Dialog, Alert dialog, Sheet

- Dialogs and alert dialogs: solid `popover`, `rounded-3xl`, 24px padding, `shadow-e3`, entering on the spring curve.
- The backdrop is 25% black with a 3px blur.
- The footer has no band. Buttons sit right-aligned on the dialog surface, with the primary action last.

### Sidebar (source list)

- A floating glass panel (`variant="floating"`, 22px radius, 10px inset from the window).
- Rows are 10px-radius items with secondary-gray icons.
- The selected row gets a soft fill, medium weight and an accent-colored icon, like the macOS source list.
- Group labels are `caption` size and semibold in `label-tertiary`, in sentence case (not uppercase).

### Score ring (`GeoScoreRing`)

An Activity-style ring for 0–100 scores: a translucent track in the band color, with a rounded gradient arc that fills on the spring curve.

| Size  | Ring         | Use            |
| ----- | ------------ | -------------- |
| 168px | 16px stroke  | Hero score     |
| 36px  | 4.5px stroke | Category tiles |

Always print the number inside the ring; the color is never the only signal.

### Badge

A capsule label. Use `soft` for plan and status tags, `success`, `warning` and `info` for states, and `bg-ai text-white` for the "AI" marker on GEO features.

## Patterns

### Page layout

- Page padding is 16px on mobile and 32px from `md` up.
- Content is capped at `max-w-6xl` (dense tools may use `max-w-7xl`).
- Every page opens with `PageHeader` (title in `title-1`, description in `label-secondary`), then a primary input or toolbar, then the results.

### Analysis pages (input → result)

1. A **glass command bar**: the input plus one primary (`ai` or `default`) button.
2. **Before the first run**, show what the tool measures as icon cards, not an empty box.
3. **While loading**, show skeletons in the exact shape of the result.
4. **For the result:** a hero card (ring plus verdict plus key stats), then metric tiles, then a prioritized list of fixes, failures first.
5. **On error**, show `QueryError` with a retry. Copy says what to check, never just "Something went wrong."

### Check lists

- Status is shown by icon and color together: green check, orange alert or red cross.
- Each row shows the label and its category, what we found (secondary label), and how to fix it (a tinted `fill-tertiary` callout).
- Passing checks sink to the bottom.

### Data display

- Tables sit in `TableCard` (`surface`, `rounded-2xl`) with hairline row separators.
- Stat chips are `rounded-full bg-fill-tertiary`, with a bold tabular value and a secondary-label unit.

## Do's and don'ts

| ✅ Do                                                     | ❌ Don't                              |
| --------------------------------------------------------- | ------------------------------------- |
| Use tokens (`bg-fill-tertiary`, `text-label-secondary`)   | Hardcode hex values or `gray-500`     |
| Glass for chrome, solid surfaces for content              | Glass behind tables or long text      |
| Sentence case everywhere                                  | UPPERCASE labels                      |
| Keep corners concentric                                   | Mix 4px and 20px corners in one stack |
| Reserve the AI gradient for GEO features                  | Gradient buttons for ordinary actions |
| Test light, dark, reduced motion and reduced transparency | Ship a screen checked in one theme    |

## Theming mechanics

- The theme is set with `data-theme="fluxeo"` or `data-theme="fluxeo-dark"` on `<html>` (`src/client/lib/theme.ts`). The `dark:` variant targets the dark theme.
- Users choose System, Light or Dark from the account menu.
- To add a token:
  1. Define its value in both theme blocks in `tokens.css`.
  2. Map it in `@theme inline` as `--color-<name>`.
  3. Document it here.

## Audit snapshot (at adoption)

| Category                           | State                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color tokens                       | Every shadcn variable is mapped to Apple system colors. Legacy hardcoded hex remains in `.tag-chip-*` and `.score-tier-*` in `app.css`; these are candidates to move onto `sys-*` tokens. |
| Components restyled through tokens | Button, Card, Input, Textarea, Select, Combobox, Input group, Tabs, Dropdown, Tooltip, Dialog, Alert dialog, Sheet backdrop, Table card, Empty, Skeleton, Progress, Alert, Sidebar        |
| Not yet restyled                   | Charts' internal colors (they already use `chart-*`), Toggle group (still square), Checkbox and Switch (shadcn defaults)                                                                  |

**Priority follow-ups**

1. Move the tag-chip and score-tier colors onto `sys-*` tokens.
2. Give `ToggleGroup` the segmented-control treatment.
3. Regenerate the PNG favicons and app icons from `public/fluxeo-mark.svg`.
