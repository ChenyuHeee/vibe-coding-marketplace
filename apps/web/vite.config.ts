import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    commonjsOptions: {
      // @vibe/shared 是 workspace 链接包（不在 node_modules 物理目录内），
      // 其 dist 为 CommonJS；Vite 默认只对 node_modules 应用 CJS 转换，
      // 这里显式纳入 workspace 包，保证 rollup 构建能解析 CJS 具名导出
      // （CURRENCY / FEE_RATE / PROJECT_CATEGORIES 等运行时值）。
      include: [/node_modules/, /packages\/shared/],
    },
  },
  server: {
    // 端口约定见 docs/DEPLOYMENT.md：Web 入口绑定 127.0.0.1:8090，只被 nginx 反代访问
    host: '127.0.0.1',
    port: 8090,
    // 开发时把 /api 代理到后端，避免跨域
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      // 试玩回放（ARCHITECTURE §3.3）：/play/:projectId 由 API 服务静态回放，
      // 详情页 iframe 直连 dev server 需代理到 3001（生产由 nginx 反代）
      '/play': 'http://127.0.0.1:3001',
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
