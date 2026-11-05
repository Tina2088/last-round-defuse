import { defineConfig } from 'vite';
export default defineConfig({ base: '/last-round-defuse/', build: { rollupOptions: { output: { manualChunks: (id: string) => id.includes('node_modules/three') ? 'three' : undefined } } } });
