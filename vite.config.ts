import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // index.html carries __ORIGIN__ for the link-preview tags; the production server fills it
        // with the public address. In development, relative addresses are enough.
        name: 'og-origin-dev',
        apply: 'serve',
        transformIndexHtml: (html: string) => html.replaceAll('__ORIGIN__', ''),
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      // Three.js alone is ~590 kB (147 kB gzipped); it is loaded after the interface
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          // Long-lived libraries in their own files: browsers keep them cached across game updates
          manualChunks(id: string) {
            if (id.includes('node_modules/three/')) return 'three';
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
            return undefined;
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
