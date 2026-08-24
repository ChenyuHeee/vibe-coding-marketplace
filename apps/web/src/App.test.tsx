import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';

function renderApp(initialPath = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('App', () => {
  it('renders the marketplace title on home', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Vibe Coding Marketplace' })).toBeInTheDocument();
  });

  it('renders the global nav with My Library always visible (两步回 My Library, §5.1)', () => {
    renderApp('/');
    // 顶栏 + 移动 TabBar 各渲染一份导航（jsdom 无媒体查询，两者都在 DOM 中）
    expect(screen.getByRole('link', { name: /My Library/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Marketplace$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '需求板' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '钱包' }).length).toBeGreaterThan(0);
  });

  it('navigates to Marketplace placeholder page', () => {
    renderApp('/marketplace');
    expect(screen.getByRole('heading', { name: 'Marketplace' })).toBeInTheDocument();
  });

  it('renders 404 empty state for unknown routes', () => {
    renderApp('/no-such-page');
    expect(screen.getByText('页面不存在')).toBeInTheDocument();
  });
});
