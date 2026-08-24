import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 无论外层环境如何，测试一律以 test 模式跑
    env: { NODE_ENV: 'test' },
  },
});
