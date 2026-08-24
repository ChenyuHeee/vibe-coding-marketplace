/**
 * ContractDetailPage 测试 —— 接单交付（区域 5）：
 * 六词 Stepper / 托管条 / contractor 提交里程碑 / buyer 验收打回（意见必填）/
 * 放款二次确认（**未预览交付物时按钮禁用**，§5.2）。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractDetailPage } from './ContractDetailPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { Role } from '../types';
import type { CommissionDetail, ContractDetail } from '../types/commission';

vi.mock('../api/commission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/commission')>();
  return {
    ...actual,
    commissionApi: { ...actual.commissionApi, detail: vi.fn() },
    contractApi: {
      list: vi.fn(),
      detail: vi.fn(),
      start: vi.fn(),
      milestones: vi.fn(),
      approveMilestone: vi.fn(),
      requestRevision: vi.fn(),
      accept: vi.fn(),
      payout: vi.fn(),
    },
  };
});

import { commissionApi, contractApi } from '../api/commission';

const mocked = {
  commissionDetail: commissionApi.detail as ReturnType<typeof vi.fn>,
  contractDetail: contractApi.detail as ReturnType<typeof vi.fn>,
  milestones: contractApi.milestones as ReturnType<typeof vi.fn>,
  approveMilestone: contractApi.approveMilestone as ReturnType<typeof vi.fn>,
  requestRevision: contractApi.requestRevision as ReturnType<typeof vi.fn>,
  payout: contractApi.payout as ReturnType<typeof vi.fn>,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function loginAs(roles: Role[], id: string) {
  localStorage.setItem('vibe.token', 'fake-token');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return Promise.resolve(
          jsonResponse({
            user: {
              id,
              email: `${id}@vibes.local`,
              displayName: id === 'u-buyer' ? '演示买家' : '演示接单者',
              roles,
              avatarUrl: null,
              ratingAvg: 0,
              ratingCount: 0,
              isAdmin: false,
            },
          }),
        );
      }
      return Promise.reject(new Error(`unmocked: ${url}`));
    }),
  );
}

function makeCommission(): CommissionDetail {
  return {
    id: 'c1',
    title: '帮我做一个课堂小游戏',
    description: '可运行、有计分。',
    budgetMinCr: 1000,
    budgetMaxCr: 3000,
    timelineDays: 7,
    status: 'in progress',
    bidCount: 1,
    buyer: { id: 'u-buyer', displayName: '演示买家' },
    createdAt: '2026-08-24T10:00:00Z',
    acceptanceCriteria: '1) 可运行 2) 有计分 3) 移动端可用',
    criteriaHash: 'sha256:abc',
    referenceProjects: [],
    bids: [],
  };
}

function makeContract(overrides: Partial<ContractDetail> = {}): ContractDetail {
  return {
    id: 'k1',
    commission: { id: 'c1', title: '帮我做一个课堂小游戏', status: 'in progress' },
    buyer: { id: 'u-buyer', displayName: '演示买家' },
    contractor: { id: 'u-con', displayName: '接单老王' },
    bidId: 'b1',
    agreedAmountCr: 1500,
    status: 'milestone submission',
    escrowStatus: 'held',
    acceptedAt: null,
    paidAt: null,
    createdAt: '2026-08-24T12:00:00Z',
    updatedAt: '2026-08-24T12:00:00Z',
    milestones: [
      {
        id: 'm1',
        seq: 1,
        title: '第一版可玩原型',
        description: '基础玩法可运行',
        deliverableUrl: '/api/milestones/m1/files/index.html',
        isFinal: false,
        status: 'submitted',
        feedback: null,
        submittedAt: '2026-08-24T13:00:00Z',
        approvedAt: null,
      },
    ],
    ...overrides,
  };
}

function renderContract(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/contracts/:id" element={<ContractDetailPage />} />
    </Routes>,
    path,
  );
}

function seedLoad(contract: ContractDetail) {
  mocked.contractDetail.mockResolvedValue({ contract });
  mocked.commissionDetail.mockResolvedValue({ commission: makeCommission() });
}

describe('ContractDetailPage（接单交付）', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('状态 Stepper 六词 + 托管条（金额/阶段/钱在谁手里/到账）', async () => {
    loginAs(['buyer'], 'u-buyer');
    seedLoad(makeContract());
    renderContract('/contracts/k1');

    expect(await screen.findByRole('heading', { level: 1, name: '帮我做一个课堂小游戏' })).toBeInTheDocument();
    // 六词 Stepper（词汇表 §3 ★）
    for (const word of ['投标', '被选中', '进行中', '里程碑提交', '买家验收', '结算']) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
    // 状态徽章（同一状态词）
    expect(screen.getAllByTitle('milestone submission').length).toBeGreaterThan(0);
    // 托管条：金额 + 钱在谁手里
    expect(screen.getAllByText('1500 CR').length).toBeGreaterThan(0);
    expect(screen.getByText(/平台托管账户/)).toBeInTheDocument();
  });

  it('buyer：提交中的里程碑 → 确认通过（approve）与要求修改（意见必填）', async () => {
    loginAs(['buyer'], 'u-buyer');
    seedLoad(makeContract());
    mocked.approveMilestone.mockResolvedValue({ contract: makeContract() });
    mocked.requestRevision.mockResolvedValue({ contract: makeContract() });

    const user = userEvent.setup();
    renderContract('/contracts/k1');
    await screen.findByText(/第一版可玩原型/);

    // 打回：意见必填（按钮禁用 + 说明）
    await user.click(screen.getByRole('button', { name: '要求修改' }));
    const dialog = await screen.findByRole('dialog', { name: '要求修改' });
    expect(within(dialog).getByRole('button', { name: '确认要求修改' })).toBeDisabled();
    expect(screen.getByText('修改意见必填（打回必须说明原因）')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('修改意见（必填）'), { target: { value: '计分功能未实现' } });
    await user.click(within(dialog).getByRole('button', { name: '确认要求修改' }));
    await waitFor(() => expect(mocked.requestRevision).toHaveBeenCalledWith('m1', '计分功能未实现'));

    // 确认通过
    await user.click(screen.getByRole('button', { name: '确认通过' }));
    await waitFor(() => expect(mocked.approveMilestone).toHaveBeenCalledWith('m1'));
  });

  it('buyer：buyer acceptance → 放款二次确认；**未预览交付物时按钮禁用**（§5.2）', async () => {
    loginAs(['buyer'], 'u-buyer');
    seedLoad(
      makeContract({
        status: 'buyer acceptance',
        milestones: [
          {
            id: 'm1',
            seq: 1,
            title: '最终版',
            description: '全部完成',
            deliverableUrl: '/api/milestones/m1/files/index.html',
            isFinal: true,
            status: 'approved',
            feedback: null,
            submittedAt: '2026-08-24T13:00:00Z',
            approvedAt: '2026-08-24T14:00:00Z',
          },
        ],
      }),
    );
    mocked.payout.mockResolvedValue({
      contract: makeContract({ status: 'payout', escrowStatus: 'released', paidAt: 't' }),
      contractorBalanceAfterCr: 2000,
    });

    const user = userEvent.setup();
    renderContract('/contracts/k1');
    await screen.findByText('最终验收');

    await user.click(screen.getByRole('button', { name: '确认放款' }));
    const dialog = await screen.findByRole('dialog', { name: '确认放款' });
    expect(within(dialog).getByText(/此操作不可撤回/)).toBeInTheDocument();
    // 未预览 → 确认放款禁用 + 附说明
    const confirmBtn = within(dialog).getByRole('button', { name: '确认放款' });
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/请先预览最终交付物/)).toBeInTheDocument();

    // 关闭 → 先看交付物（预览面板出现）→ 再放款可用
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: /查看最终交付物/ }));
    expect(await screen.findByTestId('deliverable-preview-frame')).toBeInTheDocument();
    expect(screen.getByText(/对照验收标准逐项检查/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认放款' }));
    const dialog2 = await screen.findByRole('dialog', { name: '确认放款' });
    await user.click(within(dialog2).getByRole('button', { name: '确认放款' }));
    await waitFor(() => expect(mocked.payout).toHaveBeenCalledWith('k1'));
  });

  it('contractor：提交里程碑（multipart 表单 + FileDropzone）', async () => {
    loginAs(['contractor', 'buyer'], 'u-con');
    seedLoad(makeContract({ status: 'in progress' }));
    mocked.milestones.mockReturnValue({
      promise: Promise.resolve({
        milestone: {
          id: 'm2',
          seq: 2,
          title: '第二版',
          description: '加了计分',
          deliverableUrl: null,
          isFinal: false,
          status: 'submitted',
          feedback: null,
          submittedAt: 't',
          approvedAt: null,
        },
      }),
      abort: vi.fn(),
    });

    const user = userEvent.setup();
    renderContract('/contracts/k1');
    await screen.findByRole('heading', { name: '提交里程碑' });

    await user.type(screen.getByLabelText('标题 （必填）'), '第二版');
    await user.type(screen.getByLabelText('描述 （必填）'), '加了计分');
    const file = new File(['<h1>v2</h1>'], 'v2.html', { type: 'text/html' });
    await user.upload(screen.getByLabelText('选择作品文件（.html / .htm / .zip）'), file);
    expect(await screen.findByTestId('dropzone-ready')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '提交里程碑' }));
    await waitFor(() => expect(mocked.milestones).toHaveBeenCalledTimes(1));
    const fd = mocked.milestones.mock.calls[0][1] as FormData;
    expect(fd.get('title')).toBe('第二版');
    expect(fd.get('description')).toBe('加了计分');
    expect(fd.get('final')).toBe('false');
    expect(fd.get('file')).toBe(file);
  });
});
