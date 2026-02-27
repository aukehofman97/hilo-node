# Design Patterns — HILO Frontends

Modern design language and layout patterns for all HILO interfaces. Read this before building any dashboard, page, or component.

## Design Language

### Neutral base, strategic color
Start with soft grays and whites as the foundation. Use HILO purple only as an accent: active states, primary buttons, KPI highlights, and status indicators. A dashboard is not a canvas to paint purple — it's a workspace where purple draws the eye to what matters.

Bad: purple backgrounds, purple cards, purple headers everywhere.
Good: white/gray canvas with purple on the active nav item, primary button, and one KPI highlight.

### Generous whitespace
Dense data needs breathing room. Use consistent spacing (`space-4`, `space-6`, `space-8`) between cards and sections. Cramped layouts feel dated. White space is not wasted space — it creates visual hierarchy and lets the user's eye rest.

Minimum spacing between major sections: `space-y-6` (1.5rem).
Minimum card padding: `p-6` (1.5rem).
Minimum gap in grid layouts: `gap-4` (1rem) for tight grids, `gap-6` (1.5rem) for dashboard sections.

### Layered depth, not flat boxes
Use subtle shadows (`shadow-hilo`), glass-morphism (`bg-white/70 backdrop-blur-glass`), and layered surfaces to create depth. Avoid flat cards with hard borders — they look like spreadsheet cells.

Modern depth stack:
- Page background: `bg-gray-50` or `bg-hilo-purple-50/30`
- Cards float above: `bg-white shadow-hilo`
- Modals float above cards: `bg-white shadow-hilo-lg` with backdrop blur
- Tooltips float above everything

### Rounded, not sharp
Use `rounded-hilo` (0.75rem) for cards and containers, `rounded-full` for avatars, badges, and pills. Sharp 90-degree corners feel outdated. Even subtle rounding (0.5rem) is better than none.

### Micro-interactions
Add `transition-colors` (200ms) on hover states. Subtle scale on clickable cards (`hover:scale-[1.01] transition-transform`). Smooth loading skeletons with pulse animation instead of spinners. Small movements make interfaces feel alive and responsive.

## Page Layouts

### Dashboard page
```
┌──────────────────────────────────────────────┐
│  Sidebar (collapsible)  │  Main content       │
│  - Navigation           │                     │
│  - Active = purple bg   │  ┌─ KPI row ──────┐ │
│                         │  │ Card  Card  Card│ │
│                         │  └─────────────────┘ │
│                         │                     │
│                         │  ┌─ Content grid ──┐ │
│                         │  │ Chart    Table   │ │
│                         │  │ (2/3)   (1/3)   │ │
│                         │  └─────────────────┘ │
│                         │                     │
│                         │  ┌─ Detail section ┐ │
│                         │  │ Full-width table │ │
│                         │  └─────────────────┘ │
└──────────────────────────────────────────────┘
```

- **Sidebar**: fixed left, 240px on desktop, collapsible to 64px (icon-only). Slide-out drawer on mobile. Background: `bg-white` or `bg-hilo-dark` for dark variant.
- **Main content**: scrollable, padded (`p-6`), with `space-y-6` between sections.
- **KPI row**: `grid grid-cols-2 md:grid-cols-4 gap-4`. Top of the page, answers "how are we doing?" at a glance.
- **Content grid**: `grid grid-cols-1 lg:grid-cols-3 gap-6`. Charts get 2 columns, supporting tables get 1.
- **Detail section**: full-width tables or drill-down views at the bottom.

### Settings / form page
Centered content, max-width 640px. Sections separated by subtle dividers. Save button sticky at bottom or top-right.

## Component Patterns

### KPI card
```
┌─────────────────────────┐
│  Label          ↑ 12%   │  ← font-body text-sm text-hilo-dark/60 + trend badge
│  2,847                  │  ← font-display text-3xl text-hilo-dark
│  ▁▂▃▅▆▇█▆▅▃            │  ← sparkline (optional, tiny chart, no axis labels)
└─────────────────────────┘
```

