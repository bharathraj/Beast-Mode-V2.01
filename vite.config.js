import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dynamically resolves the base path for deployment targets:
 * - Vercel: always root domain ('/')
 * - GitHub Pages (GitHub Actions): subpath repository ('/Beast-Mode-V2.01/' or derived from GITHUB_REPOSITORY)
 * - VITE_BASE_PATH: explicit environment variable override
 * - Default: root domain ('/') for local development, previews, and root-domain hosting
 */
export function resolveBasePath(env = process.env) {
  if (env.VITE_BASE_PATH) {
    let p = env.VITE_BASE_PATH.trim();
    if (!p.startsWith('/')) p = '/' + p;
    if (!p.endsWith('/')) p = p + '/';
    return p;
  }

  // Vercel sets VERCEL=1 or VERCEL=true
  if (env.VERCEL) {
    return '/';
  }

  // GitHub Pages deployment via GitHub Actions workflow
  const isGhActions = env.GITHUB_ACTIONS && env.GITHUB_ACTIONS.trim() === 'true';
  const isGhPages = env.GITHUB_PAGES && env.GITHUB_PAGES.trim() === 'true';
  if ((isGhPages || isGhActions) && !env.VERCEL) {
    if (env.GITHUB_REPOSITORY) {
      const repoName = env.GITHUB_REPOSITORY.trim().split('/')[1];
      if (repoName) return `/${repoName}/`;
    }
    return '/Beast-Mode-V2.01/';
  }

  return '/';
}

export default defineConfig(() => ({
  base: resolveBasePath(),

  plugins: [
    react(),
    tailwindcss(),
  ],

  build: {
    rollupOptions: {
      output: {
        // test default chunking
      },
    },
    chunkSizeWarningLimit: 600,
  },

  server: {
    port: 5173,
    open: true,

    proxy: {
      '/api/off': {
        target: 'https://world.openfoodfacts.org',
        changeOrigin: true,

        rewrite: (path) =>
          path.replace(/^\/api\/off/, ''),

        headers: {
          'User-Agent':
            'Beastmode90-Web/1.0 (Beastmode90)',
        },
      },
    },
  },
}));
