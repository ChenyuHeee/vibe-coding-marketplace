/**
 * EscrowStatusBar —— 托管状态条（DESIGN_SYSTEM §8 #5 简化版 / §9 区域 5 要点 4）
 *
 * 两个问题一眼可见：**钱在谁手里** / **何时到账**（PRD 区域 6 / 词汇表 §5 速查表）。
 * - 金额（num tabular-nums）
 * - 当前阶段（合同状态 StatusBadge，买卖双方看到同一词）
 * - 钱在谁手里（escrowStatus → 人话映射，词汇表 §3 资金语义）
 * - 预计到账（人话）
 */
import { Landmark, Lock, PiggyBank, Timer } from 'lucide-react';
import type { ContractStatus, EscrowStatus } from '@vibe/shared';
import { StatusBadge } from './StatusBadge';
import { formatCr } from '../lib/format';

/** escrowStatus → 「钱在谁手里 + 何时到账」人话（词汇表 §5 速查表） */
export function escrowExplainer(escrow: EscrowStatus, viewer: 'buyer' | 'contractor'): { holder: string; eta: string } {
  switch (escrow) {
    case 'none':
      return { holder: '尚未托管（在买家自己手里）', eta: '合同启动后进入平台托管' };
    case 'held':
      return {
        holder: '平台托管账户（冻结，双方都不可动用）',
        eta: viewer === 'contractor' ? '验收通过放款后进入我的余额' : '验收通过后放款给接单者',
      };
    case 'released':
      return { holder: viewer === 'contractor' ? '已放款到我的余额' : '已放款给接单者', eta: '已即时到账' };
    case 'refunded':
      return { holder: '已退回买家', eta: '已即时到账' };
  }
}

interface EscrowStatusBarProps {
  amountCr: number;
  contractStatus: ContractStatus;
  escrowStatus: EscrowStatus;
  /** 当前浏览者视角（决定「钱在谁手里」的措辞） */
  viewer: 'buyer' | 'contractor';
}

export function EscrowStatusBar({ amountCr, contractStatus, escrowStatus, viewer }: EscrowStatusBarProps) {
  const { holder, eta } = escrowExplainer(escrowStatus, viewer);

  return (
    <div className="escrow-bar" role="status" aria-label="托管状态">
      <div className="escrow-bar__amount">
        <span className="escrow-bar__label text-caption text-tertiary">托管金额</span>
        <span className="num escrow-bar__value">{formatCr(amountCr)}</span>
      </div>
      <div className="escrow-bar__item">
        <span className="escrow-bar__label text-caption text-tertiary">当前阶段</span>
        <StatusBadge status={contractStatus} />
      </div>
      <div className="escrow-bar__item">
        <span className="escrow-bar__label text-caption text-tertiary">钱在谁手里</span>
        <span className="escrow-bar__holder text-body-sm">
          <Lock size={14} aria-hidden="true" /> {holder}
        </span>
      </div>
      <div className="escrow-bar__item">
        <span className="escrow-bar__label text-caption text-tertiary">预计到账</span>
        <span className="escrow-bar__eta text-body-sm">
          <Timer size={14} aria-hidden="true" /> {eta}
        </span>
      </div>
      <div className="escrow-bar__item" aria-hidden="true">
        <PiggyBank size={18} className="escrow-bar__deco" />
        <Landmark size={18} className="escrow-bar__deco" />
      </div>
    </div>
  );
}
