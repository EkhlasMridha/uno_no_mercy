/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // A games room at night: navy darks for the room and the panels around the table.
        felt: { 950: '#080a17', 900: '#0f1226', 800: '#171b35', 700: '#232848', 600: '#30365c' },
        room: '#0a0c1a',
        walnut: { DEFAULT: '#7a4524', light: '#a8693a', dark: '#47260f' },
        baize: { DEFAULT: '#3a1d63', deep: '#1a0d35' },
        leather: '#1d1530',
        oxblood: '#8e1b2a',
        // Neon gold, the only highlight: the current turn and primary buttons.
        brass: { DEFAULT: '#ffc22e', soft: '#ffdd7a' },
        chalk: '#eef0ff',
        card: {
          red: '#e5383b',
          yellow: '#f4c20d',
          green: '#22a559',
          blue: '#2f6fe0',
          wild: '#17151f',
        },
        ink: { red: '#a3161a', yellow: '#8a6a00', green: '#11663a', blue: '#1b46a0' },
        accent: { DEFAULT: '#ffc22e', soft: '#ffdd7a' },
      },
      fontFamily: {
        display: ['"Lilita One"', 'system-ui', 'sans-serif'],
        sans: ['"Bricolage Grotesque Variable"', 'system-ui', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 6px 14px -4px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.35)',
        lifted: '0 14px 24px -8px rgba(0,0,0,0.7), 0 4px 8px rgba(0,0,0,0.4)',
        seat: '0 6px 12px -2px rgba(0,0,0,0.6)',
        glow: '0 0 0 3px rgba(255,221,122,0.95), 0 0 26px 6px rgba(255,194,46,0.65)',
        // The gold button's lip, and the light it throws on the table.
        neon: '0 5px 0 #b57d0f, 0 12px 34px -6px rgba(255,194,46,0.6)',
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
      // A phone held sideways: the table, your hand and your buttons share under 500px of height.
      addVariant('shortest', '@media (min-width: 640px) and (max-height: 500px) { :root & }');
      // A screen with a mouse: the only place privacy mode works, since it reveals a card on hover.
      addVariant('hoverable', '@media (min-width: 640px) and (hover: hover) { :root & }');
    },
  ],
};
