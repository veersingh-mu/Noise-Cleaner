import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0B0E14',
        surface: {
          DEFAULT: '#151922',
          container: '#151922',
          hover: '#1C212C',
          bright: '#272D3D',
          muted: '#10131A'
        },
        border: {
          DEFAULT: '#242938',
          subtle: '#1C212C',
          bright: '#363D52'
        },
        primary: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          glow: 'rgba(59, 130, 246, 0.25)',
          muted: 'rgba(59, 130, 246, 0.12)'
        },
        success: {
          DEFAULT: '#10B981',
          hover: '#059669',
          glow: 'rgba(16, 185, 129, 0.25)',
          muted: 'rgba(16, 185, 129, 0.12)'
        },
        warning: {
          DEFAULT: '#F59E0B',
          hover: '#D97706',
          glow: 'rgba(245, 158, 11, 0.25)',
          muted: 'rgba(245, 158, 11, 0.12)'
        },
        critical: {
          DEFAULT: '#EF4444',
          hover: '#DC2626',
          glow: 'rgba(239, 68, 68, 0.25)',
          muted: 'rgba(239, 68, 68, 0.12)'
        },
        info: {
          DEFAULT: '#8B5CF6',
          hover: '#7C3AED',
          glow: 'rgba(139, 92, 246, 0.25)',
          muted: 'rgba(139, 92, 246, 0.12)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'Menlo', 'monospace']
      },
      borderRadius: {
        card: '10px',
        row: '2px',
        pill: '9999px'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.25s ease-out forwards',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    },
  },
  plugins: [],
} satisfies Config;
