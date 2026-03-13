import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0f1e",
        panel: "#111827",
        panel2: "#0f172a",
        border: "#1f2937",
        text: "#e5e7eb",
        muted: "#94a3b8"
      },
      boxShadow: {
        glow: "0 0 24px rgba(59,130,246,.35)"
      },
      backgroundImage: {
        "map-glow": "radial-gradient(circle at 50% 40%, rgba(56,189,248,0.16), rgba(2,6,23,0.92) 70%)"
      }
    }
  },
  plugins: []
};

export default config;
