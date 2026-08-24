/**
 * 测试渲染辅助：包上应用所需的全部 Provider（主题/路由/认证/角色/Toast）。
 */
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { RoleProvider } from '../context/RoleContext';
import { ToastProvider } from '../components/Toast';

export function renderWithProviders(ui: ReactElement, initialPath = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <RoleProvider>
            <ToastProvider>{ui}</ToastProvider>
          </RoleProvider>
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}
