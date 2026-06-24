import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Dev/prototype server for the design system. Serves demo/ and imports the
// components straight from src/ for hot-reload — no library build needed.
export default defineConfig({
  root: resolve(__dirname, 'demo'),
  plugins: [react()],
  server: { port: 4321, open: false },
  build: { outDir: resolve(__dirname, 'demo-dist'), emptyOutDir: true },
});
