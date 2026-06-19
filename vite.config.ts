import { fileURLToPath } from 'node:url';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(repoRoot, 'src', 'web'),
  plugins: [react()],
  build: {
    outDir: path.join(repoRoot, 'src', 'web', 'dist'),
    emptyOutDir: true
  }
});
