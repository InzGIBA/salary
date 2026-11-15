/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './assets/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        board: 'hsl(var(--board) / <alpha-value>)',
        panel: 'hsl(var(--panel) / <alpha-value>)',
        panel2: 'hsl(var(--panel2) / <alpha-value>)',
        tile: 'hsl(var(--tile) / <alpha-value>)',
        ink: 'hsl(var(--ink) / <alpha-value>)',
        mute: 'hsl(var(--mute) / <alpha-value>)',
        line: 'hsl(var(--line) / <alpha-value>)',
        amber: 'hsl(var(--amber) / <alpha-value>)',
        led: 'hsl(var(--led) / <alpha-value>)',
        ok: 'hsl(var(--ok) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Oswald', 'Arial Narrow', 'ui-sans-serif', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        key: '0 3px 0 0 hsl(var(--line)), 0 6px 16px -6px rgb(0 0 0 / 0.5)',
        keypress: '0 1px 0 0 hsl(var(--line)), 0 3px 8px -4px rgb(0 0 0 / 0.5)',
        panel: '0 1px 0 0 hsl(var(--line) / 0.6), 0 18px 40px -24px rgb(0 0 0 / 0.6)',
      },
      letterSpacing: {
        board: '0.18em',
      },
    },
  },
  plugins: [],
};