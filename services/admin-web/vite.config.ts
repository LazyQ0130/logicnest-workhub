import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 4175,
      strictPort: true,
      proxy: env.VITE_DEV_API_PROXY_TARGET
        ? {
            '/api': {
              target: env.VITE_DEV_API_PROXY_TARGET,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    preview: {
      host: '127.0.0.1',
      port: 4176,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return undefined;
            if (/\/node_modules\/(?:react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
              return 'react-vendor';
            }
            if (id.includes('/node_modules/@ant-design/icons')) return 'icons-vendor';
            if (id.includes('/node_modules/@ant-design/cssinjs')) return 'styles-vendor';
            if (id.includes('/node_modules/dayjs/')) return 'date-vendor';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      restoreMocks: true,
      clearMocks: true,
    },
  };
});
