import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // App background / chrome surface.
        canvas: "#f6f7f9",
        // Neutral scale — a calm, slightly cool slate. Used for text, borders,
        // muted surfaces. Reads as professional and trustworthy.
        ink: {
          50: "#f7f8fa",
          100: "#eef0f3",
          200: "#e1e4e9",
          300: "#cbd0d8",
          400: "#9aa2af",
          500: "#6b7480",
          600: "#4d5560",
          700: "#3a414b",
          800: "#262b33",
          900: "#171b21",
        },
        // Primary accent — a confident, deep professional blue.
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bfd2fe",
          300: "#93b4fd",
          400: "#608cf9",
          500: "#3b66f0",
          600: "#244ee0",
          700: "#1d3dc4",
          800: "#1e359f",
          900: "#1e327e",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Soft, layered elevations for floating chrome (search, controls, panels).
        card: "0 1px 2px 0 rgb(23 27 33 / 0.04), 0 1px 3px 0 rgb(23 27 33 / 0.06)",
        float:
          "0 2px 4px -1px rgb(23 27 33 / 0.06), 0 6px 16px -4px rgb(23 27 33 / 0.12)",
        overlay:
          "0 8px 24px -6px rgb(23 27 33 / 0.16), 0 24px 48px -12px rgb(23 27 33 / 0.22)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
