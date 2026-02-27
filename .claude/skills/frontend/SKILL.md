---
name: frontend-design
description: Build HILO-branded frontend interfaces, dashboards, and UI components. Use when creating React or Next.js components, dashboards, data visualizations, interactive UI elements, or any frontend work for HILO Semantics products. Use when user says "UI", "component", "dashboard", "frontend", "visualization", "React", "page", "layout", "design", or "responsive". Do NOT use for API endpoints (use api-development skill) or Docker configuration (use docker skill).
compatibility: Requires Node.js 20+, Tailwind CSS, React or Next.js. Fonts loaded via Google Fonts and Fontshare CDN.
metadata:
  author: HILO Semantics
  version: 1.0.0
---

# Building Frontends for HILO Semantics

## Stack

- **Frameworks**: React (Node UI), Next.js (websites, apps)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with HILO theme
- **Icons**: Lucide React
- **Charts/viz**: Recharts or D3
- **State**: React hooks, Zustand for complex state
- **Testing**: Vitest / React Testing Library

## Performance Note

Take your time with frontend work. Quality and visual polish matter more than speed. Do not skip loading states, error states, or accessibility. Review the design patterns reference before building any dashboard or page layout.

## Instructions

### Step 1: Load brand assets

Before writing any component, ensure fonts and theme are loaded. See `references/brand-reference.md` for CSS custom properties and font CDN links. See `references/tailwind-theme.md` for the Tailwind configuration.

CRITICAL: Never hardcode HILO colors or font names in components. Always use Tailwind theme classes (`bg-hilo-purple`, `font-display`) or CSS variables (`var(--hilo-purple)`). Single source of truth for the brand.

### Step 2: Read the design patterns

Before building any page or dashboard, consult `references/design-patterns.md`. It defines HILO's modern design language: color strategy, whitespace, depth, layout grids, KPI card patterns, data tables, and component styles. Following these patterns is the difference between a generic dashboard and a polished, modern interface.

### Step 3: Build the component

Follow this order for every component:

1. Define TypeScript props interface
2. Write the JSX structure with semantic HTML
3. Apply Tailwind classes using HILO theme tokens
4. Add loading skeleton and error state
5. Handle responsive breakpoints (mobile → tablet → desktop)
6. Add keyboard accessibility and ARIA labels

CRITICAL: Every component must have typed props, a loading state, and an error state. No exceptions.

### Step 4: Verify

Run through this checklist before marking any frontend work as done:

```
- [ ] Neutral base with strategic purple accents (not purple everywhere)
- [ ] Generous whitespace between sections and cards
- [ ] Layered depth: shadows, glass effects, no flat hard borders
- [ ] HILO theme tokens used (no hardcoded colors/fonts)
- [ ] Epilogue for headings, Satoshi for body text
- [ ] Responsive on mobile, tablet, desktop
- [ ] Keyboard accessible, semantic HTML
- [ ] TypeScript types for all props
- [ ] Loading skeletons and error states handled
- [ ] Micro-interactions on hover/click
```

## Examples

**Example 1: "Build a dashboard card showing event count"**

Actions:
1. Create `EventCountCard.tsx` with props: `{ title: string; count: number; trend: number; status: 'ok' | 'warning' | 'error' }`
2. Card: `bg-white rounded-hilo shadow-hilo p-6 border-t-2 border-hilo-purple`
3. Title in `font-body text-sm text-hilo-dark/60`, count in `font-display text-3xl`
4. Trend badge: green pill for positive, red for negative
5. Loading: skeleton with pulse animation matching card shape

Result: Branded card with trend indicator, responsive, accessible, with all states.

**Example 2: "Create the main dashboard layout"**

Actions:
1. Consult `references/design-patterns.md` for the dashboard page layout grid
2. Sidebar: fixed left, 240px wide, collapsible to 64px
3. Top KPI row: `grid grid-cols-4 gap-4` with metric cards
4. Middle: `grid grid-cols-3 gap-6` — chart spanning 2 cols, table in 1 col
5. Bottom: full-width detailed event table

Result: Modern dashboard layout with clear visual hierarchy and breathing room.

**Example 3: "Build an events data table"**

Actions:
1. Create `EventsTable.tsx` with typed `Event[]` prop
2. Sticky header: `bg-hilo-purple-50 font-display text-sm`
3. Rows: `hover:bg-hilo-purple-50/50`, subtle dividers (`divide-y divide-gray-100`)
4. Status column: colored badge pills
5. Loading: 5 skeleton rows matching column widths

Result: Sortable, responsive table with modern styling and all states.

## Troubleshooting

**Issue: Dashboard looks generic / not modern**
Cause: Flat cards with hard borders, no whitespace, purple overused, no depth.
Solution: Re-read `references/design-patterns.md`. Add shadows, round corners, glass effects. Use purple as accent only. Add whitespace between sections.

**Issue: Fonts not loading**
Cause: CDN links missing from HTML head.
Solution: Check `references/brand-reference.md` for exact CDN links.

**Issue: Tailwind classes not applying**
Cause: Custom theme not loaded in `tailwind.config.js`.
Solution: Compare config to `references/tailwind-theme.md`.

**Issue: Component looks wrong in dark mode**
Cause: Hardcoded white/black instead of theme tokens.
Solution: Use `text-hilo-dark` / `bg-hilo-dark` and opacity variants. Never `text-black` or `bg-white` directly.

## References

- `references/brand-reference.md` — CSS custom properties, font loading, common CSS patterns. Framework-agnostic.
- `references/tailwind-theme.md` — Tailwind config and utility class combinations.
- `references/design-patterns.md` — Modern design language, layout grids, component patterns. Read before building any dashboard.
- `references/node-ui-context.md` — HILO Node-specific: graph explorer, event monitor, health dashboard.
