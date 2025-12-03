/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./web/kiri/**/*.{html,js}",
    "./web/kiri/**/*.mjs",
    "./web/kiri/**/*.ts",
    "./web/minio/**/*.{html,js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
    },
  },
  plugins: [],
};
