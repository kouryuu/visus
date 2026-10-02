import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  base: './',
  plugins: [tailwindcss()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  envPrefix: ['VITE_', 'DEMO_'],
  server: { proxy: { '/api': 'http://127.0.0.1:4317' }, watch: { ignored: ['**/storybook-static/**'] } },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: path.join(root, 'index.html') } }
});
