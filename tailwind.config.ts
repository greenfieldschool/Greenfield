import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"]
      },
      colors: {
        brand: {
          // `bg-brand-green` / `bg-brand-gold` keep working (DEFAULT); the scales add tints and shades.
          green: {
            DEFAULT: "#0B3D2E",
            50: "#EEF7F2",
            100: "#D6EDE0",
            200: "#AEDAC2",
            300: "#7FC2A0",
            400: "#4FA37C",
            500: "#2F8560",
            600: "#1F6B4C",
            700: "#17563E",
            800: "#114634",
            900: "#0B3D2E",
            950: "#062519"
          },
          gold: {
            DEFAULT: "#D4A017",
            50: "#FDF8E7",
            100: "#FAEDC2",
            200: "#F4DA85",
            300: "#EDC54C",
            400: "#E2B22A",
            500: "#D4A017",
            600: "#B08310",
            700: "#8A6511",
            800: "#6E5014",
            900: "#5C4315"
          }
        },
        canvas: "#F6F7F4"
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        lift: "0 10px 30px -12px rgba(11, 61, 46, 0.25)"
      },
      borderRadius: {
        "4xl": "2rem"
      }
    }
  },
  plugins: []
};

export default config;
