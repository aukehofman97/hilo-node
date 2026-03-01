/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Aligned to brand-reference.md
        "hilo-purple": "#9063CD",
        "hilo-purple-light": "#B594E0",
        "hilo-purple-dark": "#6B3FA6",
        "hilo-purple-50": "#F5F0FA",
        "hilo-purple-100": "#E8DDF3",
        "hilo-dark": "#1D1D1B",
        "hilo-gray": "#C6C6C6",
      },
      fontFamily: {
        display: ["Epilogue", "system-ui", "sans-serif"],
        body: ["Satoshi", "system-ui", "sans-serif"],
        sans: ["Satoshi", "system-ui", "sans-serif"],
      },
      borderRadius: {
        hilo: "0.75rem",
      },
      boxShadow: {
        hilo: "0 4px 24px rgba(144, 99, 205, 0.08)",
        "hilo-lg": "0 8px 40px rgba(144, 99, 205, 0.12)",
      },
      backdropBlur: {
        glass: "16px",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInTop: {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideOutRight: {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(24px)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(3px)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 200ms ease",
        "fade-out": "fadeOut 200ms ease forwards",
        "slide-down": "slideDown 200ms ease",
        "slide-in-top": "slideInTop 200ms ease",
        "slide-in-right": "slideInRight 200ms ease",
        "slide-out-right": "slideOutRight 150ms ease forwards",
        "scale-in": "scaleIn 150ms ease",
        shake: "shake 300ms ease",
        "slide-up": "slideUp 220ms ease",
      },
    },
  },
  plugins: [],
};
