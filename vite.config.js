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
        weapons: 'weapons.html',
        map: 'map.html',
      },
      output: {
        // three 本体だけを分離する。アプリ側を細かく割ると
        // 共有モジュールが巨大な単一チャンクへ吸われて逆効果になる。
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
