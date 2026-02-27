# UI Redesign Plan — Top Bar + Glassmorphism + Dark Mode
**Branch:** `feature/ui-redesign-topnav`
**Status legend:** `[ ]` pending · `[x]` done · `[~]` in progress

---

## Goal

Replace the dated fixed sidebar with a modern top bar navigation. Apply glassmorphism, a mesh gradient background, and a light/dark mode toggle. Result should feel like a premium monitoring dashboard — not a file manager.

---

## Design decisions made

### Navigation: top bar, not sidebar
A top bar suits a 4-item app well. It gives the content area full width and height without a competing vertical panel. The sidebar was wasted real-estate for this many items.

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│  [H] HILO Node │ Dashboard  Events  Explorer  Queue  │ ● node-a  🌙 │
├────────────────────────────────────────────────────────┤
│                                                        │
│   [Page content — full width, padded below topbar]    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- **Left:** Logo mark + "HILO Node" wordmark
- **Center:** 4 nav pill buttons with Lucide icons + labels
- **Right:** Live node status dot (green/red) + dark mode toggle
- **Active state:** `bg-hilo-purple text-white rounded-full` pill
- **Glass effect:** `bg-white/80 backdrop-blur-glass border-b border-white/20 shadow-hilo` (light) / `bg-hilo-dark/70 backdrop-blur-glass` (dark)
- **Mobile (< md):** Logo left, hamburger right → slide-down menu panel

### Background: mesh gradient, not flat gray
- **Light:** `bg-gradient-to-br from-hilo-purple-50/40 via-white to-white` + soft radial purple blobs
- **Dark:** `bg-gradient-to-br from-gray-950 via-[#1D1D1B] to-purple-950/20`

### Glassmorphism on cards
- `bg-white/70 backdrop-blur-glass rounded-hilo border border-white/30 shadow-hilo`
- Dark: `bg-white/5 backdrop-blur-glass border border-white/10`

### Dark mode
- Implemented via `darkMode: 'class'` (Tailwind) + `dark` class toggled on `<html>`
- Custom CSS variables for semantic tokens (background, surface, text, border)
- Persisted in `localStorage`
- Toggle button in top bar: sun/moon icon, smooth transition

### Color tokens — align to official brand reference
The current `tailwind.config.js` uses off-brand hex values. Updating to match `brand-reference.md`:
| Token | Current (wrong) | Brand reference (correct) |
|---|---|---|
| `hilo-purple` | `#6B46C1` | `#9063CD` |
| `hilo-purple-light` | `#9F7AEA` | `#B594E0` |
| `hilo-purple-dark` | `#553C9A` | `#6B3FA6` |
| `hilo-purple-50` | `#F5F3FF` | `#F5F0FA` |
| `hilo-purple-100` | `#EDE9FE` | `#E8DDF3` |
| `hilo-dark` | `#1A1A2E` | `#1D1D1B` |
| `hilo-gray` | `#E2E8F0` | `#C6C6C6` |

---

## Todo list

### T1 — Update `tailwind.config.js`
- [ ] Fix color tokens to match brand reference (7 values, see table above)
- [ ] Add `backdropBlur: { glass: '16px' }` extension
- [ ] Add `darkMode: 'class'` at root level
- [ ] Add dark semantic colors: `dark-bg`, `dark-surface`, `dark-border` for dark mode surfaces
- [ ] Add `animation: { 'fade-in': 'fadeIn 200ms ease', 'slide-down': 'slideDown 200ms ease' }` + keyframes

### T2 — Update `src/index.css`
- [ ] Update CSS custom properties to correct brand hex values (sync with tailwind.config.js)
- [ ] Add dark mode CSS custom property overrides inside `html.dark { ... }` block
- [ ] Add `.mesh-bg` utility — light gradient background with soft purple blobs (CSS radial gradients)
- [ ] Add `.mesh-bg-dark` utility — dark gradient background
- [ ] Add `.glass` utility — reusable glassmorphism combination
- [ ] Add `.glass-dark` utility

