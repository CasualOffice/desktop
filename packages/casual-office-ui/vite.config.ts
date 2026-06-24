import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Library build: one ES bundle exporting every component, React externalized,
// component CSS emitted as a single stylesheet (dist/casual-office-ui.css).
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.es.js',
      cssFileName: 'casual-office-ui',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        assetFileNames: 'casual-office-ui.[ext]',
      },
    },
    sourcemap: false,
    emptyOutDir: true,
  },
});
