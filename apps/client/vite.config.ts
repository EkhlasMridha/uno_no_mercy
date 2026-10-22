import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SERVER_PORT ?? 3000);
const fromRoot = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `dev:lan` puts this server on the network: serve only what the client needs, not the repo.
    fs: {
      strict: true,
      allow: [fromRoot('apps/client'), fromRoot('packages/shared'), fromRoot('node_modules')],
    },
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
      '/api': { target: `http://localhost:${serverPort}` },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
