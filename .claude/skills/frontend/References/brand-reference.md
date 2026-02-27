# Brand Reference — HILO Website CSS

## Font loading

```html
<head>
  <!-- Epilogue (headings) -->
  <link href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,800;0,900;1,800;1,900&display=swap" rel="stylesheet">

  <!-- Satoshi (body) -->
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,400i,500i&display=swap" rel="stylesheet">
</head>
```

## CSS custom properties

```css
:root {
  /* Colors */
  --hilo-purple: #9063CD;
  --hilo-purple-light: #B594E0;
  --hilo-purple-dark: #6B3FA6;
  --hilo-purple-50: #F5F0FA;
  --hilo-purple-100: #E8DDF3;
  --hilo-dark: #1D1D1B;
  --hilo-white: #FFFFFF;
  --hilo-gray: #C6C6C6;

  /* Typography */
  --font-display: 'Epilogue', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-body: 'Satoshi', system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* Spacing (base: 8px) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;

  /* Border radius */
  --radius: 0.75rem;
  --radius-sm: 0.5rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow: 0 4px 24px rgba(144, 99, 205, 0.08);
  --shadow-lg: 0 8px 40px rgba(144, 99, 205, 0.12);

  /* Transitions */
  --transition: 200ms ease;
}
```

## Common patterns

**Headings**:
```css
h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--hilo-dark);
}

h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; }
h2 { font-size: clamp(1.5rem, 3vw, 2.25rem); }
h3 { font-size: clamp(1.125rem, 2vw, 1.5rem); }
```

**Body text**:
```css
body {
  font-family: var(--font-body);
  font-weight: 400;
  color: var(--hilo-dark);
  line-height: 1.6;
}
```

**Primary button**:
```css
.btn-primary {
  background: var(--hilo-purple);
  color: var(--hilo-white);
  font-family: var(--font-body);
  font-weight: 500;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius);
  border: none;
  cursor: pointer;
  transition: background var(--transition);
}

.btn-primary:hover {
  background: var(--hilo-purple-dark);
}
```

**Secondary button**:
```css
.btn-secondary {
  background: var(--hilo-purple-50);
  color: var(--hilo-purple-dark);
  font-family: var(--font-body);
  font-weight: 500;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius);
  border: 1px solid var(--hilo-purple-100);
  cursor: pointer;
  transition: background var(--transition);
}

.btn-secondary:hover {
  background: var(--hilo-purple-100);
}
```

**Card**:
```css
.card {
  background: var(--hilo-white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: var(--space-6);
}
```

**Section with purple accent**:
```css
.section-accent {
  background: var(--hilo-purple-50);
  padding: var(--space-16) var(--space-6);
}
```

**Dark section**:
```css
.section-dark {
  background: var(--hilo-dark);
  color: var(--hilo-white);
  padding: var(--space-16) var(--space-6);
}

.section-dark h2,
.section-dark h3 {
  color: var(--hilo-white);
}
```

## Responsive breakpoints

```css
/* Mobile first — base styles are mobile */

/* Tablet */
@media (min-width: 768px) { }

/* Desktop */
@media (min-width: 1024px) { }

/* Wide */
@media (min-width: 1280px) { }
```

## Container

```css
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--space-6);
  }
}
```
