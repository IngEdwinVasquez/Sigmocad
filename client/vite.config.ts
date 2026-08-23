import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:4000';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': API_TARGET,
      '/uploads': API_TARGET,
      '/embed': API_TARGET,
      '/click': API_TARGET,
      '/impression': API_TARGET,
      '/e/': API_TARGET,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
