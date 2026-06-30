import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-markdown')) return 'markdown';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor';
          }
        }
      }
    }
  },
  server: {
    host: true,   // Listen on all interfaces (needed for Docker / Pterodactyl)
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 3000,
  }
});
