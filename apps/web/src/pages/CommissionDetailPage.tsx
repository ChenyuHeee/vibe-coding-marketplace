/**
 * CommissionDetailPage —— 需求详情（区域 4/5）
 *
 * - 完整信息 + **验收标准锁定展示**（Lock 图标 + 「发布后不可修改」+ tooltip +
 *   criteriaHash，字段只读，DESIGN_SYSTEM §5.2）；
 * - 参考作品链接 → 详情页；
 * - 投标列表（contractor 名 / 报价 num / 方案 / 状态徽章）；
 * - **买家视角**（需求发布者 & open）：选中投标 ConfirmDialog（金额 + 预算进托管说明）
 *   → POST /select → POST /contracts/:id/start；
 * - **contractor 视角**（open）：投标表单（金额在预算区间内校验 + 方案必填；
 *   已投过显示「我的投标」状态徽章）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Coins,
  Gavel,
  Link2,
  Loader2,
  Lock,
  LogIn,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { commissionApi, contractApi } from '../api/commission';
import { criteriaLines } from '../lib/criteria';
import { formatCr } from '../lib/format';
import type { CommissionBidItem, CommissionDetail } from '../types/commission';

export function CommissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [commission, setCommission] = useState<CommissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // contractor 投标表单
  const [bidAmount, setBidAmount] = useState('');
  const [bidProposal, setBidProposal] = useState('');
  const [bidErrors, setBidErrors] = useState<Record<string, string>>({});
  const [bidding, setBidding] = useState(false);

  // buyer 选中弹窗
  const [selectingBid, setSelectingBid] = useState<CommissionBidItem | null>(null);
  const [selecting, setSelecting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await commissionApi.detail(id);
      setCommission(res.commission);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载需求失败。');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;

  if (loading) {
    return (
      <div className="page" aria-busy="true" role="status">
        <Skeleton width={200} height={24} />
        <Skeleton width="100%" height={160} />
        <Skeleton width="100%" height={120} />
      </div>
    );
  }

  if (error || !commission) {
    return (
      <div className="page">
        <ErrorBanner
          title="加载需求失败"
          reason={error ?? '需求不存在或已删除。'}
          nextStep="返回需求板，或点击重试。"
          actions={[
            { label: '重试', onClick: () => void load() },
            { label: '返回需求板', variant: 'secondary', onClick: () => navigate('/commissions') },
          ]}
        />
      </div>
    );
  }

  const isBuyerOf = Boolean(user && commission.buyer.id === user.id);
  const isContractor = Boolean(user && user.roles.includes('contractor'));
  const myBid = user ? commission.bids.find((b) => b.contractor.id === user.id) : undefined;
  // 已投过（submitted/selected）→ 显示我的投标徽章，不再显示投标表单（一人一单一标）
  const alreadyBid = Boolean(myBid && (myBid.status === 'submitted' || myBid.status === 'selected'));
  const canBid = isContractor && !isBuyerOf && commission.status === 'open' && !alreadyBid;
  const canSelect = isBuyerOf && commission.status === 'open';

  const handleBid = async () => {
    const errs: Record<string, string> = {};
    const amount = Number(bidAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      errs.amount = '报价必须是大于 0 的整数。';
    } else if (amount < commission.budgetMinCr || amount > commission.budgetMaxCr) {
      errs.amount = `报价必须在预算区间 ${formatCr(commission.budgetMinCr)} – ${formatCr(commission.budgetMaxCr)} 内。`;
    }
    if (!bidProposal.trim()) errs.proposal = '方案说明不能为空。';
    setBidErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBidding(true);
    try {
      await commissionApi.bid(id, { amountCr: amount, proposal: bidProposal.trim() });
      showToast('投标成功，等待买家筛选', { tone: 'success' });
      setBidAmount('');
      setBidProposal('');
      await load();
    } catch (err) {
      // 错误三件事：出了什么错（后端 message）+ 为什么 + 下一步怎么办
      const e = err as { code?: string; message?: string };
      if (e.code === 'CONFLICT') {
        // 一人一单一标：刷新后下方展示「我的投标」状态徽章
        showToast(`${e.message ?? '你已对该需求投过标。'}下一步：可在下方查看我的投标状态。`, {
          tone: 'warning',
          action: { label: '查看我的投标', onClick: () => void load() },
        });
        await load();
      } else {
        showToast(`${e.message ?? '投标失败。'}下一步：稍后重试，或换一个需求投标。`, { tone: 'warning' });
      }
    } finally {
      setBidding(false);
    }
  };

  const handleSelect = async () => {
    if (!selectingBid) return;
    setSelecting(true);
    try {
      // 选中 → 生成合同（selected / escrow none）
      const { contract } = await commissionApi.select(id, selectingBid.id);
      // 启动合同：预算进托管（selected → in progress，escrow held）
      await contractApi.start(contract.id);
      showToast('已选中投标，预算进入托管，合同已启动', { tone: 'success' });
      setSelectingBid(null);
      navigate(`/contracts/${contract.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '选中失败', { tone: 'warning' });
    } finally {
      setSelecting(false);
    }
  };

  return (
    <div className="page commission-detail">
      <Link to="/commissions" className="commission-detail__back text-body-sm">
        <ArrowLeft size={16} aria-hidden="true" /> 返回需求板
      </Link>

      <div className="commission-detail__head">
        <h1 className="text-h1 page__title">{commission.title}</h1>
        <StatusBadge status={commission.status} />
      </div>

      <dl className="commission-detail__meta">
        <div>
          <dt>预算区间</dt>
          <dd className="num">
            {formatCr(commission.budgetMinCr)} – {formatCr(commission.budgetMaxCr)}
          </dd>
        </div>
        <div>
          <dt>时间线</dt>
          <dd>
            <CalendarClock size={14} aria-hidden="true" /> {commission.timelineDays} 天
          </dd>
        </div>
        <div>
          <dt>发布者</dt>
          <dd>{commission.buyer.displayName}</dd>
        </div>
        <div>
          <dt>投标数</dt>
          <dd>
            <Gavel size={14} aria-hidden="true" /> {commission.bidCount}
          </dd>
        </div>
      </dl>

      <section className="card commission-detail__desc">
        <h2 className="text-h2 commission-detail__section-title">需求描述</h2>
        <p className="commission-detail__desc-text text-body-sm">{commission.description}</p>
      </section>

      {/* 验收标准：锁定展示（§5.2 视觉规格） */}
      <section className="card commission-detail__criteria" aria-label="验收标准（已锁定）">
        <h2 className="text-h2 commission-detail__section-title">
          验收标准
          <span
            className="commission-detail__lock"
            title="验收标准发布时已锁定：任何一方都不可单方面修改。如需变更，请联系接单者协商，双方同意后由平台记录变更。"
          >
            <Lock size={14} aria-hidden="true" />
            <span className="text-caption">已锁定 · 不可修改</span>
          </span>
        </h2>
        <ul className="commission-detail__criteria-list">
          {criteriaLines(commission.acceptanceCriteria).map((line, i) => (
            <li key={`${line}-${i}`} className="text-body-sm">
              {line}
            </li>
          ))}
        </ul>
        <p className="text-caption text-tertiary commission-detail__hash">
          锁定校验值：{commission.criteriaHash}
        </p>
      </section>

      {commission.referenceProjects.length > 0 && (
        <section className="card commission-detail__refs">
          <h2 className="text-h2 commission-detail__section-title">
            参考作品
            <span className="text-caption text-tertiary"> · 已上架作品，可试玩</span>
          </h2>
          <ul className="commission-detail__ref-list">
            {commission.referenceProjects.map((p) => (
              <li key={p.id}>
                <Link to={`/project/${p.id}`} className="commission-detail__ref-link text-body-sm">
                  <Link2 size={14} aria-hidden="true" /> {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 投标区（未登录：引导登录查看，不渲染空态 —— 后端对匿名返回 bids:[] 但 bidCount 为真实值） */}
      <section className="commission-detail__bids" aria-label="投标列表">
        <h2 className="text-h2 commission-detail__section-title">投标（{commission.bidCount}）</h2>

        {!user ? (
          <div className="commission-detail__login" role="status">
            <span className="commission-detail__login-icon" aria-hidden="true">
              <LogIn size={24} />
            </span>
            <div>
              <p className="text-body">
                <strong>登录后查看投标列表</strong>
              </p>
              <p className="text-body-sm text-secondary">
                投标信息仅对登录用户可见；登录后可作为接单者投标，或（发布者）查看报价并选中。
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/login', { state: { from: location.pathname } })}
            >
              <LogIn size={16} aria-hidden="true" /> 去登录
            </button>
          </div>
        ) : commission.bids.length === 0 ? (
          <EmptyState
            icon={Gavel}
            tone="info"
            title="还没有投标"
            description="等待接单者投标。发布者可分享需求链接吸引更多接单者。"
            actionLabel="复制链接分享"
            onAction={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/commissions/${id}`).then(
                () => showToast('链接已复制', { tone: 'success' }),
                () => showToast('复制失败', { tone: 'warning' }),
              );
            }}
          />
        ) : (
          <ul className="commission-detail__bid-list">
            {commission.bids.map((bid) => (
              <li key={bid.id} className="card commission-bid">
                <div className="commission-bid__main">
                  <p className="text-body-sm">
                    <strong>{bid.contractor.displayName}</strong>
                    <span className="commission-bid__amount num"> · {formatCr(bid.amountCr)}</span>
                    <StatusBadge status={bid.status} />
                  </p>
                  <p className="commission-bid__proposal text-body-sm text-secondary">{bid.proposal}</p>
                  <time className="text-caption text-tertiary" dateTime={bid.createdAt}>
                    {new Date(bid.createdAt).toLocaleString()}
                  </time>
                </div>
                {canSelect && bid.status === 'submitted' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setSelectingBid(bid)}
                    disabled={selecting}
                  >
                    选中
                  </button>
                )}
                {myBid && myBid.id === bid.id && (
                  <span className="text-caption commission-bid__mine">我的投标</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* contractor 投标表单 */}
        {canBid && (
          <div className="card commission-bid-form" aria-label="投标表单">
            <h3 className="text-h3">投标</h3>
            <div className="commission-bid-form__row">
              <div className="form-field">
                <label className="form-label" htmlFor="bid-amount">
                  报价（CR） <span className="text-tertiary">（预算区间 {formatCr(commission.budgetMinCr)} – {formatCr(commission.budgetMaxCr)}）</span>
                </label>
                <input
                  id="bid-amount"
                  type="number"
                  min={commission.budgetMinCr}
                  max={commission.budgetMaxCr}
                  step={1}
                  className="form-input"
                  value={bidAmount}
                  placeholder="报价必须在预算区间内"
                  onChange={(e) => setBidAmount(e.target.value)}
                  disabled={bidding}
                />
                {bidErrors.amount && (
                  <p className="form-error">
                    <AlertCircle size={14} aria-hidden="true" /> {bidErrors.amount}
                  </p>
                )}
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="bid-proposal">
                方案说明 <span className="text-tertiary">（必填）</span>
              </label>
              <textarea
                id="bid-proposal"
                className="form-input commission-bid-form__proposal"
                rows={3}
                value={bidProposal}
                placeholder="例如：做过 3 款小游戏，先交付可玩版本，按验收标准迭代…"
                onChange={(e) => setBidProposal(e.target.value)}
                disabled={bidding}
              />
              {bidErrors.proposal && (
                <p className="form-error">
                  <AlertCircle size={14} aria-hidden="true" /> {bidErrors.proposal}
                </p>
              )}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void handleBid()} disabled={bidding}>
              {bidding ? <Loader2 className="btn__spinner" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              提交投标
            </button>
          </div>
        )}

        {/* 已投过：我的投标状态徽章（不再显示表单） */}
        {alreadyBid && myBid && (
          <p className="commission-detail__mybid text-body-sm" role="status">
            你已对这条需求投标：
            <StatusBadge status={myBid.status} />
          </p>
        )}
      </section>

      {/* 选中投标：二次确认（金额 + 预算进托管说明） */}
      <ConfirmDialog
        open={Boolean(selectingBid)}
        title="选中该投标"
        confirmLabel={selecting ? '处理中…' : '确认选中并启动'}
        onConfirm={() => void handleSelect()}
        onCancel={() => setSelectingBid(null)}
        confirmTone="brand"
        confirmDisabled={selecting}
        consequences={
          <div className="select-bid-dialog">
            {selectingBid && (
              <>
                <p className="text-body-sm">
                  将选中 <strong>{selectingBid.contractor.displayName}</strong> 的投标：
                  <span className="num select-bid-dialog__amount">{formatCr(selectingBid.amountCr)}</span>
                </p>
                <p className="text-body-sm">
                  <Coins size={14} aria-hidden="true" /> 选中后将从你的余额中<strong>托管 {formatCr(selectingBid.amountCr)}</strong>（进入平台托管账户，双方都不可动用）。
                </p>
                <p className="text-body-sm text-secondary">
                  接单者开始执行后，验收通过即放款；验收不通过可要求修改（修改意见必填）。
                </p>
              </>
            )}
          </div>
        }
      />
    </div>
  );
}