Base: `bg-white rounded-hilo shadow-hilo p-6`
Primary KPI accent: `border-t-2 border-hilo-purple` or `border-l-4 border-hilo-purple`
Trend badge: `rounded-full px-2 py-0.5 text-xs font-medium`
- Positive: `bg-green-50 text-green-700`
- Negative: `bg-red-50 text-red-700`
- Neutral: `bg-gray-100 text-gray-600`

### Data table

- Container: `bg-white rounded-hilo shadow-hilo overflow-hidden`
- Header row: `bg-hilo-purple-50 font-display text-sm text-hilo-dark/80 uppercase tracking-wide`
- Body rows: `divide-y divide-gray-100` (no heavy borders)
- Alternating: `even:bg-gray-50/50` (very subtle)
- Hover: `hover:bg-hilo-purple-50/50`
- Sortable: chevron icon next to header text, rotates on sort direction
- Pagination: bottom row with page numbers, subtle styling
- Loading: skeleton rows matching column widths, `animate-pulse`

### Status badges

Rounded pill shape: `rounded-full px-2.5 py-1 text-xs font-medium`
- Active/Primary: `bg-hilo-purple-100 text-hilo-purple-dark`
- Success: `bg-green-50 text-green-700`
- Warning: `bg-amber-50 text-amber-700`
- Error: `bg-red-50 text-red-700`
- Neutral: `bg-gray-100 text-gray-600`

Always include a text label. Never rely on color alone (accessibility).

### Navigation sidebar

- Active item: `bg-hilo-purple text-white rounded-hilo`
- Inactive item: `text-hilo-dark/60 hover:bg-hilo-purple-50 rounded-hilo`
- Icons: Lucide React, 20px, left of label
- Collapsed: icons only, tooltip on hover showing label
- Section dividers: subtle `border-b border-gray-100` between groups

### Charts (Recharts)

- Primary data: `#9063CD` (hilo-purple)
- Secondary data: `#B594E0` (hilo-purple-light)
- Tertiary: `#E8DDF3` (hilo-purple-100)
- Grid lines: `#C6C6C6` at 20% opacity
- Bar corners: rounded (`radius={4}`)
- Axis labels: `font-body`, `text-xs`, `text-hilo-dark/60`
- Tooltip: `bg-white shadow-hilo rounded-hilo p-3`
- No chart borders or outlines — let the data breathe

### Modals and overlays

- Backdrop: `bg-black/40 backdrop-blur-sm`
- Modal card: `bg-white rounded-hilo shadow-hilo-lg p-8 max-w-lg mx-auto`
- Animate in: scale from 0.95 to 1 + opacity from 0 to 1, 200ms ease
- Close button: top-right, `text-hilo-dark/40 hover:text-hilo-dark`

### Empty states

Never show a blank page. Always show:
- An icon or illustration (Lucide icon at 48px, `text-hilo-dark/20`)
- A short message explaining what goes here
- A primary action button to get started

### Loading states

Use skeleton placeholders that match the shape of the content:
- Card skeleton: `bg-gray-200 rounded-hilo animate-pulse` matching card dimensions
- Table skeleton: rows of `bg-gray-200 h-4 rounded animate-pulse` at varying widths
- Text skeleton: `bg-gray-200 h-4 rounded w-3/4 animate-pulse`

Never use spinners. Skeletons feel faster and more predictable.

## Anti-patterns

- **Purple overload**: using purple backgrounds, purple cards, purple text all at once. Pull back.
- **Flat grid of boxes**: cards with hard borders, no shadows, equal visual weight. Add depth and hierarchy.
- **Spinner for everything**: replace with skeleton placeholders.
- **Cramped layout**: no padding, no gap between cards. Add whitespace.
- **Sharp corners everywhere**: use `rounded-hilo` consistently.
- **Missing states**: no loading, no error, no empty. Every view needs all three.
- **Color-only status**: a red dot without a label is not accessible.
