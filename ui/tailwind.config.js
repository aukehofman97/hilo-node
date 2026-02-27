/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "hilo-purple": "#6B46C1",
        "hilo-purple-light": "#9F7AEA",
        "hilo-purple-dark": "#553C9A",
        "hilo-purple-50": "#F5F3FF",
        "hilo-purple-100": "#EDE9FE",
        "hilo-dark": "#1A1A2E",
        "hilo-gray": "#E2E8F0",
      },
      fontFamily: {
        display: ["Epilogue", "sans-serif"],
        body: ["Satoshi", "sans-serif"],
        sans: ["Satoshi", "sans-serif"],
      },
      borderRadius: {
        hilo: "0.75rem",
      },
      boxShadow: {
        hilo: "0 2px 8px 0 rgba(107, 70, 193, 0.08)",
        "hilo-lg": "0 8px 24px 0 rgba(107, 70, 193, 0.12)",
      },
    },
  },
  plugins: [],
};