### T3 — Create `src/context/ThemeContext.tsx`
- [ ] `ThemeContext` with `theme: 'light' | 'dark'` and `toggleTheme()`
- [ ] On mount: read from `localStorage`, fall back to system preference (`prefers-color-scheme`)
- [ ] On toggle: flip class on `document.documentElement`, persist to `localStorage`
- [ ] Export `useTheme()` hook

### T4 — Build `src/components/TopBar.tsx` (new component)
- [ ] TypeScript props: `{ activePage: string; onNavigate: (page: string) => void }`
- [ ] Fixed top, full-width, `z-30`, height `h-16`
- [ ] Glass styling: light + dark variants
- [ ] Left section: purple square logo mark + "HILO Node" in `font-display font-bold`
- [ ] Center section: nav pills for all 4 pages with Lucide icons + labels
  - Active: `bg-hilo-purple text-white rounded-full px-4 py-1.5 text-sm font-medium`
  - Inactive: `text-hilo-dark/60 hover:text-hilo-dark hover:bg-hilo-purple-50 rounded-full px-4 py-1.5`
  - Dark variants of both
- [ ] Right section:
  - Node status indicator: pulsing green dot + "node-a" label
  - Dark mode toggle: `Sun` / `Moon` icon button with `title` attr
- [ ] Mobile (< `md`): hide center nav + right node label, show hamburger (`Menu` icon)
- [ ] Mobile menu state: `isMenuOpen` boolean, slide-down panel with vertical nav items
- [ ] All interactive elements keyboard accessible (tabIndex, onKeyDown Enter/Space)

### T5 — Update `src/App.tsx`
- [ ] Import `ThemeProvider`, wrap entire app
- [ ] Remove `Sidebar` import and usage
- [ ] Remove `collapsed` state (no longer needed)
- [ ] Add `TopBar` component
- [ ] Change layout: `flex-col` instead of `flex-row`
- [ ] Main content: `pt-16` (topbar height) instead of `marginLeft`
- [ ] Add `mesh-bg` (or dark variant) as background class based on theme
- [ ] Keep `activePage` state and `onNavigate` wiring

### T6 — Redesign `src/pages/Dashboard.tsx`
- [ ] Apply glassmorphism to service cards (`.glass` / `.glass-dark` utility)
- [ ] Add subtle `border-l-4 border-hilo-purple` accent on healthy cards, `border-red-400` on error
- [ ] Richer status badge: pulsing dot for healthy (`animate-pulse bg-green-400`), static for error
- [ ] Page header: larger title with node name chip (`bg-hilo-purple-50 text-hilo-purple-dark rounded-full`)
- [ ] Loading skeleton: glass-shaped skeleton cards (same dimensions as final cards)
- [ ] Dark mode text and background tokens throughout

### T7 — Delete `src/components/Sidebar.tsx`
- [ ] Remove the file entirely

### T8 — Commit and push
- [ ] Verify UI renders at `http://localhost:3000` — no console errors
- [ ] Verify dark mode toggle works and persists across refresh
- [ ] Verify all 4 nav items navigate correctly
- [ ] Verify mobile menu opens/closes on small viewports
- [ ] Verify health cards show correct live status
- [ ] `git add` all changed files
- [ ] `git commit -m "feat: top bar nav, glassmorphism, dark mode"`
- [ ] `git push origin feature/ui-redesign-topnav`

---

## Files changed

| File | Action |
|---|---|
| `ui/tailwind.config.js` | Update tokens, add darkMode, backdropBlur |
| `ui/src/index.css` | Update vars, add dark/glass/mesh utilities |
| `ui/src/context/ThemeContext.tsx` | **New** — dark mode context + hook |
| `ui/src/components/TopBar.tsx` | **New** — replaces Sidebar |
| `ui/src/components/Sidebar.tsx` | **Delete** |
| `ui/src/App.tsx` | Wire TopBar, ThemeProvider, layout update |
| `ui/src/pages/Dashboard.tsx` | Glass cards, dark mode, richer badges |

---

## Out of scope (future)

- Animated transitions between pages
- Mobile bottom tab bar (alternative pattern for mobile)
- Per-page dark mode illustrations
- TopBar search / command palette
