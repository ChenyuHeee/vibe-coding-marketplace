import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 开发时把 /api 代理到后端，避免跨域
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    // 无论外层环境如何，测试一律以 test 模式跑（保证 React 走 dev 构建，act 可用）
    env: { NODE_ENV: 'test' },
  },
});
