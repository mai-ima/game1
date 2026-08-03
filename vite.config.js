import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: 'index.html',
        showcase: 'showcase.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('/src/world/maps/')) return 'maps';
          if (id.includes('/src/render/')) return 'render';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
