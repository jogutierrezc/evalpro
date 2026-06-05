import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    force: true, // Force re-optimization
  },
  build: {
    target: 'es2015',
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: false,
    hmr: {
      overlay: true,
    },
    watch: {
      usePolling: true, // Force file watching
    },
  },
  define: {
    'process.env': {},
  },
  cacheDir: '.vite-cache', // Custom cache directory
});
