import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api/off': {
        target: 'https://world.openfoodfacts.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/off/, ''),
        headers: {
          'User-Agent': 'Beastmode90-Web/1.0 (https://beastmode90.app; contact@beastmode90.app)',
        },
      },
    },
  },
});
