import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Ruta base de despliegue. En Vercel (raíz) no se define; en servidores con subruta, p. ej. VITE_BASE_PATH=/evalpro/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
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
