import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// 每个测试结束后清空 localStorage，避免 token/主题/当前角色在用例间串扰
afterEach(() => {
  localStorage.clear();
});
