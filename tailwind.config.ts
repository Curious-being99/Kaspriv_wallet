/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'spin-reverse': 'spin 6s linear infinite reverse',
        'scan': 'scan 3s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(50%)' },
          '100%': { transform: 'translateX(-100%)' },
        }
      },
      colors: {
        kaspa: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        darkBg: {
          base: '#0B151E',
          card: '#132230',
          elevated: '#1C2F42',
          border: '#273E54'
        }
      },
      fontFamily: {
        sans: ['"Times New Roman Bold"', '"TimesNewRoman-Bold"', '"Times-Bold"', '"Times New Roman"', 'Times', 'serif'],
        serif: ['"Times New Roman Bold"', '"TimesNewRoman-Bold"', '"Times-Bold"', '"Times New Roman"', 'Times', 'serif'],
        mono: ['Roboto Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
