import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    license({
      thirdParty: {
        output: path.resolve(__dirname, 'dist/assets/vendor.LICENSE.txt'),
        includePrivate: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:1234',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:1234',
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
});
