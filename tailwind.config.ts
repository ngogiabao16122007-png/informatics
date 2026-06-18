import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinical: {
          ink: "#17212b",
          muted: "#657282",
          line: "#d9e3ea",
          panel: "#f7fafc",
          teal: "#0f766e",
          blue: "#2563eb",
          amber: "#b45309",
          red: "#b91c1c",
          green: "#15803d"
        }
      },
      boxShadow: {
        soft: "0 12px 30px rgba(23, 33, 43, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
