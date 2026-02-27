# Tailwind Theme — HILO Semantics

## Configuration

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        hilo: {
          purple: '#9063CD',
          'purple-light': '#B594E0',
          'purple-dark': '#6B3FA6',
          'purple-50': '#F5F0FA',
          'purple-100': '#E8DDF3',
          dark: '#1D1D1B',
          gray: '#C6C6C6',
        },
      },
      fontFamily: {
        display: ['Epilogue', 'system-ui', 'sans-serif'],
        body: ['Satoshi', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'hilo': '0.75rem',
      },
      boxShadow: {
        'hilo': '0 4px 24px rgba(144, 99, 205, 0.08)',
        'hilo-lg': '0 8px 40px rgba(144, 99, 205, 0.12)',
      },
      backdropBlur: {
        'glass': '16px',
      },
    },
  },
}
```

## Common utility combinations

**Glass card**:
```
bg-white/70 backdrop-blur-glass rounded-hilo shadow-hilo border border-hilo-gray/30
```

**Purple accent card**:
```
bg-white rounded-hilo shadow-hilo border-l-4 border-hilo-purple
```

**Primary button**:
```
bg-hilo-purple hover:bg-hilo-purple-dark text-white font-body font-medium px-6 py-2.5 rounded-hilo transition-colors
```

**Secondary button**:
```
bg-hilo-purple-50 hover:bg-hilo-purple-100 text-hilo-purple-dark font-body font-medium px-6 py-2.5 rounded-hilo transition-colors
```

**Section heading**:
```
font-display font-extrabold text-hilo-dark text-2xl
```

**Body text**:
```
font-body text-hilo-dark/80 text-base leading-relaxed
```

## Font loading

```html
<!-- Epilogue from Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,800;0,900;1,800;1,900&display=swap" rel="stylesheet">

<!-- Satoshi from Fontshare -->
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,400i,500i&display=swap" rel="stylesheet">
```
