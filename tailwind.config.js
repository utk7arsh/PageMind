/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'pm-bg': '#0f0f14',
        'pm-surface': '#18181f',
        'pm-surface-hover': '#1f1f28',
        'pm-border': '#2a2a35',
        'pm-text': '#e4e4e7',
        'pm-text-muted': '#71717a',
        'pm-accent': '#6366f1',
        'pm-accent-hover': '#818cf8',
        'pm-success': '#22c55e',
        'pm-warning': '#f59e0b',
        'pm-error': '#ef4444',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'sans': ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'typing': 'typing 1.4s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        typing: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(99, 102, 241, 0.3)',
        'glow-lg': '0 0 40px rgba(99, 102, 241, 0.4)',
      },
    },
  },
  plugins: [],
  important: '#pagemind-root',
}
