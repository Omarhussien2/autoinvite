/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/views/**/*.ejs',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#00C853',
          dark: '#0A3D2E',
          light: '#E8FAF0',
          medium: '#1B5E20',
        },
        surface: {
          white: '#FFFFFF',
          gray: '#F7F8FA',
        },
      },
      fontFamily: {
        sans: ['"TSNAS Bold"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
    },
  },
  plugins: [],
};
