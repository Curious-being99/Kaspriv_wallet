import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'react': path.resolve(process.cwd(), './node_modules/react'),
      'react-dom': path.resolve(process.cwd(), './node_modules/react-dom'),
    },
  },
  plugins: [
    react(),
    wasm(),
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'crypto', 'process', 'path', 'fs'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
        require: true,
      }
    })
  ],
  optimizeDeps: {
    entries: ['index.html'],
    include: ['react', 'react-dom', 'react-simple-keyboard', 'qrcode.react', 'html5-qrcode', '@kasdk/web'],
  },
  worker: {
    format: 'es',
    plugins: () => [
      wasm(),
      nodePolyfills({
        include: ['buffer', 'stream', 'util', 'crypto', 'process', 'path', 'fs'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
          require: true,
        }
      })
    ]
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: false,
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});

