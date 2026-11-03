import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Ruta base de despliegue. Se toma de VITE_BASE_PATH (variable de entorno o .env.production).
// Por defecto '/'; en el servidor de la universidad se sirve en /evalpro/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  base: env.VITE_BASE_PATH || '/',
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
};
});
