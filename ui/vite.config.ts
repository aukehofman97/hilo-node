import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  define: {
    // Map CRA-style env vars to Vite
    "process.env.REACT_APP_API_URL": JSON.stringify(
      process.env.REACT_APP_API_URL || "http://localhost:8000"
    ),
  },
});
