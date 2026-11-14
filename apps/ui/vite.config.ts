import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static files for the Tauri window; `pnpm dev` serves the same UI for `tauri dev`.
// Contracts are read from source so the UI needs no separate contracts build.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@office/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)) } },
  build: { outDir: 'out', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
