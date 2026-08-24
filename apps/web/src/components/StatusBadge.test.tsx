import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusBadge } from './StatusBadge';
import { STATUS_WORDS } from './statusVocabulary';

describe('StatusBadge（词汇表驱动，DESIGN_SYSTEM §8 #2）', () => {
  it('renders icon + label + tone for a vocabulary word', () => {
    const { container } = render(<StatusBadge status="approved" />);
    // 文字（中文界面文案）
    expect(screen.getByText('已上架')).toBeInTheDocument();
    // 图标存在（lucide 渲染 svg）
    expect(container.querySelector('svg')).not.toBeNull();
    // 语义色调 class（颜色非唯一载体：图标+文字+颜色三件套）
    expect(container.querySelector('.badge--success')).not.toBeNull();
  });

  it('renders the canonical word in the accessible label (aria-label + title)', () => {
    render(<StatusBadge status="under review" />);
    const badge = screen.getByLabelText('审核中（under review）');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'under review');
  });

  it('shows a spinner for in-progress class states (§8 #2：进行中类带 12px spinner)', () => {
    const { container } = render(<StatusBadge status="in progress" />);
    expect(container.querySelector('.badge__spinner')).not.toBeNull();
  });

  it('does NOT render a spinner for terminal states', () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.querySelector('.badge__spinner')).toBeNull();
    expect(container.querySelector('.badge__icon')).not.toBeNull();
  });

  it('refuses to render words outside the vocabulary（禁止自造状态词）', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<StatusBadge status="自制状态词" />);
    expect(container.firstChild).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('covers every word in STATUS_VOCABULARY.md（全表可渲染）', () => {
    // 词汇表内的每个规范词都能渲染出文字
    for (const word of STATUS_WORDS) {
      const { container } = render(<StatusBadge status={word} />);
      expect(container.querySelector('.badge__label')).not.toBeNull();
    }
  });
});
