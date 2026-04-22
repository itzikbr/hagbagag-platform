/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'hb-red': '#CC0000',
        'hb-red-dark': '#990000',
        'hb-bg': '#ECE5DD',
        'hb-sent': '#DCF8C6',
        'hb-claude': '#1a0a0a',
      },
    },
  },
  plugins: [],
}
