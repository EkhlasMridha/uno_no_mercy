/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm back-room darks, used for the room and panels around the table.
        felt: { 950: '#17100d', 900: '#221714', 800: '#2e201b', 700: '#3e2c25', 600: '#523a31' },
        room: '#17100d',
        walnut: { DEFAULT: '#5b3722', light: '#8c5b37', dark: '#3a2214' },
        baize: { DEFAULT: '#4b2347', deep: '#2c1430' },
        leather: '#2a1a1e',
        oxblood: '#7a1a22',
        brass: { DEFAULT: '#d0a650', soft: '#e7c886' },
        chalk: '#f2e8da',
        card: {
          red: '#e5383b',
          yellow: '#f4c20d',
          green: '#22a559',
          blue: '#2f6fe0',
          wild: '#17151f',
        },
        ink: { red: '#a3161a', yellow: '#8a6a00', green: '#11663a', blue: '#1b46a0' },
        accent: { DEFAULT: '#d0a650', soft: '#e7c886' },
      },
      fontFamily: {
        display: ['"Lilita One"', 'system-ui', 'sans-serif'],
        sans: ['"Bricolage Grotesque Variable"', 'system-ui', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 6px 14px -4px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.35)',
        lifted: '0 14px 24px -8px rgba(0,0,0,0.7), 0 4px 8px rgba(0,0,0,0.4)',
        seat: '0 6px 12px -2px rgba(0,0,0,0.6)',
        glow: '0 0 0 3px rgba(242,232,218,0.9), 0 0 24px 4px rgba(208,166,80,0.7)',
      },
    },
  },
  plugins: [
    // Height variants as plugins, not `screens`: a raw screen would switch off every `max-*` variant.
    // `:root &` lifts them over `sm:`, which Tailwind always emits after plugin variants.
    ({ addVariant }) => {
      // Laptop-height viewports: the felt is too short for full-size table cards.
      addVariant('short', '@media (min-width: 640px) and (max-height: 860px) { :root & }');
      // e.g. a 1080p laptop at 150% scaling: about 575px of page under the browser bar.
      addVariant('shorter', '@media (min-width: 640px) and (max-height: 640px) { :root & }');
    },
  ],
};
