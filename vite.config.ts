import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.VITE_BASE_PATH || '/amuwiki/',
    plugins: [react()],
    server: { fs: { strict: true } },
    build: { sourcemap: false },
    test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  };
});
