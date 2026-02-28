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
      },
      animation: {
        "fade-in": "fadeIn 200ms ease",
        "slide-down": "slideDown 200ms ease",
        "slide-in-top": "slideInTop 200ms ease",
      },
    },
  },
  plugins: [],
};
