import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // 端口约定见 docs/DEPLOYMENT.md：Web 入口绑定 127.0.0.1:8090，只被 nginx 反代访问
    host: '127.0.0.1',
    port: 8090,
    // 开发时把 /api 代理到后端，避免跨域
    proxy: {
      '/api': 'http://127.0.0.1:3001',
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
