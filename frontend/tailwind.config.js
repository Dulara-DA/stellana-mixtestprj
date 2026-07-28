/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1825',
        panel: '#102334',
        steel: '#547086',
        safety: '#f5a524',
        process: '#2685ff',
        success: '#16a36a',
        danger: '#dc3d4b',
      },
      boxShadow: {
        panel: '0 18px 50px rgba(7, 23, 38, 0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

