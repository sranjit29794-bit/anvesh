import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          card: 'var(--bg-card)',
          elevated: 'var(--bg-elevated)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          primary: '#4F6EF7',
          'primary-hover': '#3D5CE6',
          success: '#22C97A',
          warning: '#F5A623',
          danger: '#E84545',
        },
        sensitivity: {
          a: '#E84545',
          b: '#F5A623',
          c: '#22C97A',
        },
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        input: '8px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        topbar: '56px',
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },
    },
  },
  plugins: [],
} satisfies Config;
