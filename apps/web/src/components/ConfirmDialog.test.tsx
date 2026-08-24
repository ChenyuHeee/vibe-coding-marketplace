import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    title: '确认充值',
    consequences: (
      <p>
        当前余额 <strong className="num">1,200 CR</strong>，充值后余额{' '}
        <strong className="num">1,700 CR</strong>
      </p>
    ),
    confirmLabel: '确认充值 500 CR',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe('ConfirmDialog（§5.2 二次确认通用规格）', () => {
  it('renders title, consequences and confirm button with 动词+对象', () => {
    render(<ConfirmDialog {...makeProps()} open />);
    expect(screen.getByRole('dialog', { name: '确认充值' })).toBeInTheDocument();
    expect(screen.getByText(/充值后余额/)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: '确认充值 500 CR' });
    expect(confirmBtn).toBeInTheDocument();
    // 禁止裸「确定」：按钮文案必须含动作与金额
    expect(confirmBtn.textContent).toMatch(/确认充值 500 CR/);
  });

  it('calls onConfirm on confirm click', async () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: '确认充值 500 CR' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Esc', async () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} open />);
    await userEvent.keyboard('{Escape}');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on 取消 button', async () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not render when closed', () => {
    const { container } = render(<ConfirmDialog {...makeProps()} open={false} />);
    expect(container.querySelector('.confirm-dialog')).toBeNull();
  });

  it('disabled confirm shows disabled reason（§7.2 禁用≠看不见）', () => {
    render(
      <ConfirmDialog
        {...makeProps()}
        open
        confirmDisabled
        disabledReason="未选择交付物，无法确认放款"
      />,
    );
    expect(screen.getByRole('button', { name: '确认充值 500 CR' })).toBeDisabled();
    expect(screen.getByText('未选择交付物，无法确认放款')).toBeInTheDocument();
  });
});
