/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,svelte}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#000B63",
          50: "#EEEFF6",
          100: "#D2D4E6",
          200: "#A4A8CC",
          300: "#777DB3",
          400: "#494F92",
          500: "#1C2770",
          600: "#000B63",
          700: "#00094F",
          800: "#00073C",
          900: "#000529",
        },
      },
      boxShadow: {
        "brand-soft": "0 4px 20px -8px rgba(0, 11, 99, 0.25)",
        "brand-ring": "0 0 0 3px rgba(0, 11, 99, 0.12)",
      },
    },
  },
}
