import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'grid-line': 'var(--grid-line)',
        'glass-bg': 'var(--glass-bg)',
        'glass-bg-strong': 'var(--glass-bg-strong)',
        'glass-border': 'var(--glass-border)',
        'text-main': 'var(--text-main)',
        'text-active': 'var(--text-active)',
        'text-muted': 'var(--text-muted)',
        'line-separator': 'var(--line-separator)',
        'accent-orange': 'var(--accent-orange)',
        'accent-orange-soft': 'var(--accent-orange-soft)',
        'accent-text-on': 'var(--accent-text-on)',
      },
      spacing: {
        'nav-height': 'var(--nav-height)',
        'page-margin': 'var(--page-margin-x)',
        'page-margin-x': 'var(--page-margin-x)',
        'page-margin-y': 'var(--page-margin-y)',
      },
      borderRadius: {
        'glass': 'var(--radius-glass)',
      },
      fontSize: {
        'nav-logo': ['1.25rem', '1'],
        'h1': ['2.5rem', '1.1'],
        'h2': ['2rem', '1.2'],
        'h3': ['1.5rem', '1.3'],
        'body': ['1rem', '1.6'],
        'small': ['0.875rem', '1.5'],
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
      height: {
        'nav-height': 'var(--nav-height)',
      },
    },
  },
  plugins: [],
}
export default config
