import type { Config } from 'tailwindcss';

/**
 * Marketplace design tokens — mirror of `tad-landing/src/index.css` so the
 * marketplace, the platform and the landing all read as one product family.
 * Landing uses Tailwind v4 with @theme; we re-encode the palette here for v3.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b8d0ff',
          300: '#8ab1ff',
          400: '#5a8bff',
          500: '#2f66f5',
          600: '#1f4ddb',
          700: '#1a3eb0',
          800: '#1a3690',
          900: '#182f73',
        },
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1e9',
          300: '#c2c8d4',
          400: '#8a93a6',
          500: '#5c6577',
          600: '#3f4759',
          700: '#2a3142',
          800: '#1a1f2e',
          900: '#0d1220',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
