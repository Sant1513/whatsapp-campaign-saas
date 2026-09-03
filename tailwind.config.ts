import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefaf3",
          100: "#d6f2e0",
          500: "#12b76a",
          600: "#039855",
          700: "#027a48",
        },
      },
    },
  },
  plugins: [],
};

export default config;
