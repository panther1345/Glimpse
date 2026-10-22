import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), {
    name: 'glimpse-manifest',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) }); },
  }],
  build: {
    outDir: 'dist', emptyOutDir: true, target: 'chrome114', modulePreload: false,
    rollupOptions: {
      input: { sidepanel: resolve(__dirname, 'sidepanel.html'), options: resolve(__dirname, 'options.html'), mic: resolve(__dirname, 'mic.html'), sw: resolve(__dirname, 'src/background/sw.ts') },
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
});
