import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@sparkjsdev/spark': path.resolve(__dirname, '../spark/dist/spark.module.js'),
    },
  },
  server: {
    port: 3000,
    open: true
  }
});

