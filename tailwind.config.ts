import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base': '#0c0e12',
        'grid-line': 'rgba(255, 255, 255, 0.045)',
        'glass-bg': 'rgba(255, 255, 255, 0.04)',
        'glass-bg-strong': 'rgba(255, 255, 255, 0.08)',
        'glass-bg-faint': 'rgba(255, 255, 255, 0.02)',
        'glass-border': 'rgba(255, 255, 255, 0.08)',
        'glass-bg-tier2': 'rgba(255, 255, 255, 0.08)',
        'glass-border-tier2': 'rgba(255, 255, 255, 0.12)',
        'glass-bg-tier3': 'rgba(255, 255, 255, 0.12)',
        'glass-border-tier3': 'rgba(255, 255, 255, 0.16)',
        'text-main': 'rgba(245, 246, 248, 0.85)',
        'text-active': '#f5f6f8',
        'text-muted': 'rgba(245, 246, 248, 0.45)',
        'line-separator': 'rgba(255, 255, 255, 0.12)',
        'accent-orange': '#d4ff3d',
        'accent-orange-soft': 'rgba(212, 255, 61, 0.18)',
        'accent-text-on': '#1a2400',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      spacing: {
        'nav-height': '64px',
        'sidebar-width': '250px',
        'page-margin': '24px',
        'page-margin-y': '48px',
        'card-padding': '20px',
      },
      borderRadius: {
        'glass': '12px',
        'glass-inner': '8px',
      },
      fontSize: {
        'nav-logo': '1.3rem',
        'h1': '2.2rem',
        'h2': '1.8rem',
        'h3': '1.4rem',
        'body': '1rem',
        'small': '0.9rem',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      }
    },
  },
  plugins: [],
}
export default config
